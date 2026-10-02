import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// .git is dockerignored, so container builds fall back to package.json's version
const appVersion = (() => {
	try {
		return execSync('git describe --tags --always --dirty', {
			stdio: ['ignore', 'pipe', 'ignore']
		}).toString().trim();
	} catch {
		return `v${JSON.parse(readFileSync('package.json', 'utf8')).version}`;
	}
})();

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(appVersion)
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Local-only tool served on 127.0.0.1; skipping the origin check avoids 403s
			// when the user opens it via 127.0.0.1 instead of localhost.
			csrf: { checkOrigin: false }
		})
	]
});
