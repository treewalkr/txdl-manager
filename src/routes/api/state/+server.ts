import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fail } from '$lib/server/http';
import { publicConfig } from '$lib/server/config';
import { getSession, getTorrents } from '$lib/server/transmission';

export const GET: RequestHandler = async () => {
	try {
		const [session, torrents] = await Promise.all([getSession(), getTorrents()]);
		torrents.sort((a, b) => b.activityDate - a.activityDate);
		return json({ session, torrents, config: publicConfig() });
	} catch (e) {
		return fail(e);
	}
};
