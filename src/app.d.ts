// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
	/** The released version (package.json), set at build time in vite.config.ts. */
	const __LENS_VERSION__: string;
}

export {};
