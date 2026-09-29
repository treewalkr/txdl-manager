import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { publicConfig } from '$lib/server/config';
import { getHrState } from '$lib/server/hr-state';
import { getSession, getTorrents } from '$lib/server/transmission';

export const GET: RequestHandler = async () => {
	try {
		const [session, torrents, hr] = await Promise.all([
			getSession(),
			getTorrents(),
			getHrState()
		]);
		torrents.sort((a, b) => b.activityDate - a.activityDate);
		return json({ session, torrents, config: publicConfig(), hr });
	} catch (e) {
		return fail(e);
	}
};
