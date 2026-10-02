import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { publicConfig } from '$lib/server/config';
import { getHrState } from '$lib/server/hr-state';
import { getLocations } from '$lib/server/locations';
import { getSession, getTorrents } from '$lib/server/transmission';

export const GET: RequestHandler = async () => {
	try {
		const [session, torrents, hr, locations] = await Promise.all([
			getSession(),
			getTorrents(),
			getHrState(),
			getLocations()
		]);
		torrents.sort((a, b) => b.activityDate - a.activityDate);
		return json({ session, torrents, config: publicConfig(), hr, locations });
	} catch (e) {
		return fail(e);
	}
};
