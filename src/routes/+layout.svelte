<script lang="ts">
	import '@fontsource-variable/inter';
	import '@fontsource-variable/space-grotesk';
	import '@fontsource-variable/jetbrains-mono';
	import '../app.postcss';
	import { onMount, type Snippet } from 'svelte';
	import { shell } from '$lib/shell/ui.svelte';
	import { lake } from '$lib/lake/lake.svelte';
	import { dataset, shortLicense } from '$lib/lake/dataset.svelte';
	import Sidebar from '$lib/shell/Sidebar.svelte';
	import Topbar from '$lib/shell/Topbar.svelte';
	import NavProgress from '$lib/shell/NavProgress.svelte';
	import Toaster from '$lib/ui/Toaster.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		shell.restore();
		// Start DuckDB-WASM right away: every page needs it, and the first start takes a few seconds.
		lake.ready().catch(() => {});
		dataset.load();
		document.documentElement.dataset.ready = '';
	});
</script>

<svelte:head>
	<title>Yaci Lens · the serverless Cardano analytics explorer</title>
</svelte:head>

<NavProgress />

<!-- Soft brand glow behind the content -->
<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
	<div class="absolute -top-40 right-[-10%] h-[520px] w-[620px] rounded-full blur-3xl" style="background: var(--glow-1)"></div>
	<div class="absolute top-[30%] -left-40 h-[480px] w-[520px] rounded-full blur-3xl" style="background: var(--glow-2)"></div>
</div>

<Sidebar />

<div class="flex min-h-screen flex-col transition-[padding] duration-200 {shell.collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]'}">
	<Topbar />

	<main class="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
		{@render children()}
	</main>

	<footer class="border-t border-line/70">
		<div class="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-2 px-4 py-5 text-center text-xs text-faint sm:flex-row sm:text-left sm:px-6 lg:px-8">
			<span
				>Yaci Lens v{__LENS_VERSION__} · Powered by <a class="y-link" href="https://github.com/bloxbean/yaci-store" target="_blank" rel="noopener noreferrer">Yaci Store</a>
				· <a class="y-link" href="https://github.com/bloxbean/yaci-lens" target="_blank" rel="noopener noreferrer">fork it or contribute</a></span
			>
			<span>
				Software: <a class="y-link" href="https://github.com/bloxbean/yaci-lens/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a> ·
				{#if dataset.info?.license}
					{@const d = dataset.info}
					{#if d.source}<a class="y-link" href={d.source} target="_blank" rel="noopener noreferrer">{d.name ?? 'Data'}</a>{:else}{d.name ?? 'Data'}{/if}:
					{#if d.licenseUrl}<a class="y-link" href={d.licenseUrl} target="_blank" rel="noopener noreferrer license" title={d.licenseName}>{shortLicense(d.license ?? '')}</a
						>{:else}<span title={d.licenseName}>{shortLicense(d.license ?? '')}</span>{/if}
				{:else}
					Data: <a class="y-link" href="#/about">{dataset.info?.name ?? dataset.host}</a>
				{/if}
			</span>
		</div>
	</footer>
</div>

<Toaster />
