import * as vscode from 'vscode';

export type AchievementKind = 'perfect-build' | 'tests-passed';

export interface EvaluationMetric {
	name: string;
	value: number;
}

export interface Achievement {
	id: string;
	kind: AchievementKind;
	metric?: EvaluationMetric;
}

export interface TaskDescriptor {
	name: string;
	groupId?: string;
	source?: string;
	definitionType?: string;
	command?: string;
}

export interface ParsedMetric extends EvaluationMetric {
	custom: boolean;
}

const builtInMetricPattern = /\b(test_accuracy|val_accuracy|accuracy)\b\s*(?::|=)?\s*(\d+(?:\.\d+)?%?)/gi;
const ansiEscapePattern = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;

export function detectTaskAchievement(
	task: TaskDescriptor,
	exitCode: number | undefined,
	enableBuildAchievements: boolean,
	enableTestAchievements: boolean,
): AchievementKind | undefined {
	if (exitCode !== 0) {
		return undefined;
	}

	const details = `${task.name} ${task.source ?? ''} ${task.definitionType ?? ''} ${task.command ?? ''}`;
	const isTest = task.groupId === vscode.TaskGroup.Test.id || isTestCommand(details);
	if (isTest) {
		return enableTestAchievements ? 'tests-passed' : undefined;
	}

	const isBuild = task.groupId === vscode.TaskGroup.Build.id
		|| task.groupId === vscode.TaskGroup.Rebuild.id
		|| isBuildCommand(details);
	return isBuild && enableBuildAchievements ? 'perfect-build' : undefined;
}

export function isTestCommand(value: string): boolean {
	return /\b(?:test(?:s)?(?::[\w-]+)?|spec(?:s)?|pytest|jest|vitest|mocha|ctest|unittest|tox|nosetests|evaluate|evaluation)(?:\b|(?=[_.:-]))/i.test(value);
}

export function isBuildCommand(value: string): boolean {
	return /\b(?:build|compile|make|cmake|gradle|mvn|maven|webpack|tsc|javac|cargo\s+build|dotnet\s+build|train|training|export|save_model)(?:\b|(?=[_.:-]))/i.test(value);
}

export function parseEvaluationMetrics(output: string, customPatterns: readonly string[] = []): ParsedMetric[] {
	const cleanOutput = output.replace(ansiEscapePattern, '').slice(-64_000);
	const metrics: ParsedMetric[] = [];

	for (const match of cleanOutput.matchAll(builtInMetricPattern)) {
		const name = match[1];
		const value = normalizeMetricValue(match[2]);
		if (name && value !== undefined) {
			metrics.push({ name, value, custom: false });
		}
	}

	for (const pattern of customPatterns) {
		if (!pattern || pattern.length > 256) {
			continue;
		}
		const regex = new RegExp(pattern, 'gi');
		for (const match of cleanOutput.matchAll(regex)) {
			const groups = match.groups;
			const name = groups?.metric;
			const rawValue = groups?.value;
			const value = rawValue === undefined ? undefined : normalizeMetricValue(rawValue);
			if (name && value !== undefined) {
				metrics.push({ name, value, custom: true });
			}
		}
	}

	return metrics;
}

export function findQualifyingMetric(
	metrics: readonly ParsedMetric[],
	threshold: number,
	commandLine: string,
): EvaluationMetric | undefined {
	if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
		return undefined;
	}

	const latestByName = new Map<string, ParsedMetric>();
	for (const metric of metrics) {
		latestByName.set(metric.name.toLowerCase(), metric);
	}

	const genericAccuracyAllowed = /\b(?:test|evaluate|evaluation|eval|score|predict)(?:\b|(?=[_.:-]))/i.test(commandLine);
	const priorities = ['test_accuracy', 'accuracy', 'val_accuracy'];
	for (const name of priorities) {
		const metric = latestByName.get(name);
		if (metric && (name !== 'accuracy' || genericAccuracyAllowed || metric.custom)
			&& metric.value > threshold) {
			return { name: metric.name, value: metric.value };
		}
	}

	for (const [name, metric] of latestByName) {
		if (!priorities.includes(name) && metric.value > threshold) {
			return { name: metric.name, value: metric.value };
		}
	}

	return undefined;
}

function normalizeMetricValue(rawValue: string): number | undefined {
	const isPercent = rawValue.endsWith('%');
	const parsed = Number(isPercent ? rawValue.slice(0, -1) : rawValue);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
		return undefined;
	}
	return isPercent || parsed > 1 ? parsed / 100 : parsed;
}
