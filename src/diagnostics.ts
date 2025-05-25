import * as vscode from 'vscode';
import { CheckResult } from './types';

export class Diagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('vibeChecks');
    }

    showDiagnostics(result: CheckResult, document: vscode.TextDocument) {
        const diagnostics: vscode.Diagnostic[] = [];
        for (const entry of result.errors) {
            if (typeof entry === 'string') {
                const match = entry.match(/line\s*(\d+)/i);
                let line = 0;
                if (match) {
                    line = Math.max(0, parseInt(match[1], 10) - 1);
                }
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 100),
                    entry,
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                const line = entry.line !== null ? Math.max(0, entry.line - 1) : 0;
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 100),
                    entry.message,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }
        for (const entry of result.warnings) {
            if (typeof entry === 'string') {
                const match = entry.match(/line\s*(\d+)/i);
                let line = 0;
                if (match) {
                    line = Math.max(0, parseInt(match[1], 10) - 1);
                }
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 100),
                    entry,
                    vscode.DiagnosticSeverity.Warning
                ));
            } else {
                const line = entry.line !== null ? Math.max(0, entry.line - 1) : 0;
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(line, 0, line, 100),
                    entry.message,
                    vscode.DiagnosticSeverity.Warning
                ));
            }
        }
        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    clearDiagnostics(document: vscode.TextDocument) {
        this.diagnosticCollection.set(document.uri, []);
    }

    dispose() {
        this.diagnosticCollection.dispose();
    }
}
