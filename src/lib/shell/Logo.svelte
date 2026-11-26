<script lang="ts">
	let { compact = false }: { compact?: boolean } = $props();
	// Gradient ids must be unique per instance (the logo is in both the desktop and the mobile sidebar).
	const uid = $props.id();
	const g = `lens-g-${uid}`;
	const glass = `lens-glass-${uid}`;
</script>

<a href="#/" class="flex items-center gap-2.5" aria-label="Yaci Lens home">
	<!-- Yaci Lens: the Yaci mark seen through a lens -->
	<svg viewBox="0 0 64 64" class="h-8 w-8 shrink-0" aria-hidden="true">
		<defs>
		<linearGradient id="{g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF4E2D"/><stop offset=".55" stop-color="#FF8A3D"/><stop offset="1" stop-color="#FBBF24"/></linearGradient>
		<radialGradient id="{glass}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#232634"/><stop offset="1" stop-color="#13151C"/></radialGradient>
		</defs>
		<rect width="64" height="64" rx="14" fill="#0E0F12"/>
		<path d="M39.6 39.6 L51.5 51.5" stroke="url(#{g})" stroke-width="8" stroke-linecap="round"/>
		<circle cx="27" cy="27" r="15.5" fill="url(#{glass})" stroke="url(#{g})" stroke-width="4.6"/>
		<path d="M18.00 16.30 L23.00 16.30 L27.00 23.30 L31.00 16.30 L36.00 16.30 L29.00 28.30 L32.00 28.30 L23.00 38.30 L26.00 29.30 L22.00 29.30 Z" fill="url(#{g})"/>
		<path d="M16.5 24.0 A11.0 11.0 0 0 1 24.0 16.4" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="1.6" stroke-linecap="round"/>
	</svg>
	{#if !compact}
		<span class="font-mono text-[15px] font-extrabold tracking-tight"
			>Yaci<span class="mx-0.5 inline-block h-1.5 w-1.5 -translate-y-2 rounded-full bg-brand"></span><span class="font-medium text-muted">Lens</span></span
		>
	{/if}
</a>
