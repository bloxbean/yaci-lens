<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
		import { shell } from './ui.svelte';
	import Logo from './Logo.svelte';
	import DataBadge from './DataBadge.svelte';
	import SearchBox from './Search.svelte';
	import ThemeToggle from './ThemeToggle.svelte';

</script>

<header class="sticky top-0 z-30 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
	<div class="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8">
		<button class="y-icon-btn lg:hidden" onclick={() => (shell.drawerOpen = true)} aria-label="Open menu"><Menu class="h-4 w-4" /></button>
		<div class="lg:hidden"><Logo compact /></div>

		<SearchBox />

		<div class="ml-auto flex items-center gap-2">
			<DataBadge />
			<ThemeToggle />
		</div>
	</div>
</header>
