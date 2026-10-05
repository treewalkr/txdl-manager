import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { sweepJunk } from '$lib/server/junk-sweep';

/** Junk indicators for the torrent list: real reclaimable bytes per torrent. */
export const GET: RequestHandler = async () => {
	try {
		return json({ entries: await sweepJunk() });
	} catch (e) {
		return fail(e);
	}
};
