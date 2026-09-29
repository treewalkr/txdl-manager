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
			| { id?: unknown; op?: unknown }
			| null;
		const id = Number(body?.id);
		if (!Number.isInteger(id) || id < 0) {
			return json({ error: 'id must be a torrent id' }, { status: 400 });
		}
		if (body?.op !== 'exclude' && body?.op !== 'include') {
			return json({ error: 'op must be "exclude" or "include"' }, { status: 400 });
		}
		const state = await setHrExcluded(id, body.op === 'exclude');
		return json({
			message:
				body.op === 'exclude'
					? 'Removed from the HR group'
					: 'Following the HR rule again',
			excluded: state.excluded
		});
	} catch (e) {
		return fail(e);
	}
};
