import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$lib/server/config';
import { fail } from '$lib/server/http';
import { getLocations, setLocationEnabled } from '$lib/server/locations';
import { isInsideRoot } from '$lib/server/paths';

export const GET: RequestHandler = async () => {
	try {
		return json(await getLocations());
	} catch (e) {
		return fail(e);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
		const path = typeof body?.path === 'string' ? body.path.trim() : '';
		if (!path.startsWith('/') || path.includes('..')) {
			return json({ error: 'path must be an absolute directory path' }, { status: 400 });
		}
		// enabling is a host-side concept: the location must sit under a mounted root
		const { mappings } = env();
		if (!mappings.some((m) => isInsideRoot(m.hostRoot, path))) {
			return json(
				{ error: `"${path}" is not under any mounted root (HOST_DOWNLOAD_ROOTS)` },
				{ status: 400 }
			);
		}
		const state = await setLocationEnabled(path, true);
		return json({ message: 'Location enabled for cleanup', enabled: state.enabled });
	} catch (e) {
		return fail(e);
	}
};

export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const path = url.searchParams.get('path')?.trim() ?? '';
		if (!path.startsWith('/')) {
			return json({ error: 'path must be an absolute directory path' }, { status: 400 });
		}
		const state = await setLocationEnabled(path, false);
		return json({ message: 'Location disabled', enabled: state.enabled });
	} catch (e) {
		return fail(e);
	}
};
