#!/usr/bin/env node
// Dev-only fake Transmission RPC server. Implements just enough of the RPC
// protocol (409 session handshake, torrent-get/set/remove/start/stop/
// set-location/add, session-get) to build and test the UI without a live
// Transmission daemon.
//
//   node scripts/mock-transmission.mjs          # listens on :9092
//   MOCK_PORT=9095 node scripts/mock-transmission.mjs
//
// Pair with the app via env:
//   TRANSMISSION_RPC_URL=http://127.0.0.1:9092/transmission/rpc \
//   HOST_DOWNLOAD_DIR=/mock-downloads DATA_ROOT=./dev-fixtures bun run dev
//
// (9092, not 9091, to avoid colliding with a real Transmission RPC.)

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT ?? 9092);
const HOST = process.env.MOCK_HOST ?? '127.0.0.1';
const SESSION_ID = `mock-session-${crypto.randomBytes(8).toString('hex')}`;
const DOWNLOAD_DIR = process.env.MOCK_DOWNLOAD_DIR ?? '/mock-downloads';
const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

const now = () => Math.floor(Date.now() / 1000);

function makeTorrent(overrides) {
	const base = {
		id: 0,
		name: '',
		hashString: '',
		status: 0, // TR_STATUS.STOPPED
		error: 0,
		errorString: '',
		percentDone: 0,
		metadataPercentComplete: 1,
		rateDownload: 0,
		rateUpload: 0,
		eta: -1,
		sizeWhenDone: 0,
		leftUntilDone: 0,
		totalSize: 0,
		uploadedEver: 0,
		uploadRatio: -1,
		secondsSeeding: 0,
		secondsDownloading: 0,
		isStalled: false,
		downloadDir: DOWNLOAD_DIR,
		labels: [],
		seedRatioMode: 0,
		seedRatioLimit: 2,
		dateAdded: now() - 86400 * 4,
		dateDone: 0,
		activityDate: now(),
		peersConnected: 0,
		peersSendingToUs: 0,
		peersGettingFromUs: 0,
		queuePosition: 0,
		files: [],
		fileStats: []
	};
	return { ...base, ...overrides };
}

function withFiles(t, specs) {
	t.files = specs.map(([name, length, wanted]) => ({
		name,
		length,
		bytesCompleted: wanted === false ? 0 : Math.floor(length * t.percentDone)
	}));
	t.fileStats = specs.map(([name, length, wanted]) => ({
		bytesCompleted: wanted === false ? 0 : Math.floor(length * t.percentDone),
		wanted: wanted !== false,
		priority: 0
	}));
	t.totalSize = specs.reduce((s, [, l]) => s + l, 0);
	t.sizeWhenDone = specs.filter(([, , w]) => w !== false).reduce((s, [, l]) => s + l, 0);
	t.leftUntilDone = Math.round(t.sizeWhenDone * (1 - t.percentDone));
	return t;
}

let torrents = [
	withFiles(
		makeTorrent({
			id: 1,
			name: 'Big.Series.S01.1080p.x264-GROUP',
			hashString: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
			status: 4, // downloading
			percentDone: 0.374,
			rateDownload: 14 * MiB + 312 * 1024,
			rateUpload: 2 * MiB,
			uploadedEver: 890 * MiB,
			uploadRatio: 0.24,
			secondsSeeding: 3600 * 5,
			secondsDownloading: 86400 * 2 + 3600 * 3,
			isStalled: false,
			peersConnected: 14,
			peersSendingToUs: 9,
			peersGettingFromUs: 5,
			queuePosition: 1,
			dateAdded: now() - 86400 * 2 - 3600 * 3,
			eta: 3600 * 7 + 42 * 60
		}),
		[
			['Big.Series.S01.1080p.x264-GROUP/s01e01.mkv', 4 * GiB + 213 * MiB, true],
			['Big.Series.S01.1080p.x264-GROUP/s01e02.mkv', 4 * GiB + 187 * MiB, true],
			['Big.Series.S01.1080p.x264-GROUP/s01e03.mkv', 4 * GiB + 96 * MiB, false], // junk
			['Big.Series.S01.1080p.x264-GROUP/sample/sample.mkv', 78 * MiB, false], // junk
			['Big.Series.S01.1080p.x264-GROUP/proof/proof.nfo', 12 * 1024, false], // junk
			['Big.Series.S01.1080p.x264-GROUP/release.nfo', 9 * 1024, true]
		]
	),
	makeTorrent({
		id: 2,
		name: 'ubuntu-27.04-live-server-amd64.iso',
		hashString: '11223344556677889900aabbccddeeff',
		status: 6, // seeding
		percentDone: 1,
		sizeWhenDone: 3 * GiB + 812 * MiB,
		totalSize: 3 * GiB + 812 * MiB,
		rateUpload: 3 * MiB + 90 * 1024,
		uploadedEver: 24 * GiB + 120 * MiB,
		uploadRatio: 7.3,
		// 20h of the 24h its size bucket requires: a live HR countdown (the tick
		// adds 2s/2s). Still archive-ready via ratio — HR and archive-ready are
		// independent signals.
		secondsSeeding: 3600 * 20,
		peersConnected: 7,
		peersGettingFromUs: 7,
		dateAdded: now() - 86400 * 9,
		dateDone: now() - 3600 * 20,
		files: [{ name: 'ubuntu-27.04-live-server-amd64.iso', length: 3 * GiB + 812 * MiB, bytesCompleted: 3 * GiB + 812 * MiB }],
		fileStats: [{ bytesCompleted: 3 * GiB + 812 * MiB, wanted: true, priority: 0 }]
	}),
	withFiles(
		makeTorrent({
			id: 3,
			name: 'Old.Documentary.Collection.2019',
			hashString: 'deadbeefdeadbeefdeadbeefdeadbeef',
			status: 0, // stopped, done seeding — archive candidate
			percentDone: 1,
			rateUpload: 0,
			uploadedEver: 41 * GiB,
			uploadRatio: 3.9,
			secondsSeeding: 86400 * 12,
			dateAdded: now() - 86400 * 40,
			dateDone: now() - 86400 * 38,
			files_note: 'set below'
		}),
		[
			['Old.Documentary.Collection.2019/part1.avi', 700 * MiB, true],
			['Old.Documentary.Collection.2019/part2.avi', 700 * MiB, true],
			['Old.Documentary.Collection.2019/bonus/deleted-scenes.mkv', 1 * GiB + 40 * MiB, false], // junk
			['Old.Documentary.Collection.2019/subtitles.zip', 84 * MiB, false] // junk
		]
	),
	makeTorrent({
		id: 4,
		name: 'random.mixtape.2026.flac',
		hashString: 'cafebabecafebabecafebabecafebabe',
		status: 0, // paused mid-download
		percentDone: 0.62,
		sizeWhenDone: 620 * MiB,
		totalSize: 620 * MiB,
		leftUntilDone: Math.round(620 * MiB * 0.38),
		uploadedEver: 140 * MiB,
		uploadRatio: 0.36,
		secondsDownloading: 3600 * 9,
		dateAdded: now() - 86400,
		files: [{ name: 'random.mixtape.2026.flac', length: 620 * MiB, bytesCompleted: Math.round(620 * MiB * 0.62) }],
		fileStats: [{ bytesCompleted: Math.round(620 * MiB * 0.62), wanted: true, priority: 0 }]
	})
];

function syncFiles(t) {
	for (let i = 0; i < t.files.length; i++) {
		const done = t.fileStats[i].wanted === false ? 0 : Math.floor(t.files[i].length * t.percentDone);
		t.files[i].bytesCompleted = done;
		t.fileStats[i].bytesCompleted = done;
	}
	t.sizeWhenDone = t.fileStats.filter((s) => s.wanted).reduce((s, f, i) => s + t.files[i].length, 0);
	t.leftUntilDone = Math.max(0, Math.round(t.sizeWhenDone * (1 - t.percentDone)));
	t.totalSize = t.files.reduce((s, f) => s + f.length, 0) || t.totalSize;
}

// Tick: advance the downloading torrent so the UI shows movement.
setInterval(() => {
	for (const t of torrents) {
		t.activityDate = now();
		if (t.status === 4 && t.percentDone < 1) {
			t.percentDone = Math.min(0.999, t.percentDone + 0.0025);
			t.uploadedEver += t.rateUpload;
			syncFiles(t);
			t.eta = Math.max(60, Math.round((1 - t.percentDone) * 86400));
		} else if (t.status === 6) {
			t.uploadedEver += t.rateUpload;
			t.uploadRatio = t.sizeWhenDone > 0 ? t.uploadedEver / t.sizeWhenDone : -1;
			t.secondsSeeding += 2;
		}
	}
}, 2000);

function pickFields(t, fields) {
	const out = {};
	for (const f of fields) {
		if (f === 'id' || f in t) out[f] = t[f];
	}
	out.id = t.id; // always present, per spec
	return out;
}

const server = http.createServer((req, res) => {
	if (req.method !== 'POST' || !req.url.includes('/transmission/rpc')) {
		res.writeHead(404, { 'content-type': 'text/plain' });
		res.end('mock transmission: POST /transmission/rpc');
		return;
	}
	let raw = '';
	req.on('data', (c) => (raw += c));
	req.on('end', () => {
		const respond = (status, body, headers = {}) => {
			res.writeHead(status, { 'content-type': 'application/json', ...headers });
			res.end(JSON.stringify(body));
		};

		if (req.headers['x-transmission-session-id'] !== SESSION_ID) {
			respond(409, { result: 'session id mismatch' }, { 'x-transmission-session-id': SESSION_ID });
			return;
		}

		let method = '';
		let args = {};
		try {
			({ method, arguments: args } = JSON.parse(raw));
		} catch {
			respond(200, { result: 'parse error', arguments: {} });
			return;
		}

		const ids = Array.isArray(args.ids) ? args.ids.map(Number) : null;
		const targets = torrents.filter((t) => !ids || ids.includes(t.id));

		switch (method) {
			case 'session-get':
				respond(200, {
					result: 'success',
					arguments: {
						version: '5.0.0 (mock)',
						'rpc-version': 18,
						'download-dir': DOWNLOAD_DIR,
						seedRatioLimit: 2,
						seedRatioMode: 0
					}
				});
				return;
			case 'torrent-get': {
				const fields = Array.isArray(args.fields) && args.fields.length > 0 ? args.fields : ['id', 'name'];
				respond(200, {
					result: 'success',
					arguments: { torrents: targets.map((t) => pickFields(t, fields)) }
				});
				return;
			}
			case 'torrent-set': {
				for (const t of targets) {
					if (Array.isArray(args.filesUnwanted)) {
						for (const i of args.filesUnwanted) if (t.fileStats[i]) t.fileStats[i].wanted = false;
						syncFiles(t);
					}
					if (Array.isArray(args.filesWanted)) {
						for (const i of args.filesWanted) if (t.fileStats[i]) t.fileStats[i].wanted = true;
						syncFiles(t);
					}
				}
				respond(200, { result: 'success', arguments: {} });
				return;
			}
			case 'torrent-start':
				for (const t of targets) t.status = t.percentDone >= 1 ? 6 : 4;
				respond(200, { result: 'success', arguments: {} });
				return;
			case 'torrent-stop':
				for (const t of targets) t.status = 0;
				respond(200, { result: 'success', arguments: {} });
				return;
			case 'torrent-verify':
				respond(200, { result: 'success', arguments: {} });
				return;
			case 'torrent-remove':
				torrents = torrents.filter((t) => !targets.includes(t));
				respond(200, { result: 'success', arguments: {} });
				return;
			case 'torrent-set-location':
				for (const t of targets) t.downloadDir = String(args.location ?? t.downloadDir);
				respond(200, { result: 'success', arguments: {} });
				return;
			case 'torrent-add': {
				const url = String(args.url ?? '');
				if (!url) {
					respond(200, { result: 'no url', arguments: {} });
					return;
				}
				const name = decodeURIComponent(url.split('/').pop() ?? `added-${Date.now()}`).slice(0, 80) || `added-${Date.now()}`;
				const length = 512 * MiB;
				const t = makeTorrent({
					id: Math.max(0, ...torrents.map((x) => x.id)) + 1,
					name,
					hashString: crypto.randomBytes(16).toString('hex'),
					status: 4,
					percentDone: 0,
					rateDownload: 4 * MiB,
					sizeWhenDone: length,
					totalSize: length,
					eta: 3600,
					files: [{ name, length, bytesCompleted: 0 }],
					fileStats: [{ bytesCompleted: 0, wanted: true, priority: 0 }],
					downloadDir: args['download-dir'] ? String(args['download-dir']) : DOWNLOAD_DIR
				});
				torrents.push(t);
				respond(200, { result: 'success', arguments: { 'torrent-added': { id: t.id, name: t.name } } });
				return;
			}
			default:
				respond(200, { result: `unknown method: ${method}`, arguments: {} });
		}
	});
});

server.listen(PORT, HOST, () => {
	console.log(`mock transmission RPC listening on http://${HOST}:${PORT}/transmission/rpc`);
	console.log(`session id: ${SESSION_ID}`);
	console.log(`download dir: ${DOWNLOAD_DIR} (map with HOST_DOWNLOAD_DIR=${DOWNLOAD_DIR}, DATA_ROOT=./dev-fixtures)`);
});
