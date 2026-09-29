export function fmtBytes(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return '0 B';
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
	const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
	const v = n / 1024 ** i;
	return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function fmtSpeed(n: number): string {
	return n > 0 ? `${fmtBytes(n)}/s` : '—';
}

export function fmtPercent(p: number): string {
	return `${(p * 100).toFixed(1)}%`;
}

export function fmtRatio(r: number): string {
	return r >= 0 ? r.toFixed(2) : '—';
}

export function fmtDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '—';
	const s = Math.floor(seconds);
	if (s < 60) return `${s}s`;
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
	if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
	return `${m}m`;
}

export function fmtEta(eta: number): string {
	return eta > 0 ? fmtDuration(eta) : '—';
}

export function fmtDate(epochSeconds: number): string {
	return epochSeconds > 0 ? new Date(epochSeconds * 1000).toLocaleString() : '—';
}
