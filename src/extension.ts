import * as vscode from 'vscode';
import { ComputerViewProvider, type CompanionSettings, type CompanionViewState } from './computerViewProvider';
import { DiagnosticsManager, type DiagnosticCounts } from './diagnostics/diagnosticsManager';
import { getComputerState } from './stateManager';
import { AchievementDetector, type AchievementDetectionSettings } from './achievements/achievementDetector';
import { AchievementQueue } from './achievements/achievementQueue';
import type { Achievement } from './achievements/achievementDetection';

const viewId = 'errorExe.companion';
const mainViewId = 'errorExe.main';
const mainContainerCommand = 'workbench.view.extension.errorExe';
const problemsFilterCommands = {
	errors: 'workbench.actions.workbench.panel.markers.view.toggleErrors',
	warnings: 'workbench.actions.workbench.panel.markers.view.toggleWarnings',
	info: 'workbench.actions.workbench.panel.markers.view.toggleInfos',
	activeFile: 'workbench.actions.workbench.panel.markers.view.toggleActiveFile',
} as const;
const problemsFilters = { errors: true, warnings: true, info: true, activeFile: false };

export function activate(context: vscode.ExtensionContext): void {
	let configuration = vscode.workspace.getConfiguration('errorExe');
	const diagnostics = new DiagnosticsManager();
	const viewProvider = new ComputerViewProvider(context.extensionUri, openProblems);
	const mainViewProvider = new ComputerViewProvider(context.extensionUri, openProblems);
	const achievements = new AchievementQueue();
	let paused = false;
	let latestCounts: DiagnosticCounts = diagnostics.current;
	let achievementTimer: ReturnType<typeof setTimeout> | undefined;

	const getSettings = (): CompanionSettings => ({
		enabled: configuration.get<boolean>('enabled', true),
		showWarnings: configuration.get<boolean>('showWarnings', true),
		messageRotation: configuration.get<boolean>('messageRotation', true),
		animationEnabled: configuration.get<boolean>('animationEnabled', true),
		refreshInterval: configuration.get<number>('refreshInterval', 30),
		testAccuracyThreshold: configuration.get<number>('testAccuracyThreshold', 0.8),
		achievementDuration: configuration.get<number>('achievementDuration', 8),
		enableBuildAchievements: configuration.get<boolean>('enableBuildAchievements', true),
		enableTestAchievements: configuration.get<boolean>('enableTestAchievements', true),
		customMetricPatterns: configuration.get<string[]>('customMetricPatterns', []),
	});

	const publishState = (): void => {
		const settings = getSettings();
		const counts = latestCounts;
		const state: CompanionViewState = {
			...counts,
			state: getComputerState(counts, settings.showWarnings),
			paused,
			settings,
			achievement: achievements.active,
		};
		viewProvider.update(state);
		mainViewProvider.update(state);
	};

	const scheduleNextAchievement = (): void => {
		if (achievementTimer) {
			clearTimeout(achievementTimer);
			achievementTimer = undefined;
		}
		const active = achievements.active;
		if (!active) {
			publishState();
			return;
		}

		achievementTimer = setTimeout(() => {
			achievementTimer = undefined;
			achievements.finish();
			latestCounts = diagnostics.refresh();
			publishState();
			scheduleNextAchievement();
		}, Math.max(2, getSettings().achievementDuration) * 1000);
	};

	const queueAchievement = (achievement: Achievement): void => {
		if (!achievements.enqueue(achievement)) {
			publishState();
			return;
		}
		publishState();
		if (achievements.active?.id === achievement.id) {
			scheduleNextAchievement();
		}
	};

	const getDetectionSettings = (): AchievementDetectionSettings => {
		const settings = getSettings();
		return {
			enableBuildAchievements: settings.enableBuildAchievements,
			enableTestAchievements: settings.enableTestAchievements,
			testAccuracyThreshold: settings.testAccuracyThreshold,
			customMetricPatterns: settings.customMetricPatterns,
		};
	};
	const achievementDetector = new AchievementDetector(
		getDetectionSettings,
		queueAchievement,
		message => void vscode.window.showWarningMessage(`Error.exe: ${message}`),
	);

	const setEnabled = async (enabled: boolean): Promise<void> => {
		await vscode.workspace.getConfiguration('errorExe').update('enabled', enabled, vscode.ConfigurationTarget.Global);
		await vscode.commands.executeCommand('setContext', 'errorExe.enabled', enabled);
		publishState();
		if (enabled) {
			await vscode.commands.executeCommand(mainContainerCommand);
			mainViewProvider.show();
		}
	};

	context.subscriptions.push(diagnostics, viewProvider, mainViewProvider, achievementDetector, {
		dispose: () => {
			if (achievementTimer) {
				clearTimeout(achievementTimer);
			}
		},
	});
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(viewId, viewProvider, { webviewOptions: { retainContextWhenHidden: true } }),
		vscode.window.registerWebviewViewProvider(mainViewId, mainViewProvider, { webviewOptions: { retainContextWhenHidden: true } }),
	);
	context.subscriptions.push(diagnostics.onDidChange(counts => {
		latestCounts = counts;
		if (!paused) {
			publishState();
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('errorExe')) {
			configuration = vscode.workspace.getConfiguration('errorExe');
			void vscode.commands.executeCommand('setContext', 'errorExe.enabled', getSettings().enabled);
			publishState();
			if (achievements.active) {
				scheduleNextAchievement();
			}
		}
	}));

	void vscode.commands.executeCommand('setContext', 'errorExe.enabled', getSettings().enabled);
	latestCounts = diagnostics.refresh();
	publishState();

	context.subscriptions.push(
		vscode.commands.registerCommand('errorExe.show', () => setEnabled(true)),
		vscode.commands.registerCommand('errorExe.hide', () => setEnabled(false)),
		vscode.commands.registerCommand('errorExe.toggle', () => setEnabled(!getSettings().enabled)),
		vscode.commands.registerCommand('errorExe.refresh', () => {
			latestCounts = diagnostics.refresh();
			if (!paused) {
				publishState();
			}
		}),
		vscode.commands.registerCommand('errorExe.pause', () => {
			paused = true;
			publishState();
		}),
		vscode.commands.registerCommand('errorExe.resume', () => {
			paused = false;
			latestCounts = diagnostics.current;
			publishState();
		}),
		vscode.commands.registerCommand('errorExe.reset', () => {
			paused = false;
			latestCounts = diagnostics.refresh();
			publishState();
		}),
	);
}

export function deactivate(): void { }

async function openProblems(filter: 'all' | 'errors' | 'warnings'): Promise<void> {
	await vscode.commands.executeCommand('workbench.actions.view.problems');
	await vscode.commands.executeCommand('problems.action.clearFilterText');
	const target = {
		errors: filter === 'all' || filter === 'errors',
		warnings: filter === 'all' || filter === 'warnings',
		info: filter === 'all',
		activeFile: false,
	};
	for (const severity of Object.keys(target) as (keyof typeof target)[]) {
		if (problemsFilters[severity] !== target[severity]) {
			await vscode.commands.executeCommand(problemsFilterCommands[severity]);
			problemsFilters[severity] = target[severity];
		}
	}
}
