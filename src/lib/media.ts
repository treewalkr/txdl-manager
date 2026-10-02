// Shared (client + server) knowledge about playable media files: which torrent
// files count as video or images, and the MIME type to serve raw bytes as.

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
	rmvb: 'application/vnd.rn-realmedia-vbr',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	bmp: 'image/bmp'
};

// No svg: served same-origin, a crafted one would run script in the app's
// origin. No heic: Chrome/Firefox cannot decode it.
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp']);

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

/** Whether this torrent file is an image we may show in the player. */
export function isImageFile(name: string): boolean {
	if (name.endsWith('.part')) return false;
	return IMAGE_EXTENSIONS.has(extOf(name));
}

/** Anything the play page can present: video or image. */
export function isPlayableMedia(name: string): boolean {
	return isVideoFile(name) || isImageFile(name);
}

export function mimeFor(name: string): string {
	return MIME_BY_EXT[extOf(name)] ?? 'application/octet-stream';
}
