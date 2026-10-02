# Changelog

Notable changes. Versions are git tags — `git tag` lists them, `git describe --tags` locates the current build between them.

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
