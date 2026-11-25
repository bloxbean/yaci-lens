import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// A static site: one index.html, routes in the URL hash, so any static host works without rewrites
		// (GitHub Pages, Cloudflare Pages, an R2 bucket, nginx).
		adapter: adapter(),
		router: { type: 'hash' },
		paths: { relative: true }
	}
};

export default config;
