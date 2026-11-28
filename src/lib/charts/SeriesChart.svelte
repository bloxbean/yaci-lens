<script lang="ts" module>
	export interface Series {
		name: string;
		values: number[];
		/** Fixed colour slot (index into the series palette); defaults to the series' position. */
		slot?: number;
		color?: string;
	}
</script>

<script lang="ts">
	import { niceMax, seriesColor, short } from './series';

	/*
	 * Several series over the same x axis (days, epochs), as lines, areas, grouped bars or stacked bars.
	 * One y axis (never two scales). Hovering shows a crosshair and every series' value at that x; a legend
	 * names the series when there are two or more. Plain SVG that stretches to its container's width.
	 */
	let {
		x,
		series,
		kind = 'line',
		height = 220,
		format = (v: number) => short(v),
		xFormat = (s: string) => s,
		label = 'chart',
		onselect = undefined
	}: {
		x: string[];
		series: Series[];
		kind?: 'line' | 'area' | 'bar' | 'stacked';
		height?: number;
		format?: (v: number) => string;
		xFormat?: (s: string) => string;
		label?: string;
		/** Click on an x position (e.g. open that day). */
		onselect?: (i: number) => void;
	} = $props();

	const W = 800;
	const PAD_T = 8;
	const n = $derived(x.length);
	const colorOf = (s: Series, i: number) => s.color ?? seriesColor(s.slot ?? i);
	const stackedTotals = $derived(x.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0)));
	const rawMax = $derived(
		kind === 'stacked' ? Math.max(0, ...stackedTotals) : Math.max(0, ...series.flatMap((s) => s.values.map((v) => (Number.isFinite(v) ? v : 0))))
	);
	const max = $derived(niceMax(rawMax));
	const y = (v: number) => PAD_T + (height - PAD_T) * (1 - Math.max(0, v) / max);
	const xs = (i: number) => (n <= 1 ? W / 2 : (i * W) / (n - 1));
	const band = $derived(W / Math.max(1, n));

	function path(vals: number[]) {
		let d = '';
		let pen = false;
		vals.forEach((v, i) => {
			if (!Number.isFinite(v)) return void (pen = false);
			d += `${pen ? 'L' : 'M'}${xs(i).toFixed(1)},${y(v).toFixed(1)}`;
			pen = true;
		});
		return d;
	}

	let hover = $state<number | null>(null);
	function move(e: PointerEvent) {
		const r = (e.currentTarget as SVGElement).getBoundingClientRect();
		const f = (e.clientX - r.left) / r.width;
		hover = kind === 'line' || kind === 'area' ? Math.round(f * (n - 1)) : Math.floor(f * n);
		hover = Math.min(n - 1, Math.max(0, hover));
	}
	const hoverX = $derived(hover == null ? 0 : kind === 'line' || kind === 'area' ? (xs(hover) / W) * 100 : ((hover + 0.5) / n) * 100);
	const ticks = $derived([0.25, 0.5, 0.75, 1].map((f) => f * max));
	// distinct positions (a single point would otherwise repeat index 0, a duplicate key)
	const xLabels = $derived([...new Set(n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n ? [0, n - 1] : [])]);
</script>

{#if n}
	<div class="relative select-none">
		{#if series.length > 1}
			<div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
				{#each series as s, i (s.name)}
					<span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" style="background:{colorOf(s, i)}"></span>{s.name}</span>
				{/each}
			</div>
		{/if}
		<div class="relative pl-10">
			{#each ticks as t (t)}
				<div class="mono pointer-events-none absolute left-0 -translate-y-1/2 text-[10px] leading-none text-faint tabular-nums" style="top:{(y(t) / height) * 100}%">{format(t)}</div>
			{/each}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<svg
				viewBox="0 0 {W} {height}"
				preserveAspectRatio="none"
				class="block w-full {onselect ? 'cursor-pointer' : ''}"
				style="height:{height}px"
				role="img"
				aria-label={label}
				onpointermove={move}
				onpointerleave={() => (hover = null)}
				onclick={() => hover != null && onselect?.(hover)}
			>
				{#each ticks as t (t)}
					<line x1="0" x2={W} y1={y(t)} y2={y(t)} stroke="rgb(var(--c-line))" stroke-dasharray="2 4" vector-effect="non-scaling-stroke" />
				{/each}
				<line x1="0" x2={W} y1={height - 0.5} y2={height - 0.5} stroke="rgb(var(--c-line))" vector-effect="non-scaling-stroke" />
				{#if kind === 'stacked'}
					{#each x as _, i (i)}
						{@const segs = series.map((s, si) => ({ v: Math.max(0, s.values[i] || 0), c: colorOf(s, si) }))}
						{#each segs as seg, si (si)}
							{@const below = segs.slice(0, si).reduce((a, b) => a + b.v, 0)}
							{#if seg.v > 0}
								<rect
									x={i * band + band * 0.14}
									width={band * 0.72}
									y={y(below + seg.v)}
									height={Math.max(0, y(below) - y(below + seg.v) - (si ? 1 : 0))}
									fill={seg.c}
									opacity={hover == null || hover === i ? 0.9 : 0.45}
								/>
							{/if}
						{/each}
					{/each}
				{:else if kind === 'bar'}
					{#each series as s, si (s.name)}
						{@const w = (band * 0.72) / series.length}
						{#each s.values as v, i (i)}
							{#if v > 0}
								<rect x={i * band + band * 0.14 + si * w} width={Math.max(0.5, w - (series.length > 1 ? 1 : 0))} y={y(v)} height={Math.max(0, height - y(v))} fill={colorOf(s, si)} opacity={hover == null || hover === i ? 0.9 : 0.45} rx="1" />
							{/if}
						{/each}
					{/each}
				{:else}
					{#each series as s, si (s.name)}
						{#if kind === 'area'}
							<path d="{path(s.values)} L{xs(n - 1)},{height} L{xs(0)},{height} Z" fill={colorOf(s, si)} opacity={series.length > 1 ? 0.08 : 0.14} />
						{/if}
						<path d={path(s.values)} fill="none" stroke={colorOf(s, si)} stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
					{/each}
					{#if hover != null}
						<line x1={xs(hover)} x2={xs(hover)} y1="0" y2={height} stroke="rgb(var(--c-faint))" stroke-opacity="0.6" vector-effect="non-scaling-stroke" />
					{/if}
				{/if}
			</svg>
			{#if hover != null && (kind === 'line' || kind === 'area')}
				{#each series as s, si (s.name)}
					{#if Number.isFinite(s.values[hover])}
						<span
							class="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
							style="left:calc(2.5rem + (100% - 2.5rem) * {xs(hover) / W}); top:{(y(s.values[hover]) / height) * 100}%; background:{colorOf(s, si)}"
						></span>
					{/if}
				{/each}
			{/if}
			<div class="mono mt-1 flex justify-between text-[10px] text-faint">
				{#each xLabels as i (i)}<span>{xFormat(x[i])}</span>{/each}
			</div>
			{#if hover != null}
				<div
					class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-[105%] rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs shadow-card"
					style="left:clamp(5rem, calc(2.5rem + (100% - 2.5rem) * {hoverX / 100}), calc(100% - 5rem))"
				>
					<div class="mb-0.5 whitespace-nowrap text-muted">{xFormat(x[hover])}</div>
					{#each series as s, si (s.name)}
						<div class="flex items-center gap-2 whitespace-nowrap">
							{#if series.length > 1}<span class="h-2 w-2 rounded-sm" style="background:{colorOf(s, si)}"></span><span class="text-muted">{s.name}</span>{/if}
							<span class="mono ml-auto font-semibold tabular-nums">{Number.isFinite(s.values[hover]) ? format(s.values[hover]) : '—'}</span>
						</div>
					{/each}
					{#if kind === 'stacked' && series.length > 1}
						<div class="mt-0.5 flex gap-2 border-t border-line pt-0.5 whitespace-nowrap"><span class="text-muted">Total</span><span class="mono ml-auto font-semibold tabular-nums">{format(stackedTotals[hover])}</span></div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<p class="py-8 text-center text-sm text-muted">No data for this range.</p>
{/if}
