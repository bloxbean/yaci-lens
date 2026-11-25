<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { keymap } from '@codemirror/view';
	import { Compartment, EditorState, Prec } from '@codemirror/state';
	import { sql, PostgreSQL } from '@codemirror/lang-sql';

	/*
	 * CodeMirror 6 with SQL highlighting and completion from the lake's schema. Mod-Enter runs the query.
	 * Colours follow the app's CSS tokens, so light and dark need no separate theme.
	 */
	let {
		value = $bindable(''),
		schema = {},
		onrun
	}: { value?: string; schema?: Record<string, string[]>; onrun?: () => void } = $props();

	let host: HTMLDivElement;
	let view: EditorView | null = null;
	const lang = new Compartment();

	const theme = EditorView.theme({
		'&': { backgroundColor: 'rgb(var(--c-surface))', color: 'rgb(var(--c-ink))', fontSize: '13px' },
		'.cm-content': { fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace', caretColor: 'rgb(var(--c-brand))' },
		'.cm-gutters': { backgroundColor: 'rgb(var(--c-surface-2))', color: 'rgb(var(--c-faint))', border: 'none' },
		'.cm-activeLine': { backgroundColor: 'rgb(var(--c-brand) / 0.05)' },
		'.cm-activeLineGutter': { backgroundColor: 'rgb(var(--c-brand) / 0.08)' },
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgb(var(--c-brand) / 0.18) !important' },
		'.cm-tooltip': { backgroundColor: 'rgb(var(--c-surface))', border: '1px solid rgb(var(--c-line))', color: 'rgb(var(--c-ink))' },
		'.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgb(var(--c-brand) / 0.15)', color: 'rgb(var(--c-ink))' },
		'&.cm-focused': { outline: 'none' },
		'.cm-scroller': { minHeight: '200px', maxHeight: '460px' }
	});

	function language(s: Record<string, string[]>) {
		return sql({ dialect: PostgreSQL, schema: s, upperCaseKeywords: true });
	}

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					Prec.highest(
						keymap.of([
							{
								key: 'Mod-Enter',
								run: () => {
									onrun?.();
									return true;
								}
							}
						])
					),
					basicSetup,
					lang.of(language(schema)),
					theme,
					EditorView.lineWrapping,
					EditorView.updateListener.of((u) => {
						if (u.docChanged) value = u.state.doc.toString();
					})
				]
			})
		});
		return () => view?.destroy();
	});

	// Outside changes (an example picked, a shared link) replace the document.
	$effect(() => {
		const v = value;
		if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } });
	});

	$effect(() => {
		const s = schema;
		view?.dispatch({ effects: lang.reconfigure(language(s)) });
	});
</script>

<div bind:this={host} class="overflow-hidden rounded-xl border border-line"></div>
