import { describe, expect, it } from 'bun:test';
import { extOf, isImageFile, isPlayableMedia, isVideoFile, mimeFor } from '../src/lib/media';

describe('isVideoFile', () => {
	it('accepts common video containers, any case', () => {
		for (const n of ['a.mp4', 'A.MKV', 'movie.webm', 'x/y/episode.avi', 'show.s01e01.mkv', 'movie.vob']) {
			expect(isVideoFile(n)).toBe(true);
		}
	});

	it('rejects non-video files and transmission partials', () => {
		for (const n of ['a.txt', 'cover.jpg', 'setup.exe', 'sample.nfo', '', 'movie.mkv.part', 'noext', 'trailing.']) {
			expect(isVideoFile(n)).toBe(false);
		}
	});
});

describe('extOf / mimeFor', () => {
	it('takes the last dot-separated token, lowercased', () => {
		expect(extOf('A.B.MKV')).toBe('mkv');
		expect(extOf('noext')).toBe('');
		expect(extOf('trailing.')).toBe('');
	});

	it('maps known containers, octet-stream otherwise', () => {
		expect(mimeFor('a.mp4')).toBe('video/mp4');
		expect(mimeFor('a.mkv')).toBe('video/x-matroska');
		expect(mimeFor('a.xyz')).toBe('application/octet-stream');
	});
});

describe('isImageFile / isPlayableMedia', () => {
	it('accepts browser-displayable images, any case', () => {
		for (const n of ['cover.jpg', 'PIC2.PNG', 'x/banner.webp', 'anim.gif', 'shot.avif', 'legacy.bmp', 'photo.jpeg']) {
			expect(isImageFile(n)).toBe(true);
		}
	});

	it('excludes svg (same-origin script risk) and heic (undecodable in Chrome/Firefox)', () => {
		expect(isImageFile('icon.svg')).toBe(false);
		expect(isImageFile('img.heic')).toBe(false);
	});

	it('rejects non-images and transmission partials', () => {
		expect(isImageFile('movie.mkv')).toBe(false);
		expect(isImageFile('cover.jpg.part')).toBe(false);
		expect(isImageFile('notes.txt')).toBe(false);
	});

	it('isPlayableMedia is the union of videos and images', () => {
		expect(isPlayableMedia('movie.mkv')).toBe(true);
		expect(isPlayableMedia('cover.jpg')).toBe(true);
		expect(isPlayableMedia('setup.exe')).toBe(false);
		expect(isPlayableMedia('cover.jpg.part')).toBe(false);
	});

	it('maps image MIME types', () => {
		expect(mimeFor('a.jpg')).toBe('image/jpeg');
		expect(mimeFor('a.JPEG')).toBe('image/jpeg');
		expect(mimeFor('a.png')).toBe('image/png');
		expect(mimeFor('a.webp')).toBe('image/webp');
		expect(mimeFor('a.avif')).toBe('image/avif');
	});
});
