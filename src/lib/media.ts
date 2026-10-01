// Shared (client + server) knowledge about video files: which torrent files
// count as playable video, and the MIME type to serve raw bytes as.

const VIDEO_EXTENSIONS = new Set([
	'mp4',
	'm4v',
	'webm',
	'ogv',
	'mov',
	'mkv',
	'avi',
	'flv',
	'ts',
	'm2ts',
	'mts',
	'wmv',
	'mpg',
	'mpeg',
	'vob',
	'asf',
	'3gp',
	'divx',
	'rm',
	'rmvb'
]);

const MIME_BY_EXT: Record<string, string> = {
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	webm: 'video/webm',
	ogv: 'video/ogg',
	mov: 'video/quicktime',
	mkv: 'video/x-matroska',
	avi: 'video/x-msvideo',
	flv: 'video/x-flv',
	ts: 'video/mp2t',
	m2ts: 'video/mp2t',
	mts: 'video/mp2t',
	wmv: 'video/x-ms-wmv',
	mpg: 'video/mpeg',
	mpeg: 'video/mpeg',
	vob: 'video/mpeg',
	asf: 'video/x-ms-asf',
	'3gp': 'video/3gpp',
	divx: 'video/x-divx',
	rm: 'application/vnd.rn-realmedia',
	rmvb: 'application/vnd.rn-realmedia-vbr'
};

/** Lowercase extension without the dot ('' when none). */
export function extOf(name: string): string {
	const i = name.lastIndexOf('.');
	if (i < 0 || i === name.length - 1) return '';
	return name.slice(i + 1).toLowerCase();
}

/**
 * Whether this torrent file is a video we may offer to play. Incomplete
 * Transmission files keep a ".part" suffix — never playable.
 */
export function isVideoFile(name: string): boolean {
	if (name.endsWith('.part')) return false;
	return VIDEO_EXTENSIONS.has(extOf(name));
}

export function mimeFor(name: string): string {
	return MIME_BY_EXT[extOf(name)] ?? 'application/octet-stream';
}
