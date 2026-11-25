import type { Tone } from '$lib/ui/Badge.svelte';

const LABELS: Record<string, string> = {
	PARAMETER_CHANGE_ACTION: 'Parameter change',
	HARD_FORK_INITIATION_ACTION: 'Hard fork',
	TREASURY_WITHDRAWALS_ACTION: 'Treasury withdrawal',
	NO_CONFIDENCE: 'No confidence',
	UPDATE_COMMITTEE: 'Update committee',
	NEW_CONSTITUTION: 'New constitution',
	INFO_ACTION: 'Info action'
};

export function typeLabel(type: string | null | undefined): string {
	if (!type) return '—';
	return LABELS[type] ?? type.toLowerCase().replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function proposalTone(status: string | null | undefined): Tone {
	switch (status) {
		case 'ACTIVE':
			return 'info';
		case 'RATIFIED':
		case 'ENACTED':
			return 'ok';
		case 'EXPIRED':
			return 'neutral';
		case 'DROPPED':
			return 'bad';
		default:
			return 'neutral';
	}
}
