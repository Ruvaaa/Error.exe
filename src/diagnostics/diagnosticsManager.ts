import * as vscode from 'vscode';

export interface DiagnosticCounts {
	errors: number;
	warnings: number;
}

export class DiagnosticsManager implements vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<DiagnosticCounts>();
	private readonly subscriptions: vscode.Disposable[] = [];

	readonly onDidChange = this.emitter.event;
	private counts: DiagnosticCounts = { errors: 0, warnings: 0 };

	constructor() {
		this.subscriptions.push(
			vscode.languages.onDidChangeDiagnostics(() => this.refresh()),
			vscode.workspace.onDidOpenTextDocument(() => this.refresh()),
			vscode.workspace.onDidChangeTextDocument(() => this.refresh()),
			vscode.workspace.onDidSaveTextDocument(() => this.refresh()),
			vscode.workspace.onDidCloseTextDocument(() => this.refresh()),
		);
	}

	get current(): DiagnosticCounts {
		return this.counts;
	}

	refresh(): DiagnosticCounts {
		const seen = new Set<string>();
		const openDocuments = new Set(vscode.workspace.textDocuments.map(document => document.uri.toString()));
		let errors = 0;
		let warnings = 0;

		for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
			if (!vscode.workspace.getWorkspaceFolder(uri) || !openDocuments.has(uri.toString())) {
				continue;
			}

			for (const diagnostic of diagnostics) {
				if (diagnostic.severity !== vscode.DiagnosticSeverity.Error
					&& diagnostic.severity !== vscode.DiagnosticSeverity.Warning) {
					continue;
				}

				const key = JSON.stringify([
					uri.toString(),
					diagnostic.severity,
					diagnostic.range.start.line,
					diagnostic.range.start.character,
					diagnostic.range.end.line,
					diagnostic.range.end.character,
					diagnostic.message,
					diagnostic.source,
					diagnostic.code,
				]);
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);

				if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
					errors += 1;
				} else {
					warnings += 1;
				}
			}
		}

		this.counts = { errors, warnings };
		this.emitter.fire(this.counts);
		return this.counts;
	}

	dispose(): void {
		this.subscriptions.forEach(subscription => subscription.dispose());
		this.emitter.dispose();
	}
}
