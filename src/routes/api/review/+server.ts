import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteFiles } from '$lib/server/cleanup';
import { env } from '$lib/server/config';
import { fail } from '$lib/server/http';
import { invalidateJunk } from '$lib/server/junk-sweep';
import { pickReviewMedia } from '$lib/server/review';
import { getTorrentDetail, getTorrentDetails, getTorrents, setFilesWanted } from '$lib/server/transmission';
import type { ReviewClearResult } from '$lib/types';

/** The review deck + rejected list across all torrents. */
export const GET: RequestHandler = async () => {
	try {
		const torrents = await getTorrents();
		const details =
			torrents.length > 0 ? await getTorrentDetails(torrents.map((t) => t.id)) : [];
		return json(pickReviewMedia(details, env().mappings));
	} catch (e) {
		return fail(e);
	}
};

/**
 * Clear rejected media: per torrent, deselect the files (idempotent sync with
 * Transmission), re-fetch fresh state, then delete them from disk. Torrents
 * whose location blocks deletion are skipped with a reason — their files stay
 * deselected, so the per-torrent junk cleanup can finish the job later.
 */
export const POST: RequestHandler = async ({ request }) => {
	let items: { id: number; index: number }[] = [];
	try {
		const body = (await request.json()) as { items?: unknown };
		if (Array.isArray(body.items)) {
			items = body.items
				.map((v) => v as { id?: unknown; index?: unknown })
				.filter((v) => Number.isInteger(v.id) && Number.isInteger(v.index) && (v.id as number) >= 0 && (v.index as number) >= 0)
				.map((v) => ({ id: v.id as number, index: v.index as number }));
		}
	} catch {
		// fall through — an empty/invalid body is rejected below
	}
	if (items.length === 0) return json({ error: 'no items to clear' }, { status: 400 });

	const result: ReviewClearResult = { deleted: 0, freed: 0, failed: [], skipped: [] };
	try {
		const byTorrent = new Map<number, number[]>();
		for (const { id, index } of items) {
			const list = byTorrent.get(id) ?? [];
			list.push(index);
			byTorrent.set(id, list);
		}

		for (const [id, indices] of byTorrent) {
			// never act on stale UI state: deselect, re-fetch, then delete
			if (!(await getTorrentDetail(id))) {
				result.skipped.push({ torrent: `#${id}`, reason: 'torrent not found (removed?)' });
				continue;
			}
			await setFilesWanted(id, indices, false);
			const detail = await getTorrentDetail(id);
			if (!detail) {
				result.skipped.push({ torrent: `#${id}`, reason: 'torrent vanished while clearing' });
				continue;
			}

			const del = await deleteFiles(detail, indices);
			if (del.blocked) {
				result.skipped.push({
					torrent: detail.name,
					reason: `"${detail.downloadDir}" is not mapped/enabled for cleanup — file(s) deselected, delete skipped`
				});
				continue;
			}
			result.deleted += del.deleted;
			result.freed += del.freed;
			result.failed.push(...del.failed);
			invalidateJunk([id]); // the sweep cache can't see the disk change itself
		}
		return json(result);
	} catch (e) {
		return fail(e);
	}
};
