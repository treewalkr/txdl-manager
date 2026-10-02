import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { promisify } from 'node:util';
import { extOf, isImageFile, isPlayableMedia, isVideoFile } from '$lib/media';
import type { Torrent, TorrentFile } from '$lib/types';
import { env } from './config';
import { mapHostPath, mappingFor, resolveContained, UnmappedPathError } from './paths';

const execFileP = promisify(execFile);

/** How a file is delivered to the browser. */
export type StreamMode = 'direct' | 'remux' | 'transcode' | 'unsupported';

/** An error carrying the HTTP status the stream endpoint should answer with. */
export class StreamError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
		this.name = 'StreamError';
	}
}

/* ---------- HTTP Range ---------- */

export type RangeResult =
	| { kind: 'full' } // no usable Range header — send the whole file
	| { kind: 'partial'; start: number; end: number } // inclusive byte range
	| { kind: 'unsatisfiable' }; // start beyond EOF — answer 416

/**
 * Parse a single-range `bytes=` header per RFC 7233. Multi-range and malformed
 * headers are ignored (→ 'full', a legal fallback); only a start beyond EOF is
 * surfaced as 'unsatisfiable' so the caller can answer 416.
 */
export function parseRange(header: string | null | undefined, size: number): RangeResult {
	if (!header) return { kind: 'full' };
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!m) return { kind: 'full' };
	const [, s, e] = m;
	if (s === '' && e === '') return { kind: 'full' };
	if (size <= 0) return { kind: 'unsatisfiable' };
	if (s === '') {
		// suffix form: the last N bytes
		const n = Math.min(Number(e), size);
		if (n === 0) return { kind: 'unsatisfiable' };
		return { kind: 'partial', start: size - n, end: size - 1 };
	}
	const start = Number(s);
	if (start >= size) return { kind: 'unsatisfiable' };
	const end = e === '' ? size - 1 : Math.min(Number(e), size - 1);
	if (end < start) return { kind: 'full' };
	return { kind: 'partial', start, end };
}

/* ---------- ffprobe ---------- */

export interface MediaProbe {
	durationSec: number | null;
	videoCodec: string | null;
	audioCodec: string | null;
	hasAudio: boolean;
	pixFmt: string | null;
}

interface FfprobeJson {
	format?: { duration?: string };
	streams?: { codec_type?: string; codec_name?: string; pix_fmt?: string }[];
}

/** Codec families the browser decodes without help — direct-play eligibility. */
const BROWSER_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const BROWSER_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
/** Codecs ffmpeg may stream-copy while repackaging into fragmented MP4. */
const COPY_VIDEO = new Set(['h264']);
const COPY_AUDIO = new Set(['aac']);
/** Only 8-bit 4:2:0 decodes reliably in browsers — Hi10P/10-bit and 4:2:2/444 need conversion (codec_name alone still says "h264"). */
const BROWSER_PIX_FMT = 'yuv420p';
/** Containers the <video> element reads directly. */
const DIRECT_CONTAINERS = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov']);

const probeCache = new Map<string, { mtimeMs: number; probe: MediaProbe | null }>();

async function runProbe(path: string): Promise<MediaProbe | null> {
	try {
		const { stdout } = await execFileP(
			env().ffprobePath,
			['-v', 'error', '-show_format', '-show_streams', '-of', 'json', '--', path],
			{ timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }
		);
		const j = JSON.parse(stdout) as FfprobeJson;
		const video = j.streams?.find((s) => s.codec_type === 'video');
		const audio = j.streams?.find((s) => s.codec_type === 'audio');
		const duration = Number(j.format?.duration);
		return {
			durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
			videoCodec: video?.codec_name ?? null,
			audioCodec: audio?.codec_name ?? null,
			hasAudio: Boolean(audio),
			pixFmt: video?.pix_fmt ?? null
		};
	} catch {
		return null; // ffprobe missing, unreadable file, timeout — caller degrades
	}
}

/** Probe a file with ffprobe, cached by path + mtime (complete torrent files are immutable). */
export async function probeMedia(path: string): Promise<MediaProbe | null> {
	const st = await stat(path).catch(() => null);
	if (!st) return null;
	const hit = probeCache.get(path);
	if (hit && hit.mtimeMs === st.mtimeMs) return hit.probe;
	const probe = await runProbe(path);
	probeCache.set(path, { mtimeMs: st.mtimeMs, probe });
	return probe;
}

let ffmpegOk: boolean | null = null;

/** Whether the configured ffmpeg binary runs. Cached for the process lifetime. */
export async function ffmpegAvailable(): Promise<boolean> {
	if (ffmpegOk === null) {
		const ok = await new Promise<boolean>((resolve) => {
			execFile(env().ffmpegPath, ['-version'], { timeout: 5_000 }, (err) => resolve(!err));
		});
		ffmpegOk = ok;
		return ok;
	}
	return ffmpegOk;
}

/** Test seam: forget cached tooling checks. */
export function resetToolingCache(): void {
	ffmpegOk = null;
	probeCache.clear();
}

/* ---------- mode decision ---------- */

/**
 * Pick the delivery mode. Direct when the browser reads the container natively
 * (trusted when ffprobe is unavailable — Safari may still play e.g. HEVC);
 * remux when only the container is foreign; transcode when a codec needs
 * converting; unsupported when ffmpeg is missing and the browser can't play
 * the file alone.
 */
export function decideMode(fileName: string, probe: MediaProbe | null, ffmpeg: boolean): StreamMode {
	const ext = extOf(fileName);
	const videoSafe =
		probe !== null &&
		probe.videoCodec !== null &&
		BROWSER_VIDEO.has(probe.videoCodec) &&
		probe.pixFmt === BROWSER_PIX_FMT;
	const audioSafe = probe === null || !probe.hasAudio || BROWSER_AUDIO.has(probe.audioCodec ?? '');
	const codecsSafe = videoSafe && audioSafe;

	if (DIRECT_CONTAINERS.has(ext)) {
		if (probe && !codecsSafe && ffmpeg) return 'transcode';
		return 'direct';
	}
	if (!ffmpeg) return 'unsupported';
	if (!probe) return 'transcode'; // can't verify codecs — assume conversion
	return codecsSafe ? 'remux' : 'transcode';
}

/* ---------- ffmpeg pipeline ---------- */

/**
 * ffmpeg argv that repackages `input` as fragmented MP4 on stdout, starting at
 * `startSec` (input seek — with -c copy it lands on the previous keyframe, so
 * playback begins at or slightly before the requested time). Streams the
 * browser can already decode are copied; the rest are converted. `-readrate`
 * keeps ffmpeg from outrunning the viewer and buffering a whole movie.
 */
export function buildFfmpegArgs(input: string, startSec: number, probe: MediaProbe | null): string[] {
	const videoCopy =
		probe !== null &&
		probe.videoCodec !== null &&
		COPY_VIDEO.has(probe.videoCodec) &&
		probe.pixFmt === BROWSER_PIX_FMT;
	const audioCopy = probe !== null && probe.hasAudio && COPY_AUDIO.has(probe.audioCodec ?? '');

	const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
	if (startSec > 0) args.push('-ss', startSec.toFixed(3));
	args.push('-readrate', '1.5', '-i', input);

	if (videoCopy) args.push('-c:v', 'copy');
	else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p');

	if (probe !== null && !probe.hasAudio) args.push('-an');
	else if (audioCopy) args.push('-c:a', 'copy');
	else args.push('-c:a', 'aac', '-b:a', '192k');

	args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
	return args;
}

/* ---------- playable-file playlist ---------- */

export interface PlayableEntry {
	/** Index into detail.files — the ?file= param of the play route. */
	index: number;
	/** File name relative to the torrent's downloadDir. */
	name: string;
	kind: 'video' | 'image';
	/** Fully downloaded? Incomplete entries are listed but not switchable. */
	complete: boolean;
	length: number;
}

/**
 * The torrent's playable files in torrent order (so numbering matches the
 * detail page's Files table). Incomplete videos/images are included but
 * flagged — the track list shows them dim, the switcher skips them.
 */
export function pickPlayable(detail: Torrent): PlayableEntry[] {
	const out: PlayableEntry[] = [];
	const files = detail.files ?? [];
	const stats = detail.fileStats ?? [];
	for (let i = 0; i < files.length; i++) {
		const f = files[i];
		const kind = isVideoFile(f.name) ? 'video' : isImageFile(f.name) ? 'image' : null;
		if (!kind) continue;
		const completed = stats[i]?.bytesCompleted ?? f.bytesCompleted;
		out.push({ index: i, name: f.name, kind, complete: completed >= f.length, length: f.length });
	}
	return out;
}

/* ---------- file resolution ---------- */

export interface StreamFile {
	file: TorrentFile;
	/** Real path inside this process's mount, resolved and containment-checked. */
	path: string;
}

/**
 * Gate-keep a torrent file for playback and locate it on disk: it must be
 * playable media (video or image), fully downloaded (random piece order means
 * partial files have holes), and present inside the mapped download directory.
 */
export async function resolveStreamFile(detail: Torrent, index: number): Promise<StreamFile> {
	const files = detail.files ?? [];
	if (files.length === 0) {
		throw new StreamError('this torrent has no file list yet — magnet metadata may still be downloading', 404);
	}
	const file = files[index];
	if (!file) throw new StreamError(`no file #${index} in this torrent`, 404);
	if (!isPlayableMedia(file.name)) throw new StreamError(`"${file.name}" is not a playable media file`, 400);
	const completed = detail.fileStats?.[index]?.bytesCompleted ?? file.bytesCompleted;
	if (completed < file.length) {
		const pct = file.length > 0 ? Math.floor((completed / file.length) * 100) : 0;
		throw new StreamError(
			`"${file.name}" is only ${pct}% downloaded — playback needs the complete file`,
			409
		);
	}
	const hostPath = posix.join(detail.downloadDir, file.name);
	const { mappings } = env();
	const mapping = mappingFor(hostPath, mappings);
	if (!mapping) {
		throw new UnmappedPathError(`"${hostPath}" is outside the mapped download roots.`);
	}
	const resolved = await resolveContained(mapping.dataRoot, mapHostPath(hostPath, mappings));
	if (!resolved) throw new StreamError(`"${file.name}" is not on disk (moved or deleted?)`, 410);
	return { file, path: resolved };
}
