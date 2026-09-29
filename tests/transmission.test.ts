import { describe, expect, it, vi } from 'vitest';
import { TransmissionClient, TransmissionError } from '../src/lib/server/transmission';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('TransmissionClient session handshake', () => {
	it('retries once on 409 with the new session id', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				res(409, { result: 'session id mismatch' }, { 'x-transmission-session-id': 'SID-1' })
			)
			// fresh Response per call — a Response body can only be read once
			.mockImplementation(() =>
				Promise.resolve(res(200, { result: 'success', arguments: { ok: true } }))
			);

		const c = new TransmissionClient({ baseUrl: 'http://x/rpc', fetchImpl });
		await expect(c.rpc('session-get')).resolves.toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		const second = await c.rpc('session-get');
		expect(second).toEqual({ ok: true });
		expect(fetchImpl).toHaveBeenCalledTimes(3); // no extra 409 the second time
		const headers = (fetchImpl.mock.calls[2]?.[1] as RequestInit).headers as Record<string, string>;
		expect(headers['x-transmission-session-id']).toBe('SID-1');
	});

	it('surfaces non-success results as TransmissionError', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() =>
			Promise.resolve(res(200, { result: 'no torrent found', arguments: {} }))
		);
		const c = new TransmissionClient({ baseUrl: 'http://x/rpc', fetchImpl });
		await expect(c.rpc('torrent-get')).rejects.toThrow(TransmissionError);
		await expect(c.rpc('torrent-get')).rejects.toThrow(/no torrent found/);
	});

	it('maps network failures to a readable 502 error', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'));
		const c = new TransmissionClient({ baseUrl: 'http://127.0.0.1:1/rpc', fetchImpl });
		const err = await c.rpc('session-get').catch((e) => e);
		expect(err).toBeInstanceOf(TransmissionError);
		expect(err.status).toBe(502);
		expect(err.message).toContain('Cannot reach Transmission RPC');
	});

	it('explains 401 auth failures', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(res(401, { result: 'unauthorized' }));
		const c = new TransmissionClient({ baseUrl: 'http://x/rpc', fetchImpl });
		await expect(c.rpc('session-get')).rejects.toThrow(/401/);
	});
});
