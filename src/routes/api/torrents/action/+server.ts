import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import {
	removeTorrents,
	setLocation,
	startTorrents,
	stopTorrents,
	verifyTorrents
} from '$lib/server/transmission';

const plural = (n: number) => (n === 1 ? '1 torrent' : `${n} torrents`);

/** Bulk version of /api/torrents/[id]/action — same ops, `ids` array. */
export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'invalid JSON body' }, { status: 400 });
	}

	const ids = [
		...new Set(
			(Array.isArray(body.ids) ? body.ids : []).filter(
				(n): n is number => Number.isInteger(n) && n >= 0
			)
		)
	];
	if (ids.length === 0) {
		return json({ error: 'ids must be a non-empty array of torrent ids' }, { status: 400 });
	}
	const n = ids.length;

	try {
		switch (body.action) {
			case 'start':
				await startTorrents(ids);
				return json({ message: `Started ${plural(n)}` });
			case 'stop':
				await stopTorrents(ids);
				return json({ message: `Paused ${plural(n)}` });
			case 'verify':
				await verifyTorrents(ids);
				return json({ message: `Verifying ${plural(n)}…` });
			case 'remove': {
				const deleteData = body.deleteData === true;
				await removeTorrents(ids, deleteData);
				return json({
					message: deleteData
						? `Removed ${plural(n)} (data deleted)`
						: `Removed ${plural(n)} from the list`
				});
			}
			case 'move': {
				const location = typeof body.location === 'string' ? body.location.trim() : '';
				if (!location) return json({ error: 'location is required' }, { status: 400 });
				const move = body.move !== false; // default: physically move the data
				await setLocation(ids, location, move);
				return json({
					message: move ? `Moving ${plural(n)}…` : `Location updated for ${plural(n)}`
				});
			}
			default:
				return json(
					{ error: `unknown action "${String(body.action)}" (expected start|stop|verify|remove|move)` },
					{ status: 400 }
				);
		}
	} catch (e) {
		return fail(e);
	}
};
