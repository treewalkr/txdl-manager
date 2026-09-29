import { resolve } from 'node:path';

export interface AppConfig {
	/** Transmission RPC endpoint as visible from this process (container: host.docker.internal). */
	transmissionUrl: string;
	/** Where the download dir is mounted inside this process (container: /data). */
	dataRoot: string;
	/** The same directory as Transmission sees it on the host, e.g. /Users/you/Downloads. Empty = unmapped. */
	hostDownloadDir: string;
	/** Default destination preset for the "move to HDD" dialog. */
	moveDestination: string;
	rpcUsername?: string;
	rpcPassword?: string;
}

export function env(): AppConfig {
	const dataRootRaw = process.env.DATA_ROOT ?? '/data';
	return {
		transmissionUrl:
			process.env.TRANSMISSION_RPC_URL ?? 'http://host.docker.internal:63825/transmission/rpc',
		// allow relative paths in dev (resolved against cwd)
		dataRoot: dataRootRaw.startsWith('/') ? dataRootRaw : resolve(dataRootRaw),
		hostDownloadDir: process.env.HOST_DOWNLOAD_DIR ?? '',
		moveDestination: process.env.MOVE_DESTINATION ?? '',
		rpcUsername: process.env.TRANSMISSION_RPC_USERNAME || undefined,
		rpcPassword: process.env.TRANSMISSION_RPC_PASSWORD || undefined
	};
}

export function publicConfig() {
	const c = env();
	return {
		rpcUrl: c.transmissionUrl,
		moveDestination: c.moveDestination,
		hostDownloadDir: c.hostDownloadDir,
		dataRoot: c.dataRoot,
		mapped: c.hostDownloadDir !== ''
	};
}
