import { realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import { env } from './config';

export class UnmappedPathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnmappedPathError';
	}
}

export class PathEscapeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PathEscapeError';
	}
}

/**
 * Translate a path as Transmission (on the host) sees it into the path as this
 * process sees it. Throws UnmappedPathError when the path is neither under
 * HOST_DOWNLOAD_DIR nor already under DATA_ROOT — this is the guard that keeps
 * destructive operations inside the mounted download directory.
 */
export function mapHostPath(hostPath: string, hostRoot: string, dataRoot: string): string {
	const p = posix.normalize(hostPath);
	const dr = posix.normalize(dataRoot);
	if (hostRoot) {
		const hr = posix.normalize(hostRoot);
		if (p === hr) return dr;
		if (p.startsWith(hr + '/')) return posix.join(dr, p.slice(hr.length + 1));
	}
	if (p === dr || p.startsWith(dr + '/')) return p;
	throw new UnmappedPathError(
		`"${hostPath}" is outside the mapped download directory${hostRoot ? ` "${hostRoot}"` : ' (HOST_DOWNLOAD_DIR is not set)'}.`
	);
}

/** Pure lexical containment check (both paths normalized, posix). */
export function isInsideRoot(root: string, target: string): boolean {
	const r = posix.normalize(root).replace(/\/+$/, '') || '/';
	const t = posix.normalize(target);
	return t === r || t.startsWith(r + '/');
}

async function realpathSafe(p: string): Promise<string | null> {
	try {
		return await realpath(p);
	} catch {
		return null;
	}
}

/**
 * Resolve `candidate` and enforce it lives strictly inside `root` (root itself
 * is rejected — we never delete the mount point). Symlinks are resolved before
 * the check, so a link pointing outside the mount is refused. Returns null when
 * the file no longer exists (already cleaned).
 */
export async function resolveContained(root: string, candidate: string): Promise<string | null> {
	const rootReal = await realpathSafe(root);
	if (!rootReal) throw new PathEscapeError(`data root "${root}" does not exist`);

	const targetReal = await realpathSafe(candidate);
	if (targetReal === null) return null; // vanished: nothing to delete
	if (targetReal === rootReal) {
		throw new PathEscapeError(`refusing to operate on the data root itself ("${candidate}")`);
	}
	if (!isInsideRoot(rootReal, targetReal)) {
		throw new PathEscapeError(
			`refusing to touch "${candidate}": it resolves to "${targetReal}", outside the data root "${rootReal}"`
		);
	}
	return targetReal;
}

/** Map a host path using the current environment configuration. */
export function containerPathFor(hostPath: string): string {
	const c = env();
	return mapHostPath(hostPath, c.hostDownloadDir, c.dataRoot);
}
