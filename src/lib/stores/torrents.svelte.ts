import type { ClientConfig, CleanupDeleteResult, SessionInfo, Torrent } from '$lib/types';

const POLL_MS = 2000;

class TorrentStore {
	torrents = $state<Torrent[]>([]);
	session = $state<SessionInfo | null>(null);
	config = $state<ClientConfig | null>(null);
	detail = $state<Torrent | null>(null);
	connected = $state(false);
	error = $state<string | null>(null);
	lastUpdated = $state(0);
	flash = $state<{ message: string; tone: 'ok' | 'error' } | null>(null);

	#timer: ReturnType<typeof setInterval> | null = null;
	#inFlight = false;
	#detailId: number | null = null;
	#onVisibility = () => {
		if (document.hidden) this.stopPolling();
		else this.startPolling();
	};

	refresh = async () => {
		if (this.#inFlight) return;
		this.#inFlight = true;
		try {
			const res = await fetch('/api/state');
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
			this.torrents = body.torrents;
			this.session = body.session;
			this.config = body.config;
			this.connected = true;
			this.error = null;
			this.lastUpdated = Date.now();
			if (this.#detailId !== null) void this.refreshDetail(this.#detailId);
		} catch (e) {
			this.connected = false;
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.#inFlight = false;
		}
	};

	refreshDetail = async (id: number) => {
		try {
			const res = await fetch(`/api/torrents/${id}`);
			if (res.status === 404) {
				if (this.#detailId === id) this.detail = null;
				return;
			}
			const body = await res.json();
			if (res.ok && this.#detailId === id) this.detail = body.torrent;
		} catch {
			// transient — the next poll retries
		}
	};

	startPolling = () => {
		if (this.#timer) return;
		this.#timer = setInterval(() => {
			if (!document.hidden) void this.refresh();
		}, POLL_MS);
		document.addEventListener('visibilitychange', this.#onVisibility);
		void this.refresh();
	};

	stopPolling = () => {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
		document.removeEventListener('visibilitychange', this.#onVisibility);
	};

	/** Wire detail-page tracking; pass null when leaving the page. */
	watchDetail = (id: number | null) => {
		this.#detailId = id;
		if (id === null) this.detail = null;
		else void this.refreshDetail(id);
	};

	start = () => {
		this.startPolling();
		return () => this.stopPolling();
	};

	setFlash = (message: string, tone: 'ok' | 'error' = 'ok') => {
		this.flash = { message, tone };
		setTimeout(() => {
			if (this.flash?.message === message) this.flash = null;
		}, 4500);
	};

	act = async (id: number, body: Record<string, unknown>): Promise<boolean> => {
		try {
			const res = await fetch(`/api/torrents/${id}/action`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
			this.setFlash(json?.message ?? 'Done');
			await this.refresh();
			return true;
		} catch (e) {
			this.setFlash(e instanceof Error ? e.message : String(e), 'error');
			return false;
		}
	};

	add = async (url: string): Promise<boolean> => {
		try {
			const res = await fetch('/api/torrents/add', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url })
			});
			const json = await res.json().catch(() => null);
			if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
			this.setFlash(json?.message ?? 'Added');
			await this.refresh();
			return true;
		} catch (e) {
			this.setFlash(e instanceof Error ? e.message : String(e), 'error');
			return false;
		}
	};

	cleanup = async (id: number, mode: 'scan' | 'delete'): Promise<CleanupDeleteResult | null> => {
		try {
			const res = await fetch(`/api/torrents/${id}/cleanup`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mode })
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
			if (mode === 'delete') await this.refresh();
			return json;
		} catch (e) {
			this.setFlash(e instanceof Error ? e.message : String(e), 'error');
			return null;
		}
	};

	byId = (id: number): Torrent | undefined => this.torrents.find((t) => t.id === id);
}

export const store = new TorrentStore();
