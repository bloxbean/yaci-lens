<script lang="ts">
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import Info from '@lucide/svelte/icons/info';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ValidatorLab from '$lib/julc/authoring/ValidatorLab.svelte';
	import { tryApi } from '$lib/api/client';
	import { hashParam } from '$lib/lake/links';
	import type { Genesis } from '$lib/julc/replay/slots';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type Any = any;

	/*
	 * The validator lab from Yaci Viewer, on lake data. ?script=<hash> starts from an on-chain script; ?tx=… comes from a
	 * transaction's "Debug" button (full transaction replay needs the transaction index, so the lab starts from the script).
	 */
	const fromTx = hashParam('tx');

	async function load() {
		const hash = hashParam('script')?.toLowerCase() ?? null;
		const valid = !!hash && /^[0-9a-f]{56}$/.test(hash);
		const [params, genesis, tip, info, body] = await Promise.all([
			tryApi<Any>('/epochs/latest/parameters'),
			tryApi<Genesis>('/genesis'),
			tryApi<{ slot?: number }>('/blocks/latest'),
			valid ? tryApi<{ type?: string }>(`/scripts/${hash}`) : null,
			valid ? tryApi<{ cbor?: string }>(`/scripts/${hash}/cbor`) : null
		]);
		return {
			params,
			genesis,
			tipSlot: tip?.slot ?? null,
			script: valid && body?.cbor ? { hash: hash!, type: info?.type ?? null, cbor: body.cbor } : null,
			scriptMissing: !!hash && !body?.cbor
		};
	}
	const data = load();
</script>

<svelte:head><title>Validator lab · Yaci Lens</title></svelte:head>

<PageHeader kind="julc" title="Validator lab">
	{#snippet icon()}<FlaskConical class="h-5 w-5" />{/snippet}
	Write a validator in Java, or load any on-chain script by hash, and evaluate or step-debug it with the julc engine, in your browser. Nothing is
	deployed, signed or submitted.
</PageHeader>

{#if fromTx}
	<div class="mb-5 flex items-start gap-2.5 rounded-xl border border-blue/30 bg-blue/10 px-4 py-3 text-sm">
		<Info class="mt-0.5 h-4 w-4 shrink-0 text-blue" />
		<span>
			Loaded the script from transaction <span class="font-mono text-xs">{fromTx.slice(0, 12)}…</span>. Replaying that exact transaction (its inputs,
			datums and script context) needs the transaction index, which is planned; meanwhile, run the script against UTxOs you describe here.
		</span>
	</div>
{/if}

{#await data}
	<div class="y-panel"><Skeleton rows={10} /></div>
{:then d}
	<ValidatorLab params={d.params} genesis={d.genesis} tipSlot={d.tipSlot} initialScript={d.script} scriptMissing={d.scriptMissing} initialUtxo={null} />
{/await}
