import { isImageFile, isVideoFile } from '$lib/media';
import type { ReviewItem, ReviewMedia, Torrent } from '$lib/types';
import type { PathMapping } from './config';
import { mappingFor } from './paths';

/**
 * Split every torrent's fully-downloaded media files into the review deck
 * (still selected — awaiting a decision) and the rejected list (deselected,
 * awaiting Clear). Download dirs outside the mapped roots are skipped
 * entirely: their files can neither stream nor be deleted, so they would
 * only be dead cards.
 */
export function pickReviewMedia(details: Torrent[], mappings: PathMapping[]): ReviewMedia {
	const deck: ReviewItem[] = [];
	const rejected: ReviewItem[] = [];
	const ordered = [...details].sort((a, b) => b.activityDate - a.activityDate);
	for (const t of ordered) {
		if (!mappingFor(t.downloadDir, mappings)) continue;
		const files = t.files ?? [];
		const stats = t.fileStats ?? [];
		for (let i = 0; i < files.length; i++) {
			const f = files[i];
			const kind = isVideoFile(f.name) ? 'video' : isImageFile(f.name) ? 'image' : null;
			if (!kind) continue;
			const completed = stats[i]?.bytesCompleted ?? f.bytesCompleted;
			if (completed < f.length) continue; // partial files can't be previewed
			const item: ReviewItem = {
				torrentId: t.id,
				hashString: t.hashString,
				torrentName: t.name,
				downloadDir: t.downloadDir,
				index: i,
				name: f.name,
				length: f.length,
				kind
			};
			if (stats[i]?.wanted === false) rejected.push(item);
			else deck.push(item);
		}
	}
	return { deck, rejected };
}
