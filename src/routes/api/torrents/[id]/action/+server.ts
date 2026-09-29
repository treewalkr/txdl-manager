import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import {
	removeTorrents,
	setFilesWanted,
	setLocation,
	startTorrents,
	stopTorrents,
	verifyTorrents
} from '$lib/server/transmission';

export const POST: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id < 0) return json({ error: 'invalid id' }, { status: 400 });

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'invalid JSON body' }, { status: 400 });
	}

	try {
		switch (body.action) {
			case 'start':
				await startTorrents([id]);
				return json({ message: 'Started' });
			case 'stop':
				await stopTorrents([id]);
				return json({ message: 'Paused' });
			case 'verify':
				await verifyTorrents([id]);
				return json({ message: 'Verifying…' });
			case 'remove': {
				const deleteData = body.deleteData === true;
				await removeTorrents([id], deleteData);
				return json({ message: deleteData ? 'Removed (data deleted)' : 'Removed from list' });
			}
			case 'move': {
				const location = typeof body.location === 'string' ? body.location.trim() : '';
				if (!location) return json({ error: 'location is required' }, { status: 400 });
				const move = body.move !== false; // default: physically move the data
				await setLocation([id], location, move);
				return json({ message: move ? 'Moving data…' : 'Location updated' });
			}
			case 'set-files': {
				const indices = Array.isArray(body.indices)
					? body.indices.filter((n): n is number => Number.isInteger(n) && n >= 0)
					: [];
				if (indices.length === 0) {
					return json({ error: 'indices must be a non-empty array of file indices' }, { status: 400 });
				}
				await setFilesWanted(id, indices, body.wanted === true);
				return json({ message: body.wanted === true ? 'Files selected' : 'Files deselected' });
			}
			default:
				return json(
					{ error: `unknown action "${String(body.action)}" (expected start|stop|verify|remove|move|set-files)` },
					{ status: 400 }
				);
		}
	} catch (e) {
		return fail(e);
	}
};
