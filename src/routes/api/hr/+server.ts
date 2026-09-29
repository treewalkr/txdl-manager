import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { getHrState, setHrExcluded } from '$lib/server/hr-state';

export const GET: RequestHandler = async () => {
	try {
		return json(await getHrState());
	} catch (e) {
		return fail(e);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json().catch(() => null)) as
			| { id?: unknown; ids?: unknown; op?: unknown }
			| null;
		const rawIds = Array.isArray(body?.ids) ? body.ids : [body?.id];
		const ids = [
			...new Set(
				rawIds.map(Number).filter((n) => Number.isInteger(n) && n >= 0)
			)
		];
		if (ids.length === 0) {
			return json({ error: 'ids must be torrent ids' }, { status: 400 });
		}
		if (body?.op !== 'exclude' && body?.op !== 'include') {
			return json({ error: 'op must be "exclude" or "include"' }, { status: 400 });
		}
		const n = ids.length;
		const state = await setHrExcluded(ids, body.op === 'exclude');
		return json({
			message:
				body.op === 'exclude'
					? n === 1
						? 'Removed from the HR group'
						: `Removed ${n} torrents from the HR group`
					: n === 1
						? 'Following the HR rule again'
						: `${n} torrents following the HR rule again`,
			excluded: state.excluded
		});
	} catch (e) {
		return fail(e);
	}
};
