import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		// Icons are imported one file each; DuckDB-WASM and julc load their workers and engine files relative to their own
		// modules (new URL(..., import.meta.url)), which pre-bundling would break.
		exclude: ['@lucide/svelte', '@duckdb/duckdb-wasm', '@julclang/wasm-client', '@julclang/julc-wasm']
	},
	build: { target: 'es2022', chunkSizeWarningLimit: 2000 }
});
