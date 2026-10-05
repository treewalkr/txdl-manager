import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteJunk, scanJunk } from '$lib/server/cleanup';
import { fail } from '$lib/server/http';
import { invalidateJunk } from '$lib/server/junk-sweep';
import { getTorrentDetail } from '$lib/server/transmission';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 0) return json({ error: 'invalid id' }, { status: 400 });

	let mode = 'scan';
	try {
		const body = (await request.json()) as { mode?: unknown };
		if (body.mode === 'delete') mode = 'delete';
	} catch {
		// empty body defaults to scan
	}

	try {
		// always fetch fresh state: never delete based on stale UI data
		const torrent = await getTorrentDetail(id);
		if (!torrent) return json({ error: 'torrent not found' }, { status: 404 });

		if (mode === 'delete') {
			const result = await deleteJunk(torrent);
			invalidateJunk([id]); // the sweep cache can't see the disk change itself
			return json(result);
		}
		return json(await scanJunk(torrent));
	} catch (e) {
		return fail(e);
	}
};
