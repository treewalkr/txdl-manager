import type { SessionInfo, Torrent } from '$lib/types';
import { env } from './config';

export class TransmissionError extends Error {
	constructor(
		message: string,
		readonly status: number = 502
	) {
		super(message);
		this.name = 'TransmissionError';
	}
}

export interface ClientOptions {
	baseUrl?: string;
	username?: string;
	password?: string;
	fetchImpl?: typeof fetch;
}

const TORRENT_LIST_FIELDS = [
	'id',
	'name',
	'hashString',
	'status',
	'error',
	'errorString',
	'percentDone',
	'metadataPercentComplete',
	'rateDownload',
	'rateUpload',
	'eta',
	'sizeWhenDone',
	'leftUntilDone',
	'totalSize',
	'uploadedEver',
	'uploadRatio',
	'secondsSeeding',
	'secondsDownloading',
	'isStalled',
	'downloadDir',
	'labels',
	'seedRatioMode',
	'seedRatioLimit',
	'dateAdded',
	'dateDone',
	'activityDate',
	'peersConnected',
	'peersSendingToUs',
	'peersGettingFromUs',
	'queuePosition'
] as const;

const TORRENT_DETAIL_FIELDS = [...TORRENT_LIST_FIELDS, 'files', 'fileStats'] as const;

/** Minimal Transmission RPC client with transparent X-Transmission-Session-Id handling. */
export class TransmissionClient {
	#sessionId: string | null = null;

	constructor(private readonly opts: ClientOptions = {}) {}

	async rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
		const cfg = env();
		const url = this.opts.baseUrl ?? cfg.transmissionUrl;
		const fetchImpl = this.opts.fetchImpl ?? fetch;

		for (let attempt = 0; attempt < 2; attempt++) {
			const headers: Record<string, string> = { 'content-type': 'application/json' };
			if (this.#sessionId) headers['x-transmission-session-id'] = this.#sessionId;
			const username = this.opts.username ?? cfg.rpcUsername;
			const password = this.opts.password ?? cfg.rpcPassword;
			if (username !== undefined) {
				headers['authorization'] = `Basic ${btoa(`${username}:${password ?? ''}`)}`;
			}

			let res: Response;
			try {
				res = await fetchImpl(url, {
					method: 'POST',
					headers,
					body: JSON.stringify({ method, arguments: args }),
					signal: AbortSignal.timeout(10_000)
				});
			} catch (e) {
				const reason = e instanceof Error ? e.message : String(e);
				throw new TransmissionError(
					`Cannot reach Transmission RPC at ${url} (${reason}). Is Transmission running and is the RPC reachable from ${
						import.meta.env.SSR ? 'the server' : 'the client'
					}?`
				);
			}

			if (res.status === 409) {
				const id = res.headers.get('x-transmission-session-id');
				if (id) {
					this.#sessionId = id;
					continue; // retry once with the fresh session id
				}
				throw new TransmissionError('RPC returned 409 without a session id header');
			}

			const body = (await res.json().catch(() => null)) as
				| { result?: string; arguments?: T }
				| null;
			if (res.status === 401) {
				throw new TransmissionError(
					'Transmission rejected the credentials (HTTP 401). If RPC authentication is enabled, set TRANSMISSION_RPC_USERNAME / TRANSMISSION_RPC_PASSWORD.'
				);
			}
			if (!body || body.result !== 'success') {
				throw new TransmissionError(
					`RPC "${method}" failed: ${body?.result ?? `HTTP ${res.status}`}`
				);
			}
			return body.arguments as T;
		}
		throw new TransmissionError('Could not establish a Transmission RPC session after retry');
	}
}

export const client = new TransmissionClient();

export async function getSession(): Promise<SessionInfo> {
	return client.rpc<SessionInfo>('session-get');
}

export async function getTorrents(): Promise<Torrent[]> {
	const r = await client.rpc<{ torrents: Torrent[] }>('torrent-get', {
		fields: [...TORRENT_LIST_FIELDS]
	});
	return r.torrents ?? [];
}

export async function getTorrentDetail(id: number): Promise<Torrent | null> {
	const r = await client.rpc<{ torrents: Torrent[] }>('torrent-get', {
		fields: [...TORRENT_DETAIL_FIELDS],
		ids: [id]
	});
	return r.torrents?.[0] ?? null;
}

export async function setFilesWanted(id: number, indices: number[], wanted: boolean): Promise<void> {
	await client.rpc('torrent-set', {
		ids: [id],
		[wanted ? 'filesWanted' : 'filesUnwanted']: indices
	});
}

export async function removeTorrents(ids: number[], deleteData: boolean): Promise<void> {
	await client.rpc('torrent-remove', { ids, 'delete-local-data': deleteData });
}

export async function setLocation(ids: number[], location: string, move: boolean): Promise<void> {
	await client.rpc('torrent-set-location', { ids, location, move });
}

export async function startTorrents(ids: number[]): Promise<void> {
	await client.rpc('torrent-start', { ids });
}

export async function stopTorrents(ids: number[]): Promise<void> {
	await client.rpc('torrent-stop', { ids });
}

export async function verifyTorrents(ids: number[]): Promise<void> {
	await client.rpc('torrent-verify', { ids });
}

export async function addTorrent(url: string, downloadDir?: string): Promise<number | null> {
	const args: Record<string, unknown> = { url };
	if (downloadDir) args['download-dir'] = downloadDir;
	const r = await client.rpc<{ 'torrent-added'?: { id: number }; 'torrent-duplicate'?: { id: number } }>(
		'torrent-add',
		args
	);
	return r['torrent-added']?.id ?? r['torrent-duplicate']?.id ?? null;
}
