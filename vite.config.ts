import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
