import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CheckResult } from './types';
import { getVibeCheckCandidatesFromGitStatus } from './git-utils';
import { Cache } from './cache';
import { parseResponse, callLanguageModel } from './llm';
import { Diagnostics } from './diagnostics';
import { getInstructions } from './instructions';


export class VibeChecksProvider {
    private outputChannel: vscode.OutputChannel;
    private diagnostics: Diagnostics;
    public debounceTimer: NodeJS.Timeout | undefined;
    private cache: Cache<{ instructionsHash: string; fileHash: string; response: string }>;
    private cacheFilePath: string;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Vibe Checks');
        this.diagnostics = new Diagnostics();
        this.context = context;
        // Determine storage path
        const storageUri = context.storageUri || context.globalStorageUri;
        this.cacheFilePath = storageUri ? path.join(storageUri.fsPath, 'vibe-checks-cache.json') : '';
        this.cache = new Cache(this.cacheFilePath);
    }

    async runCheckOnActiveEditor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Vibe Checks: No active editor to run Vibe Check on.');
            return;
        }
        const instructions = await getInstructions();
        if (!instructions) {
            return;
        }
        await this.runCheck(editor.document, instructions);
    }

    async runCheck(document: vscode.TextDocument, instructions: string, showNotification: boolean = true): Promise<CheckResult> {
        try {
            this.outputChannel.show();
            const filePath = document?.uri.fsPath;
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const relPath = filePath && workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath || '';
            this.outputChannel.appendLine(`\n🚀 Vibe checking ${relPath}`);

            // Get configuration
            const config = vscode.workspace.getConfiguration('vibeChecks');
            const modelId = config.get('modelId') as string;
            const inEditorFeedback = config.get('inEditorFeedback', true);
            const scope = String(config.get('scope', 'wholeFile'));
            
            if (!modelId) {
                vscode.window.showErrorMessage('No language model configured. Please set vibeChecks.modelId in settings.');
                throw new Error('No language model configured. Please set vibeChecks.modelId in settings.');
            }

            // Get content to check
            if (!document) {
                vscode.window.showErrorMessage('No document provided for Vibe Check.');
                return { passed: false, errors: ['No document provided for Vibe Check.'], warnings: [] };
            }
            const fileContent = document.getText();

            // --- Caching logic ---
            const instructionsHash = crypto.createHash('sha256').update(instructions).digest('hex');
            const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
            const cacheKey = workspaceRoot && filePath ? path.relative(workspaceRoot, filePath) : filePath;
            const cached = this.cache.get(cacheKey);
            if (cached && cached.instructionsHash === instructionsHash && cached.fileHash === fileHash) {
                const result = parseResponse(cached.response);
                this.outputResults(result, filePath, showNotification);
                if (inEditorFeedback && document) {
                    this.diagnostics.showDiagnostics(result, document);
                }
                return result;
            }
            // Call language model
            const response = await callLanguageModel(instructions, fileContent, modelId, filePath, document.languageId);
            // Cache the result
            this.cache.set(cacheKey, { instructionsHash, fileHash, response });
            // Analyze result
            const result = parseResponse(response);

            // Output results
            this.outputResults(result, filePath, showNotification);

            // In-editor feedback
            if (inEditorFeedback && document) {
                this.diagnostics.showDiagnostics(result, document);
            }

            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`❌ Error: ${errorMsg}`);
            return { passed: false, errors: [errorMsg], warnings: [] };
        }
    }

    /**
     * Run vibe checks on all changed, staged, and new files in the repository.
     */
    async runCheckOnRepoChanges() {
        this.outputChannel.show();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }
        this.outputChannel.appendLine('🔎 Running Vibe Checks on all changed files in the repository...');
        const { execSync } = require('child_process');
        let statusOutput = '';
        try {
            statusOutput = execSync('git status --porcelain', { cwd: workspaceRoot }).toString();
        } catch (e) {
            vscode.window.showErrorMessage('Failed to get git status.');
            return;
        }
        // Use the new utility to filter candidates
        const files = getVibeCheckCandidatesFromGitStatus(statusOutput);
        if (files.length === 0) {
            this.outputChannel.appendLine('✅ No changed files to check.');
            vscode.window.showInformationMessage('No changed files to check.');
            return;
        }

        const instructions = await getInstructions();
        if (!instructions) {
            return;
        }

        let totalErrors = 0;
        let totalWarnings = 0;
        let failedFiles: string[] = [];
        for (const file of files) {
            const absPath = require('path').join(workspaceRoot, file.filename);
            let document: vscode.TextDocument | undefined = undefined;
            try {
                document = await vscode.workspace.openTextDocument(absPath);
            } catch (e) {
                this.outputChannel.appendLine(`⚠️  Could not open file: ${file.filename}`);
                continue;
            }
            const result = await this.runCheck(document, instructions, false);
            if (!result.passed) {
                failedFiles.push(file.filename);
            }
            totalErrors += result.errors.length;
            totalWarnings += result.warnings.length;
        }
        // Summary
        this.outputChannel.appendLine('\n===== It\'s Giving... =====');
        if (failedFiles.length > 0) {
            this.outputChannel.appendLine(`❌ Shambles 💔 ${failedFiles.length} file(s) failed: ${failedFiles.join(', ')}`);
            vscode.window.showErrorMessage(`Vibe Checks: ${failedFiles.length} file(s) failed, ${totalErrors} errors, ${totalWarnings} warnings.`);
        } else if (totalWarnings > 0) {
            this.outputChannel.appendLine(`⚠️ Concern ✨ - ${totalWarnings} warning(s) found.`);
            vscode.window.showWarningMessage(`Vibe Checks: All files passed, but ${totalWarnings} warning(s) found.`);
        } else {
            this.outputChannel.appendLine('✅ Flawless 💅');
            vscode.window.showInformationMessage('Vibe Checks: All changed files passed!');
        }
    }

    private outputResults(result: CheckResult, filePath?: string, showNotification: boolean = true): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relPath = filePath && workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath || '';
        if (result.passed) {
            this.outputChannel.appendLine('✅ Immaculate 💅');
        } else {
            this.outputChannel.appendLine('❌ Off 💀');
        }

        function formatLintMessage(msg: string | { line: number | null, message: string }, idx: number, relPath: string): string {
            if (typeof msg === 'string') return `${idx + 1}. ${relPath}: ${msg}`;
            const loc = msg.line !== null ? `:${msg.line}` : '';
            return `${idx + 1}. ${relPath}${loc} ${msg.message}`;
        }

        if (result.errors.length > 0) {
            this.outputChannel.appendLine(`\n🚫 Bad:`);
            result.errors.forEach((error, index) => {
                this.outputChannel.appendLine(formatLintMessage(error, index, relPath));
            });
        }

        if (result.warnings.length > 0) {
            this.outputChannel.appendLine(`\n🤨 Not great:`);
            result.warnings.forEach((warning, index) => {
                this.outputChannel.appendLine(formatLintMessage(warning, index, relPath));
            });
        }

        // Show notification
        if (showNotification) {
            if (!result.passed) {
                vscode.window.showErrorMessage(`Vibe Check failed with ${result.errors.length} errors in ${relPath}`);
            } else if (result.warnings.length > 0) {
                vscode.window.showWarningMessage(`Vibe Check passed with ${result.warnings.length} warnings in ${relPath}`);
            } else {
                vscode.window.showInformationMessage('Vibe Check passed successfully!');
            }
        }
    }

    public clearDiagnostics(document: vscode.TextDocument) {
        this.diagnostics.clearDiagnostics(document);
    }

    clearCache() {
        this.cache.clear();
        if (this.cacheFilePath && fs.existsSync(this.cacheFilePath)) {
            try {
                this.cache.deleteFile();
                vscode.window.showInformationMessage('Vibe Checks cache cleared.');
            } catch (e) {
                vscode.window.showWarningMessage('Failed to delete Vibe Checks cache file.');
            }
        } else {
            vscode.window.showInformationMessage('Vibe Checks cache cleared.');
        }
    }

    dispose() {
        this.outputChannel.dispose();
        this.diagnostics.dispose();
    }
}