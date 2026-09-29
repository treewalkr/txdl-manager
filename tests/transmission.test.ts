import { describe, expect, it, mock } from 'bun:test';
import { TransmissionClient, TransmissionError, type FetchLike } from '../src/lib/server/transmission';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

type FetchCall = [url: string, init?: RequestInit];

/** Mock fetch that replays a scripted sequence of responses, recording every call. */
function scriptedFetch(responses: Array<() => Response>) {
	const calls: FetchCall[] = [];
	const fetchImpl = mock((...args: Parameters<FetchLike>) => {
		calls.push(args as FetchCall);
		const next = responses[Math.min(calls.length - 1, responses.length - 1)];
		return Promise.resolve(next());
	});
	return { fetchImpl, calls };
}

describe('TransmissionClient session handshake', () => {
	it('retries once on 409 with the new session id', async () => {
		const { fetchImpl, calls } = scriptedFetch([
			() => res(409, { result: 'session id mismatch' }, { 'x-transmission-session-id': 'SID-1' }),
			() => res(200, { result: 'success', arguments: { ok: true } })
		]);

		const c = new TransmissionClient({ baseUrl: 'http://x/rpc', fetchImpl });
		await expect(c.rpc('session-get')).resolves.toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		// second call must reuse the cached session id instead of re-handshaking
		const second = await c.rpc('session-get');
		expect(second).toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		const headers = calls[2]?.[1]?.headers as Record<string, string>;
		expect(headers['x-transmission-session-id']).toBe('SID-1');
	});

	it('surfaces non-success results as TransmissionError', async () => {
		const { fetchImpl } = scriptedFetch([() => res(200, { result: 'no torrent found', arguments: {} })]);
		const c = new TransmissionClient({ baseUrl: 'http://x/rpc', fetchImpl });
		await expect(c.rpc('torrent-get')).rejects.toThrow(TransmissionError);
		await expect(c.rpc('torrent-get')).rejects.toThrow(/no torrent found/);
	});

	it('maps network failures to a readable 502 error', async () => {
		const fetchImpl = mock((): Promise<Response> => Promise.reject(new Error('ECONNREFUSED')));
		const c = new TransmissionClient({ baseUrl: 'http://127.0.0.1:1/rpc', fetchImpl });
		const err = (await c.rpc('session-get').catch((e: unknown) => e)) as TransmissionError;
		expect(err).toBeInstanceOf(TransmissionError);
		expect(err.status).toBe(502);
		expect(err.message).toContain('Cannot reach Transmission RPC');
	});

	it('explains 401 auth failures', async () => {
		const { fetchImpl } = scriptedFetch([() => res(401, { result: 'unauthorized' })]);
		const c = new TransmissionClient({ baseUrl: 'http://x/rpc', fetchImpl });
		await expect(c.rpc('session-get')).rejects.toThrow(/401/);
	});
});
