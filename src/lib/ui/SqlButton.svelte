<script lang="ts">
	import TerminalSquare from '@lucide/svelte/icons/square-terminal';
	import { sqlHref } from '$lib/lake/links';

	/* "Open in SQL lab": every live panel shows the query behind it, so people can take it further. */
	let { sql, label = 'SQL' }: { sql: string; label?: string } = $props();
</script>

<a href={sqlHref(sql)} class="y-btn h-8 text-xs" title="Open this query in the SQL lab"><TerminalSquare class="h-3.5 w-3.5" />{label}</a>
