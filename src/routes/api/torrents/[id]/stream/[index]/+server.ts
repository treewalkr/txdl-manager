import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mimeFor, isImageFile } from '$lib/media';
import { env } from '$lib/server/config';
import { fail } from '$lib/server/http';
import {
	StreamError,
	buildFfmpegArgs,
	decideMode,
	ffmpegAvailable,
	parseRange,
	probeMedia,
	resolveStreamFile,
	type MediaProbe
} from '$lib/server/streaming';
import { getTorrentDetail } from '$lib/server/transmission';

/** Serve raw bytes for direct-play files, honoring a single Range request. */
async function directResponse(path: string, fileName: string, rangeHeader: string | null): Promise<Response> {
	const st = await stat(path);
	const range = parseRange(rangeHeader, st.size);
	if (range.kind === 'unsatisfiable') {
		return new Response(null, { status: 416, headers: { 'content-range': `bytes */${st.size}` } });
	}
	const headers: Record<string, string> = {
		'content-type': mimeFor(fileName),
		'accept-ranges': 'bytes',
		'cache-control': 'no-store'
	};
	if (range.kind === 'partial') {
		headers['content-range'] = `bytes ${range.start}-${range.end}/${st.size}`;
		headers['content-length'] = String(range.end - range.start + 1);
	} else {
		headers['content-length'] = String(st.size);
	}
	const node =
		range.kind === 'partial'
			? createReadStream(path, { start: range.start, end: range.end })
			: createReadStream(path);
	const body = Readable.toWeb(node) as unknown as BodyInit;
	return new Response(body, { status: range.kind === 'partial' ? 206 : 200, headers });
}

/**
 * Pipe ffmpeg (remux or transcode → fragmented MP4) as the response body.
 * Waits briefly for the first output byte so spawn failures can still answer
 * with a JSON error; the child is killed when the client disconnects.
 */
async function ffmpegResponse(
	path: string,
	startSec: number,
	probe: MediaProbe | null,
	signal: AbortSignal
): Promise<Response> {
	const child = spawn(env().ffmpegPath, buildFfmpegArgs(path, startSec, probe), {
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let stderr = '';
	child.stderr?.on('data', (d: Buffer) => {
		stderr = (stderr + d.toString()).slice(-4000);
	});

	const produced = await new Promise<boolean>((resolve) => {
		let settled = false;
		const done = (ok: boolean) => {
			if (!settled) {
				settled = true;
				resolve(ok);
			}
		};
		child.stdout.once('data', () => done(true));
		child.once('error', () => done(false)); // binary missing / not executable
		child.once('exit', (code) => done(code === 0)); // died before writing anything
		const slowStart = setTimeout(() => done(true), 3_000);
		slowStart.unref();
	});

	if (!produced) {
		child.kill('SIGKILL');
		const tail = stderr.trim().split('\n').slice(-3).join(' ');
		return json({ error: `ffmpeg failed to start${tail ? `: ${tail}` : ''}` }, { status: 500 });
	}

	signal.addEventListener('abort', () => child.kill('SIGKILL'));
	const body = Readable.toWeb(child.stdout) as unknown as BodyInit;
	return new Response(body, {
		status: 200,
		headers: { 'content-type': 'video/mp4', 'cache-control': 'no-store' }
	});
}

export const GET: RequestHandler = async ({ params, request, url }) => {
	const id = Number(params.id);
	const index = Number(params.index);
	if (!Number.isInteger(id) || id < 0 || !Number.isInteger(index) || index < 0) {
		return json({ error: 'invalid torrent id or file index' }, { status: 400 });
	}
	// seek offset for remux/transcode streams (seconds); defensive clamp
	const startSec = Math.max(0, Math.min(Number(url.searchParams.get('t')) || 0, 604_800));

	try {
		const detail = await getTorrentDetail(id);
		if (!detail) return json({ error: 'torrent not found' }, { status: 404 });

		const { file, path } = await resolveStreamFile(detail, index);
		// images are just bytes for an <img> — no probe, no ffmpeg
		if (isImageFile(file.name)) return await directResponse(path, file.name, request.headers.get('range'));

		const [probe, ffmpeg] = await Promise.all([probeMedia(path), ffmpegAvailable()]);
		const mode = decideMode(file.name, probe, ffmpeg);

		if (mode === 'unsupported') {
			return json(
				{
					error:
						'ffmpeg is not installed on the server, so this format cannot play in the browser. The Docker image bundles ffmpeg; for dev runs: brew install ffmpeg.'
				},
				{ status: 503 }
			);
		}
		if (mode === 'direct') return await directResponse(path, file.name, request.headers.get('range'));
		return await ffmpegResponse(path, startSec, probe, request.signal);
	} catch (e) {
		if (e instanceof StreamError) return json({ error: e.message }, { status: e.status });
		return fail(e);
	}
};
