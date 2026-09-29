// Shapes returned by the Transmission RPC (subset of fields we request) and
// derived payloads sent to the client.

export interface TorrentFile {
	/** Path relative to the torrent's downloadDir; multi-file torrents start with the torrent's folder name. */
	name: string;
	length: number;
	bytesCompleted: number;
}

export interface FileStat {
	bytesCompleted: number;
	wanted: boolean;
	priority: number;
}

export interface Torrent {
	id: number;
	name: string;
	hashString: string;
	status: number;
	error: number;
	errorString: string;
	percentDone: number;
	metadataPercentComplete: number;
	rateDownload: number;
	rateUpload: number;
	eta: number;
	sizeWhenDone: number;
	leftUntilDone: number;
	totalSize: number;
	uploadedEver: number;
	uploadRatio: number;
	secondsSeeding: number;
	secondsDownloading: number;
	isStalled: boolean;
	downloadDir: string;
	labels: string[];
	seedRatioMode: number;
	seedRatioLimit: number;
	dateAdded: number;
	dateDone: number;
	activityDate: number;
	peersConnected: number;
	peersSendingToUs: number;
	peersGettingFromUs: number;
	queuePosition: number;
	files?: TorrentFile[];
	fileStats?: FileStat[];
}

export interface SessionInfo {
	version: string;
	'rpc-version': number;
	'download-dir': string;
	seedRatioLimit: number;
	seedRatioMode: number;
}

export interface ClientConfig {
	rpcUrl: string;
	moveDestination: string;
	hostDownloadDir: string;
	dataRoot: string;
	mapped: boolean;
}

export interface JunkEntry {
	index: number;
	name: string;
	length: number;
	sizeOnDisk: number;
	/** True when the on-disk leftover is a partial ".part" file (Transmission's rename-partial-files). */
	partial: boolean;
}

export interface CleanupScanResult {
	downloadDir: string;
	mapped: boolean;
	junk: JunkEntry[];
	totalOnDisk: number;
}

export interface CleanupFailure {
	name: string;
	error: string;
}

export interface CleanupDeleteResult extends CleanupScanResult {
	deleted: number;
	freed: number;
	failed: CleanupFailure[];
}
