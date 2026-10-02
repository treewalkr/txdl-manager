// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// injected by vite `define` in vite.config.ts (git describe; package.json in Docker builds)
	const __APP_VERSION__: string;
}

export {};
