import type { PageServerLoad } from './$types';
import { PathEscapeError, UnmappedPathError } from '$lib/server/paths';
import {
	StreamError,
	decideMode,
	ffmpegAvailable,
	probeMedia,
	resolveStreamFile,
	type StreamMode
} from '$lib/server/streaming';
import { getTorrentDetail } from '$lib/server/transmission';

// Playback problems render as an in-page terminal pane, not an error page, so
// every branch returns the same shape (null fields on failure).
export const load: PageServerLoad = async ({ params, url }) => {
	const id = Number(params.id);
	const index = Number(url.searchParams.get('file') ?? '0');

	const failed = (message: string, hint?: string) => ({
		problem: hint ? { message, hint } : { message },
		torrent: null,
		index: 0,
		fileName: '',
		sizeBytes: 0,
		mode: null as StreamMode | null,
		durationSec: null as number | null,
		ffmpeg: false
	});

	if (!Number.isInteger(id) || id < 0 || !Number.isInteger(index) || index < 0) {
		return failed('Invalid torrent or file reference.');
	}

	let detail = null;
	try {
		detail = await getTorrentDetail(id);
	} catch {
		return failed('Transmission is unreachable right now.');
	}
	if (!detail) return failed('Torrent not found — it may have been removed.');

	try {
		const { file, path } = await resolveStreamFile(detail, index);
		const [probe, ffmpeg] = await Promise.all([probeMedia(path), ffmpegAvailable()]);
		const mode: StreamMode = decideMode(file.name, probe, ffmpeg);
		return {
			problem:
				mode === 'unsupported'
					? {
							message: 'This format needs ffmpeg on the server to play in the browser.',
							hint: 'The Docker image bundles ffmpeg; for dev runs: brew install ffmpeg.'
						}
					: null,
			torrent: {
				id: detail.id,
				name: detail.name,
				hashString: detail.hashString,
				downloadDir: detail.downloadDir
			},
			index,
			fileName: file.name.split('/').pop() || file.name,
			sizeBytes: file.length,
			mode,
			durationSec: probe?.durationSec ?? null,
			ffmpeg
		};
	} catch (e) {
		if (e instanceof StreamError) return failed(e.message);
		if (e instanceof UnmappedPathError) {
			return failed(
				e.message,
				'Set HOST_DOWNLOAD_DIR in .env to the path Transmission uses and mount it into the app (see docker-compose.yml). Files moved somewhere unmapped (e.g. the HDD) cannot be played.'
			);
		}
		if (e instanceof PathEscapeError) return failed(e.message);
		return failed('Could not open this file for playback.');
	}
};
