import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { addTorrent } from '$lib/server/transmission';

export const POST: RequestHandler = async ({ request }) => {
	let url = '';
	let downloadDir: string | undefined;
	try {
		const body = (await request.json()) as { url?: unknown; downloadDir?: unknown };
		if (typeof body.url === 'string') url = body.url.trim();
		if (typeof body.downloadDir === 'string' && body.downloadDir.trim()) {
			downloadDir = body.downloadDir.trim();
		}
	} catch {
		return json({ error: 'invalid JSON body' }, { status: 400 });
	}
	if (!url) return json({ error: 'url is required (magnet link or .torrent URL)' }, { status: 400 });

	try {
		await addTorrent(url, downloadDir);
		return json({ message: 'Torrent added' });
	} catch (e) {
		return fail(e);
	}
};
