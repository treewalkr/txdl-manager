import { realpath } from 'node:fs/promises';
import { posix } from 'node:path';
import type { PathMapping } from './config';

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
 * Find the mapping a path belongs to: exact root or strict prefix on the host
 * side first, then — for translated pairs — a path already given container-side.
 * Identity mappings (hostRoot === dataRoot) match both ways unchanged.
 */
export function mappingFor(path: string, mappings: PathMapping[]): PathMapping | null {
	const p = posix.normalize(path);
	for (const m of mappings) {
		const hr = posix.normalize(m.hostRoot);
		if (p === hr || p.startsWith(hr + '/')) return m;
	}
	for (const m of mappings) {
		const dr = posix.normalize(m.dataRoot);
		if (p === dr || p.startsWith(dr + '/')) return m;
	}
	return null;
}

/**
 * Translate a path as Transmission (on the host) sees it into the path as this
 * process sees it. Throws UnmappedPathError when the path is under none of the
 * configured mappings — this is the guard that keeps destructive operations
 * inside the mounted download roots.
 */
export function mapHostPath(hostPath: string, mappings: PathMapping[]): string {
	const mapping = mappingFor(hostPath, mappings);
	if (!mapping) {
		const roots = mappings.map((m) => m.hostRoot);
		throw new UnmappedPathError(
			`"${hostPath}" is outside the mapped download roots${roots.length ? ` (${roots.join(', ')})` : ' (HOST_DOWNLOAD_ROOTS is not set)'}.`
		);
	}
	const p = posix.normalize(hostPath);
	const hr = posix.normalize(mapping.hostRoot);
	const dr = posix.normalize(mapping.dataRoot);
	if (p === hr) return dr;
	if (p.startsWith(hr + '/')) return posix.join(dr, p.slice(hr.length + 1));
	return p; // already container-side
}

/** Pure lexical containment check (both paths normalized, posix). */
export function isInsideRoot(root: string, target: string): boolean {
	const r = posix.normalize(root).replace(/\/+$/, '') || '/';
	const t = posix.normalize(target);
	return t === r || t.startsWith(r + '/');
}

export async function realpathSafe(p: string): Promise<string | null> {
	try {
		return await realpath(p);
	} catch {
		return null;
	}
}

/**
 * Resolve `candidate` and enforce it lives strictly inside `root` (root itself
 * is rejected — we never delete a mount point). Symlinks are resolved before
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
