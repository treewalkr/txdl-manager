# Changelog

Notable changes. Versions are git tags — `git tag` lists them, `git describe --tags` locates the current build between them.

## [0.4.1] — 2026-10-21

### Fixed
- Shift+click range selection now works in the torrent list: the browser's native text-selection grab on shift+mousedown no longer swallows the click. Deliberate drag-to-select text still works.

## [0.4.0] — 2026-10-09

### Added
- Media review: swipe through every fully-downloaded video and image across all torrents — drag or ←/→ to keep or reject. Rejects are deselected in Transmission (joining the junk list) and cleared from disk in one confirmable action.
- Decisions manager (`/review/manage`): filter and search every media file by state — undecided, kept, removed, deleted — and change any decision: unkeep, restore, delete singles, or bulk-clear.

## [0.3.0] — 2026-10-05

### Added
- Junk indicators in the torrent list: a cached server-side sweep reports real reclaimable bytes per torrent as an amber badge, with a `Junk` filter chip to show only torrents worth cleaning.

## [0.2.0] — 2026-10-02

### Added
- Torrents can be grouped by file location in the list.
- In-browser playback: MP4/WebM stream directly, other formats are remuxed or transcoded on the fly by ffmpeg; images view inline; ↑/↓ switches between a torrent's playable files; playback resumes where it left off.
- Multiple download locations via `HOST_DOWNLOAD_ROOTS`, each enabled once from the UI.

### Fixed
- Remuxed fMP4 streams keep their init segment; 10-bit video falls back to transcoding.

## [0.1.0] — 2026-09-30

Initial release: SvelteKit / Svelte 5 frontend over the Transmission RPC API, Docker Compose on Bun.

- Live torrent list: filters, search, sorting, column picker.
- Finder-style multi-select, right-click context menu, bulk actions.
- Hit & Run group tracking seed-time obligations by size; archive-ready badge.
- Junk cleanup of unselected files (incl. `.part` leftovers), move to HDD, remove, add magnet.
- Terminal console design with light/dark theme.
