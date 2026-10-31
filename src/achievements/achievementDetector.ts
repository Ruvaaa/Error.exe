import * as vscode from 'vscode';
import {
	detectTaskAchievement,
	findQualifyingMetric,
	isBuildCommand,
	isTestCommand,
	parseEvaluationMetrics,
	type Achievement,
	type AchievementKind,
} from './achievementDetection';

export interface AchievementDetectionSettings {
	enableBuildAchievements: boolean;
	enableTestAchievements: boolean;
	testAccuracyThreshold: number;
	customMetricPatterns: string[];
}

interface TerminalCapture {
	commandLine: string;
	output: string;
	done?: Promise<void>;
}

interface RecentSignal {
	source: 'task' | 'terminal';
	timestamp: number;
	achievement: Achievement;
}

const maxCapturedOutput = 64_000;
const metricRuntimePattern = /\b(?:python(?:\d(?:\.\d+)*)?|ipython|jupyter|pytest|uv|poetry|conda|rscript|node)\b/i;

export class AchievementDetector implements vscode.Disposable {
	private readonly subscriptions: vscode.Disposable[] = [];
	private readonly handledTasks = new WeakSet<vscode.TaskExecution>();
	private readonly handledTerminalExecutions = new WeakSet<vscode.TerminalShellExecution>();
	private readonly terminalCaptures = new WeakMap<vscode.TerminalShellExecution, TerminalCapture>();
	private readonly recentSignals = new Map<string, RecentSignal>();
	private readonly reportedErrors = new Set<string>();
	private nextId = 0;

	constructor(
		private readonly getSettings: () => AchievementDetectionSettings,
		private readonly onAchievement: (achievement: Achievement) => void,
		private readonly onError: (message: string) => void,
	) {
		this.subscriptions.push(
			vscode.tasks.onDidEndTaskProcess(event => this.handleTaskEnd(event)),
			vscode.window.onDidStartTerminalShellExecution(event => this.handleTerminalStart(event)),
			vscode.window.onDidEndTerminalShellExecution(event => {
				void this.handleTerminalEnd(event).catch(error => {
					this.reportError(`Could not process completed terminal output: ${toErrorMessage(error)}`);
				});
			}),
		);
	}

	dispose(): void {
		this.subscriptions.forEach(subscription => subscription.dispose());
	}

	private handleTaskEnd(event: vscode.TaskProcessEndEvent): void {
		if (this.handledTasks.has(event.execution)) {
			return;
		}
		this.handledTasks.add(event.execution);

		const { task } = event.execution;
		const kind = detectTaskAchievement({
			name: task.name,
			groupId: task.group?.id,
			source: task.source,
			definitionType: task.definition.type,
			command: getTaskCommand(task),
		}, event.exitCode, this.getSettings().enableBuildAchievements, this.getSettings().enableTestAchievements);
		if (kind) {
			this.emitOnce(kind, getTaskWorkspaceKey(task), 'task');
		}
	}

	private handleTerminalStart(event: vscode.TerminalShellExecutionStartEvent): void {
		const commandLine = event.execution.commandLine.value;
		const settings = this.getSettings();
		const shouldCaptureMetrics = settings.enableTestAchievements && metricRuntimePattern.test(commandLine);
		if (!shouldCaptureMetrics
			&& !(settings.enableBuildAchievements && isBuildCommand(commandLine))
			&& !(settings.enableTestAchievements && isTestCommand(commandLine))) {
			return;
		}

		const capture: TerminalCapture = { commandLine, output: '' };
		this.terminalCaptures.set(event.execution, capture);
		capture.done = this.readTerminalOutput(event.execution, capture);
	}

	private async readTerminalOutput(
		execution: vscode.TerminalShellExecution,
		capture: TerminalCapture,
	): Promise<void> {
		try {
			for await (const chunk of execution.read()) {
				if (capture.output.length < maxCapturedOutput) {
					capture.output += chunk.slice(0, maxCapturedOutput - capture.output.length);
				}
			}
		} catch (error) {
			this.reportError(`Could not read terminal output for achievement detection: ${toErrorMessage(error)}`);
		}
	}

	private async handleTerminalEnd(event: vscode.TerminalShellExecutionEndEvent): Promise<void> {
		if (this.handledTerminalExecutions.has(event.execution)) {
			return;
		}
		this.handledTerminalExecutions.add(event.execution);

		const capture = this.terminalCaptures.get(event.execution);
		this.terminalCaptures.delete(event.execution);
		await capture?.done;
		if (!capture || event.exitCode !== 0) {
			return;
		}

		const settings = this.getSettings();
		const testKind = settings.enableTestAchievements && isTestCommand(capture.commandLine);
		const buildKind = settings.enableBuildAchievements && isBuildCommand(capture.commandLine);
		let metric: { name: string; value: number } | undefined;
		if (settings.enableTestAchievements && metricRuntimePattern.test(capture.commandLine)) {
			try {
				const metrics = parseEvaluationMetrics(capture.output, settings.customMetricPatterns);
				metric = findQualifyingMetric(metrics, settings.testAccuracyThreshold, capture.commandLine);
			} catch (error) {
				this.reportError(`Invalid custom metric pattern: ${toErrorMessage(error)}`);
			}
		}

		const workspaceKey = getTerminalWorkspaceKey(event.execution.cwd);
		if (testKind) {
			this.emitOnce('tests-passed', workspaceKey, 'terminal', metric);
		}
		if (buildKind) {
			this.emitOnce('perfect-build', workspaceKey, 'terminal');
		}
		if (metric && !testKind) {
			this.emitOnce('tests-passed', workspaceKey, 'terminal', metric);
		}
	}

	private emitOnce(
		kind: AchievementKind,
		workspaceKey: string,
		source: 'task' | 'terminal',
		metric?: { name: string; value: number },
	): void {
		const key = `${kind}:${workspaceKey}`;
		const now = Date.now();
		const previous = this.recentSignals.get(key);
		if (previous && previous.source !== source && now - previous.timestamp < 1_500) {
			if (metric && !previous.achievement.metric) {
				previous.achievement.metric = metric;
				this.onAchievement(previous.achievement);
			}
			return;
		}
		const achievement: Achievement = {
			id: `achievement-${++this.nextId}`,
			kind,
			...(metric ? { metric } : {}),
		};
		this.recentSignals.set(key, { source, timestamp: now, achievement });
		for (const [recentKey, signal] of this.recentSignals) {
			if (now - signal.timestamp >= 1_500) {
				this.recentSignals.delete(recentKey);
			}
		}
		this.onAchievement(achievement);
	}

	private reportError(message: string): void {
		if (!this.reportedErrors.has(message)) {
			this.reportedErrors.add(message);
			this.onError(message);
		}
	}
}

function getTaskCommand(task: vscode.Task): string {
	const execution = task.execution;
	if (execution instanceof vscode.ProcessExecution) {
		return `${execution.process} ${execution.args.join(' ')}`;
	}
	if (execution instanceof vscode.ShellExecution) {
		return execution.commandLine ?? `${String(execution.command ?? '')} ${execution.args?.join(' ') ?? ''}`;
	}
	return '';
}

function getTaskWorkspaceKey(task: vscode.Task): string {
	if (task.scope && typeof task.scope === 'object' && 'uri' in task.scope) {
		return task.scope.uri.toString();
	}
	return vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? 'global';
}

function getTerminalWorkspaceKey(uri: vscode.Uri | undefined): string {
	return uri
		? vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() ?? uri.toString()
		: vscode.workspace.workspaceFolders?.[0]?.uri.toString() ?? 'global';
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
