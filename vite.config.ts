import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [sveltekit()],
	// The released version, shown in the footer and on the About page.
	define: { __LENS_VERSION__: JSON.stringify(pkg.version) },
	optimizeDeps: {
		// Icons are imported one file each; DuckDB-WASM and julc load their workers and engine files relative to their own
		// modules (new URL(..., import.meta.url)), which pre-bundling would break.
		exclude: ['@lucide/svelte', '@duckdb/duckdb-wasm', '@julclang/wasm-client', '@julclang/julc-wasm', '@sqlite.org/sqlite-wasm']
	},
	build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
	// The SQLite-WASM worker (experimental indexes) is an ES module worker that imports the WASM build
	worker: { format: 'es' }
});
