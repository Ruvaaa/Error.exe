import type { DiagnosticCounts } from './diagnostics/diagnosticsManager';

export type ComputerState = 'success' | 'warning' | 'multiple-errors' | 'system-overload';

export function getComputerState(
	{ errors, warnings }: DiagnosticCounts,
	showWarnings: boolean,
): ComputerState {
	if (errors === 0 && (!showWarnings || warnings === 0)) {
		return 'success';
	}
	if (errors <= 1) {
		return 'warning';
	}
	if (errors <= 5) {
		return 'multiple-errors';
	}
	return 'system-overload';
}
