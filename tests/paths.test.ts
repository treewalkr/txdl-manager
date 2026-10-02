import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, realpath, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PathMapping } from '../src/lib/server/config';
import {
	isInsideRoot,
	mapHostPath,
	PathEscapeError,
	resolveContained,
	UnmappedPathError
} from '../src/lib/server/paths';

// the legacy translated pair (dev:mock: /mock-downloads → ./dev-fixtures)
const translated: PathMapping[] = [{ hostRoot: '/Users/me/Downloads', dataRoot: '/data' }];
// same-path mounts from HOST_DOWNLOAD_ROOTS
const identity: PathMapping[] = [
	{ hostRoot: '/Users/me', dataRoot: '/Users/me' },
	{ hostRoot: '/Volumes', dataRoot: '/Volumes' }
];
const all: PathMapping[] = [...translated, ...identity];

describe('mapHostPath', () => {
	it('maps paths under a translated host root onto its data root', () => {
		expect(mapHostPath('/Users/me/Downloads/foo/bar.mkv', translated)).toBe('/data/foo/bar.mkv');
	});

	it('maps the translated host root itself to the data root', () => {
		expect(mapHostPath('/Users/me/Downloads', translated)).toBe('/data');
	});

	it('passes through paths already given container-side', () => {
		expect(mapHostPath('/data/foo', translated)).toBe('/data/foo');
	});

	it('passes identity-root paths through unchanged', () => {
		expect(mapHostPath('/Users/me/temp/x.mkv', identity)).toBe('/Users/me/temp/x.mkv');
		expect(mapHostPath('/Volumes/One Touch/t/a.mkv', identity)).toBe('/Volumes/One Touch/t/a.mkv');
		expect(mapHostPath('/Users/me', identity)).toBe('/Users/me');
	});

	it('prefers the translated pair over a broader identity root', () => {
		expect(mapHostPath('/Users/me/Downloads/a', all)).toBe('/data/a');
	});

	it('rejects paths outside every mapping', () => {
		expect(() => mapHostPath('/etc/passwd', all)).toThrow(UnmappedPathError);
		expect(() => mapHostPath('/etc/passwd', [])).toThrow(UnmappedPathError);
	});

	it('normalizes traversal attempts before the containment check', () => {
		expect(() => mapHostPath('/Users/me/Downloads/../../etc/passwd', all)).toThrow(
			UnmappedPathError
		);
	});

	it('does not match a sibling directory sharing a prefix', () => {
		// under the translated pair alone this must fail; via the broad identity
		// root it legitimately maps (unchanged) — prefix != containment either way
		expect(() => mapHostPath('/Users/me/Downloads-other/evil', translated)).toThrow(
			UnmappedPathError
		);
		expect(mapHostPath('/Users/me/Downloads-other/evil', identity)).toBe(
			'/Users/me/Downloads-other/evil'
		);
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
			const secretFile = join(outside, 'secret');
			await writeFile(secretFile, 'x');
			await symlink(secretFile, join(root, 'escape'));
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
