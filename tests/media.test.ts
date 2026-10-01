import { describe, expect, it } from 'bun:test';
import { extOf, isVideoFile, mimeFor } from '../src/lib/media';

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
