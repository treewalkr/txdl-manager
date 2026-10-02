import { resolve } from 'node:path';

/**
 * One host→container mount the app may operate under. Entries from
 * HOST_DOWNLOAD_ROOTS are identity mounts (hostRoot === dataRoot): the host
 * directory is bind-mounted at the same path inside the container, so
 * Transmission's paths are valid as-is. The translated pair
 * (HOST_DOWNLOAD_DIR → DATA_ROOT) exists for dev:mock.
 */
export interface PathMapping {
	hostRoot: string;
	dataRoot: string;
}

export interface AppConfig {
	/** Transmission RPC endpoint as visible from this process (container: host.docker.internal). */
	transmissionUrl: string;
	/** Mount mappings the app may operate under; empty = no file access. */
	mappings: PathMapping[];
	/** Default destination preset for the "move to HDD" dialog. */
	moveDestination: string;
	/** JSON file storing app-local state (HR group overrides). */
	hrStateFile: string;
	/** JSON file storing download locations enabled for junk cleanup. */
	locationsStateFile: string;
	/** ffmpeg/ffprobe binaries for in-browser video playback (remux/transcode). */
	ffmpegPath: string;
	ffprobePath: string;
	rpcUsername?: string;
	rpcPassword?: string;
}

function rootsFromEnv(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export function env(): AppConfig {
	const hrStateRaw = process.env.HR_STATE_FILE ?? '.data/hr-state.json';
	const locationsRaw = process.env.LOCATIONS_STATE_FILE ?? '.data/locations.json';

	// Identity mounts. Order matters: the first mapping whose root contains a
	// path wins, so any translated pair is kept in front of the broad roots.
	const mappings: PathMapping[] = rootsFromEnv(process.env.HOST_DOWNLOAD_ROOTS).map((r) => ({
		hostRoot: r,
		dataRoot: r
	}));

	const hostDir = process.env.HOST_DOWNLOAD_DIR ?? '';
	if (hostDir) {
		const dataRootRaw = process.env.DATA_ROOT ?? '/data';
		mappings.unshift({
			hostRoot: hostDir,
			// allow relative paths in dev (resolved against cwd)
			dataRoot: dataRootRaw.startsWith('/') ? dataRootRaw : resolve(dataRootRaw)
		});
	}

	return {
		transmissionUrl:
			process.env.TRANSMISSION_RPC_URL ?? 'http://host.docker.internal:9091/transmission/rpc',
		mappings,
		moveDestination: process.env.MOVE_DESTINATION ?? '',
		hrStateFile: hrStateRaw.startsWith('/') ? hrStateRaw : resolve(hrStateRaw),
		locationsStateFile: locationsRaw.startsWith('/') ? locationsRaw : resolve(locationsRaw),
		ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
		ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
		rpcUsername: process.env.TRANSMISSION_RPC_USERNAME || undefined,
		rpcPassword: process.env.TRANSMISSION_RPC_PASSWORD || undefined
	};
}

export function publicConfig() {
	const c = env();
	return {
		rpcUrl: c.transmissionUrl,
		moveDestination: c.moveDestination,
		hostDownloadRoots: c.mappings.map((m) => m.hostRoot),
		mapped: c.mappings.length > 0
	};
}
