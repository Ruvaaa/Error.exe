import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ComputerState } from './stateManager';
import type { DiagnosticCounts } from './diagnostics/diagnosticsManager';
import type { Achievement } from './achievements/achievementDetection';

export interface CompanionSettings {
	enabled: boolean;
	showWarnings: boolean;
	messageRotation: boolean;
	animationEnabled: boolean;
	refreshInterval: number;
	testAccuracyThreshold: number;
	achievementDuration: number;
	enableBuildAchievements: boolean;
	enableTestAchievements: boolean;
	customMetricPatterns: string[];
}

export interface CompanionViewState extends DiagnosticCounts {
	state: ComputerState;
	paused: boolean;
	settings: CompanionSettings;
	achievement?: Achievement;
}

type ProblemsFilter = 'all' | 'errors' | 'warnings';

export class ComputerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view?: vscode.WebviewView;
	private messageSubscription?: vscode.Disposable;
	private visibilitySubscription?: vscode.Disposable;
	private rotationTimer?: ReturnType<typeof setInterval>;
	private state?: CompanionViewState;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly openProblems: (filter: ProblemsFilter) => Promise<void>,
	) { }

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.extensionUri, 'assets'),
				vscode.Uri.joinPath(this.extensionUri, 'media'),
			],
		};

		this.messageSubscription?.dispose();
		this.messageSubscription = view.webview.onDidReceiveMessage(message => {
			void this.handleMessage(message).catch(error => {
				const detail = error instanceof Error ? error.message : String(error);
				void vscode.window.showErrorMessage(`Error.exe could not complete that action: ${detail}`);
			});
		});
		this.visibilitySubscription?.dispose();
		this.visibilitySubscription = view.onDidChangeVisibility(() => this.syncRotation());
		view.webview.html = this.getHtml(view.webview);
		this.syncRotation();
		this.postState();
	}

	update(state: CompanionViewState): void {
		this.state = state;
		this.postState();
		this.syncRotation();
	}

	show(): void {
		this.view?.show(true);
	}

	dispose(): void {
		if (this.rotationTimer) {
			clearInterval(this.rotationTimer);
		}
		this.messageSubscription?.dispose();
		this.visibilitySubscription?.dispose();
	}

	private postState(): void {
		if (this.state) {
			void this.view?.webview.postMessage({ type: 'state', state: this.state });
		}
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (!message || typeof message !== 'object') {
			return;
		}

		const request = message as Record<string, unknown>;
		switch (request.type) {
			case 'ready':
				this.postState();
				break;
			case 'open-problems':
				await this.openProblems(request.filter === 'errors' || request.filter === 'warnings'
					? request.filter
					: 'all');
				break;
			case 'refresh':
				await vscode.commands.executeCommand('errorExe.refresh');
				break;
			case 'toggle-pause':
				await vscode.commands.executeCommand(this.state?.paused ? 'errorExe.resume' : 'errorExe.pause');
				break;
		}
	}

	private syncRotation(): void {
		if (this.rotationTimer) {
			clearInterval(this.rotationTimer);
			this.rotationTimer = undefined;
		}

		const state = this.state;
		if (!state || !this.view?.visible || state.paused
			|| !state.settings.messageRotation || !state.settings.enabled) {
			return;
		}

		this.rotationTimer = setInterval(() => {
			void this.view?.webview.postMessage({ type: 'rotate-message' });
		}, Math.max(5, state.settings.refreshInterval) * 1000);
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.js'));
		const images = {
			success: 'success.png',
			warning: 'warning.png',
			'multiple-errors': 'multiple-errors.png',
			'system-overload': 'system-overload.png',
			'perfect-build': 'perfect-build.png',
			'tests-passed': 'tests-passed.png',
		} satisfies Record<ComputerState | 'perfect-build' | 'tests-passed', string>;
		const imageUris = {
			success: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'computer', images.success)),
			warning: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'computer', images.warning)),
			'multiple-errors': webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'computer', images['multiple-errors'])),
			'system-overload': webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'computer', images['system-overload'])),
			'perfect-build': webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'computer', images['perfect-build'])),
			'tests-passed': webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'computer', images['tests-passed'])),
		} satisfies Record<ComputerState | 'perfect-build' | 'tests-passed', vscode.Uri>;
		const fallbackImages = {
			success: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'error-exe-01-success.png')),
			warning: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'error-exe-02-warning.png')),
			'multiple-errors': webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'error-exe-03-multiple-errors.png')),
			'system-overload': webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'error-exe-04-system-overload.png')),
		} satisfies Record<ComputerState, vscode.Uri>;

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<link rel="stylesheet" href="${styleUri}">
	<title>Error.exe</title>
</head>
<body>
	<main id="companion" class="state-success">
		<button class="computer" id="open-all" type="button" aria-label="Open Problems">
			<span class="computer-art">
				<img id="computer-image" alt="Vintage computer mascot">
				<span class="crt" aria-hidden="true">
					<span id="terminal-status"></span>
					<span id="terminal-message"></span>
					<span id="terminal-counts"></span>
					<span id="expression"></span>
					<span class="cursor"></span>
				</span>
			</span>
		</button>
		<header>
			<h1>ERROR.EXE</h1>
			<p id="status-label" class="status-label">SYSTEM STATUS: ONLINE</p>
		</header>
		<p id="message" class="message" aria-live="polite"></p>
		<div class="counts" aria-label="Diagnostic counts">
			<button id="errors" class="count count-error" type="button">
				<span>Errors</span><strong id="error-count">0</strong>
			</button>
			<button id="warnings" class="count count-warning" type="button">
				<span>Warnings</span><strong id="warning-count">0</strong>
			</button>
		</div>
		<footer>
			<button id="refresh" type="button" class="quiet-button">Refresh</button>
			<button id="pause" type="button" class="quiet-button">Pause reactions</button>
		</footer>
		<p id="paused-label" class="paused-label" hidden>REACTIONS PAUSED</p>
		<p id="disabled-label" class="disabled-label" hidden>Companion disabled in settings.</p>
	</main>
	<script nonce="${nonce}">
		window.errorExeImages = {
			success: "${imageUris.success}",
			warning: "${imageUris.warning}",
			"multiple-errors": "${imageUris['multiple-errors']}",
			"system-overload": "${imageUris['system-overload']}",
			"perfect-build": "${imageUris['perfect-build']}",
			"tests-passed": "${imageUris['tests-passed']}"
		};
		window.errorExeFallbackImages = {
			success: "${fallbackImages.success}",
			warning: "${fallbackImages.warning}",
			"multiple-errors": "${fallbackImages['multiple-errors']}",
			"system-overload": "${fallbackImages['system-overload']}"
		};
	</script>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}

function getNonce(): string {
	return randomBytes(16).toString('base64');
}
