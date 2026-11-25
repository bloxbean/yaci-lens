<script lang="ts">
		import { dateTime, timeAgo } from '$lib/format';

	/* "12s ago" that keeps counting, with the exact time on hover. */
	let { ts, class: klass = '' }: { ts: number | null | undefined; class?: string } = $props();

	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	const iso = $derived(ts ? new Date(ts > 1e12 ? ts : ts * 1000).toISOString() : undefined);
</script>

<time class="whitespace-nowrap tabular-nums {klass}" title={dateTime(ts)} datetime={iso}
	>{timeAgo(ts, now)}</time
>
