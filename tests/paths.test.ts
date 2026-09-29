import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, realpath, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	isInsideRoot,
	mapHostPath,
	PathEscapeError,
	resolveContained,
	UnmappedPathError
} from '../src/lib/server/paths';

describe('mapHostPath', () => {
	it('maps paths under the host root into the data root', () => {
		expect(mapHostPath('/Users/me/Downloads/foo/bar.mkv', '/Users/me/Downloads', '/data')).toBe(
			'/data/foo/bar.mkv'
		);
	});

	it('maps the host root itself to the data root', () => {
		expect(mapHostPath('/Users/me/Downloads', '/Users/me/Downloads', '/data')).toBe('/data');
	});

	it('passes through paths already under the data root', () => {
		expect(mapHostPath('/data/foo', '', '/data')).toBe('/data/foo');
	});

	it('rejects paths outside the mapping', () => {
		expect(() => mapHostPath('/etc/passwd', '/Users/me/Downloads', '/data')).toThrow(
			UnmappedPathError
		);
		expect(() => mapHostPath('/etc/passwd', '', '/data')).toThrow(UnmappedPathError);
	});

	it('normalizes traversal attempts before the containment check', () => {
		expect(() =>
			mapHostPath('/Users/me/Downloads/../../etc/passwd', '/Users/me/Downloads', '/data')
		).toThrow(UnmappedPathError);
	});

	it('does not match a sibling directory sharing a prefix', () => {
		expect(() =>
			mapHostPath('/Users/me/Downloads-other/evil', '/Users/me/Downloads', '/data')
		).toThrow(UnmappedPathError);
	});
});

describe('isInsideRoot', () => {
	it('accepts the root and nested paths', () => {
		expect(isInsideRoot('/data', '/data')).toBe(true);
		expect(isInsideRoot('/data', '/data/a/b')).toBe(true);
	});

	it('rejects outsiders and prefix tricks', () => {
		expect(isInsideRoot('/data', '/database')).toBe(false);
		expect(isInsideRoot('/data', '/etc')).toBe(false);
	});
});

describe('resolveContained', () => {
	it('resolves existing files inside the root', async () => {
		const root = await mkdtemp(join(tmpdir(), 'txdl-'));
		try {
			await writeFile(join(root, 'a.mkv'), 'x');
			const resolved = await resolveContained(root, join(root, 'a.mkv'));
			expect(resolved).toBeTruthy();
			expect(resolved!.startsWith(await realpath(root))).toBe(true);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('returns null for vanished files', async () => {
		const root = await mkdtemp(join(tmpdir(), 'txdl-'));
		try {
			expect(await resolveContained(root, join(root, 'gone.mkv'))).toBeNull();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('refuses the root itself', async () => {
		const root = await mkdtemp(join(tmpdir(), 'txdl-'));
		try {
			await expect(resolveContained(root, root)).rejects.toThrow(PathEscapeError);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('follows symlinks and refuses escapes', async () => {
		const root = await mkdtemp(join(tmpdir(), 'txdl-'));
		const outside = await mkdtemp(join(tmpdir(), 'txdl-out-'));
		try {
			const secret = join(outside, 'secret');
			await writeFile(secret, 'x');
			await symlink(secret, join(root, 'escape'));
			await expect(resolveContained(root, join(root, 'escape'))).rejects.toThrow(PathEscapeError);
		} finally {
			await rm(root, { recursive: true, force: true });
			await rm(outside, { recursive: true, force: true });
		}
	});

	it('handles deep nesting under the root', async () => {
		const root = await mkdtemp(join(tmpdir(), 'txdl-'));
		try {
			await mkdir(join(root, 'a/b/c'), { recursive: true });
			const p = join(root, 'a/b/c/f.bin');
			await writeFile(p, 'x');
			expect(await resolveContained(root, p)).toBeTruthy();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
