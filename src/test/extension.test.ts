import * as assert from 'assert';
import * as vscode from 'vscode';
import { AchievementQueue } from '../achievements/achievementQueue';
import {
	detectTaskAchievement,
	findQualifyingMetric,
	parseEvaluationMetrics,
	type Achievement,
} from '../achievements/achievementDetection';
import { DiagnosticsManager } from '../diagnostics/diagnosticsManager';
import { getComputerState } from '../stateManager';

suite('Error.exe state logic', () => {
	test('a clean project is successful', () => {
		assert.strictEqual(getComputerState({ errors: 0, warnings: 0 }, true), 'success');
	});

	test('warnings without errors are a warning state', () => {
		assert.strictEqual(getComputerState({ errors: 0, warnings: 3 }, true), 'warning');
	});

	test('warnings can be excluded from state without hiding their count', () => {
		assert.strictEqual(getComputerState({ errors: 0, warnings: 3 }, false), 'success');
	});

	test('one error is a warning state', () => {
		assert.strictEqual(getComputerState({ errors: 1, warnings: 0 }, true), 'warning');
	});

	test('two through five errors use the multiple-errors state', () => {
		for (const errors of [2, 3, 4, 5]) {
			assert.strictEqual(getComputerState({ errors, warnings: 0 }, true), 'multiple-errors');
		}
	});

	test('six or more errors use the system-overload state', () => {
		for (const errors of [6, 27]) {
			assert.strictEqual(getComputerState({ errors, warnings: 0 }, true), 'system-overload');
		}
	});

	test('warnings do not push an error state into system overload', () => {
		assert.strictEqual(getComputerState({ errors: 1, warnings: 25 }, true), 'warning');
		assert.strictEqual(getComputerState({ errors: 5, warnings: 25 }, true), 'multiple-errors');
	});
});

suite('Error.exe achievement detection', () => {
	test('celebrates successful build and test tasks only', () => {
		assert.strictEqual(detectTaskAchievement({ name: 'C++ build', groupId: 'build' }, 0, true, true), 'perfect-build');
		assert.strictEqual(detectTaskAchievement({ name: 'npm: test', groupId: 'test' }, 0, true, true), 'tests-passed');
		assert.strictEqual(detectTaskAchievement({ name: 'npm: build' }, 1, true, true), undefined);
		assert.strictEqual(detectTaskAchievement({ name: 'npm: test' }, undefined, true, true), undefined);
		assert.strictEqual(detectTaskAchievement({ name: 'npm: build' }, 0, false, true), undefined);
		assert.strictEqual(detectTaskAchievement({ name: 'npm: test' }, 0, true, false), undefined);
	});

	test('requires a metric strictly above threshold and preserves its actual name', () => {
		const metrics = parseEvaluationMetrics('accuracy: 0.80 test_accuracy: 85% val_accuracy: 0.92');
		assert.deepStrictEqual(findQualifyingMetric(metrics.slice(0, 1), 0.8, 'python evaluate.py'), undefined);
		assert.deepStrictEqual(findQualifyingMetric(metrics, 0.8, 'python evaluate.py'), {
			name: 'test_accuracy',
			value: 0.85,
		});
		assert.deepStrictEqual(findQualifyingMetric(
			parseEvaluationMetrics('val_accuracy: 0.91'),
			0.8,
			'python train.py',
		), { name: 'val_accuracy', value: 0.91 });
	});

	test('requires evaluation context for generic accuracy but permits explicit test metrics', () => {
		const accuracy = parseEvaluationMetrics('accuracy: 0.91');
		assert.strictEqual(findQualifyingMetric(accuracy, 0.8, 'python train.py'), undefined);
		assert.strictEqual(findQualifyingMetric(accuracy, 0.8, 'python evaluate.py')?.name, 'accuracy');
		assert.strictEqual(findQualifyingMetric(
			parseEvaluationMetrics('test_accuracy=0.91'),
			0.8,
			'python train.py',
		)?.name, 'test_accuracy');
	});

	test('recognizes configured custom metrics and percentage output', () => {
		const metrics = parseEvaluationMetrics('macro_f1 = 87.5%', [
			'(?<metric>macro_f1)\\s*=\\s*(?<value>\\d+(?:\\.\\d+)?%?)',
		]);
		assert.deepStrictEqual(findQualifyingMetric(metrics, 0.8, 'python evaluate.py'), {
			name: 'macro_f1',
			value: 0.875,
		});
	});

	test('queues distinct achievements, rejects duplicate IDs, then restores the latest diagnostic state', () => {
		const queue = new AchievementQueue();
		const build: Achievement = { id: 'build-1', kind: 'perfect-build' };
		const tests: Achievement = { id: 'tests-1', kind: 'tests-passed' };
		assert.strictEqual(queue.enqueue(build), true);
		assert.strictEqual(queue.enqueue(build), false);
		assert.strictEqual(queue.enqueue(tests), true);
		assert.strictEqual(queue.active?.id, build.id);

		const latestDiagnostics = { errors: 3, warnings: 1 };
		assert.strictEqual(getComputerState(latestDiagnostics, true), 'multiple-errors');
		assert.strictEqual(queue.finish()?.id, tests.id);
		assert.strictEqual(queue.finish(), undefined);
		assert.strictEqual(getComputerState(latestDiagnostics, true), 'multiple-errors');
	});
});

suite('Error.exe diagnostics', () => {
	test('counts open workspace errors and warnings once, ignoring info and hints', async function () {
		this.timeout(15000);
		const addedWorkspace = !vscode.workspace.workspaceFolders?.length;
		if (addedWorkspace) {
			await changeWorkspaceFolders(0, 0, { uri: vscode.Uri.file(process.cwd()) });
		}
		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, 'The test workspace should be open.');

		const uri = vscode.Uri.joinPath(folder.uri, `.error-exe-test-${Date.now()}.txt`);
		await vscode.workspace.fs.writeFile(uri, new Uint8Array());
		await vscode.workspace.openTextDocument(uri);

		const manager = new DiagnosticsManager();
		const collection = vscode.languages.createDiagnosticCollection('error-exe-test');
		try {
			const range = new vscode.Range(0, 0, 0, 1);
			const error = new vscode.Diagnostic(range, 'test error', vscode.DiagnosticSeverity.Error);
			const warning = new vscode.Diagnostic(range, 'test warning', vscode.DiagnosticSeverity.Warning);
			collection.set(uri, [
				error,
				new vscode.Diagnostic(range, 'test error', vscode.DiagnosticSeverity.Error),
				warning,
				new vscode.Diagnostic(range, 'test info', vscode.DiagnosticSeverity.Information),
				new vscode.Diagnostic(range, 'test hint', vscode.DiagnosticSeverity.Hint),
			]);

			assert.deepStrictEqual(manager.refresh(), { errors: 1, warnings: 1 });
		} finally {
			collection.dispose();
			manager.dispose();
			await vscode.workspace.fs.delete(uri);
			if (addedWorkspace) {
				await changeWorkspaceFolders(0, 1);
			}
		}
	});
});

suite('Error.exe commands', () => {
	test('registers the command palette actions and can show and hide the view', async function () {
		this.timeout(15000);
		await vscode.commands.executeCommand('errorExe.show');
		const commands = await vscode.commands.getCommands(true);
		for (const command of [
			'errorExe.show',
			'errorExe.hide',
			'errorExe.toggle',
			'errorExe.refresh',
			'errorExe.pause',
			'errorExe.resume',
			'errorExe.reset',
		]) {
			assert.ok(commands.includes(command), `Missing command: ${command}`);
		}

		await vscode.commands.executeCommand('errorExe.hide');
		await vscode.commands.executeCommand('errorExe.show');
	});
});

function changeWorkspaceFolders(
	start: number,
	deleteCount: number,
	...folders: { uri: vscode.Uri; name?: string }[]
): Promise<void> {
	return new Promise((resolve, reject) => {
		let subscription: vscode.Disposable;
		subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			subscription.dispose();
			resolve();
		});
		if (!vscode.workspace.updateWorkspaceFolders(start, deleteCount, ...folders)) {
			subscription.dispose();
			reject(new Error('Could not update the test workspace folders.'));
		}
	});
}
