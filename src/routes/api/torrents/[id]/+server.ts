import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { getTorrentDetail } from '$lib/server/transmission';

export const GET: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 0) return json({ error: 'invalid id' }, { status: 400 });
	try {
		const torrent = await getTorrentDetail(id);
		if (!torrent) return json({ error: 'torrent not found' }, { status: 404 });
		return json({ torrent });
	} catch (e) {
		return fail(e);
	}
};
