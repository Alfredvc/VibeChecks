import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { buildPrompt } from './prompt';
import { getGitDiffForFile } from './diff';
import { CheckResult, LintMessage } from './types';


export class VibeChecksProvider {
    private outputChannel: vscode.OutputChannel;
    private diagnosticCollection: vscode.DiagnosticCollection;
    public debounceTimer: NodeJS.Timeout | undefined;
    private cache: Map<string, { instructionsHash: string; fileHash: string; response: string }> = new Map();
    private cacheFilePath: string;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Vibe Checks');
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('vibeChecks');
        this.context = context;
        // Determine storage path
        const storageUri = context.storageUri || context.globalStorageUri;
        this.cacheFilePath = storageUri ? path.join(storageUri.fsPath, 'vibe-checks-cache.json') : '';
        this.loadCacheFromDisk();
    }

    private loadCacheFromDisk() {
        try {
            if (this.cacheFilePath && fs.existsSync(this.cacheFilePath)) {
                const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
                const obj = JSON.parse(raw);
                this.cache = new Map(Object.entries(obj));
            }
        } catch (e) {
            this.outputChannel?.appendLine('⚠️ Failed to load Vibe Checks cache from disk.');
        }
    }

    private saveCacheToDisk() {
        try {
            if (this.cacheFilePath) {
                const obj = Object.fromEntries(this.cache.entries());
                fs.mkdirSync(path.dirname(this.cacheFilePath), { recursive: true });
                fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj), 'utf-8');
            }
        } catch (e) {
            this.outputChannel?.appendLine('⚠️ Failed to save Vibe Checks cache to disk.');
        }
    }

    async runCheckOnActiveEditor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor to run Vibe Check on.');
            return;
        }
        // Only run on the active editor, never fallback to workspace diff
        await this.runCheck(editor.document);
    }

    async runCheck(document: vscode.TextDocument): Promise<CheckResult> {
        try {
            this.outputChannel.show();
            const filePath = document?.uri.fsPath;
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const relPath = filePath && workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath || '';
            this.outputChannel.appendLine(`🚀 Vibe checking ${relPath}`);

            // Get configuration
            const config = vscode.workspace.getConfiguration('vibeChecks');
            const instructionsFolder = this.resolveWorkspacePath(config.get('instructionsFolder') as string);
            const modelId = config.get('modelId') as string;
            const inEditorFeedback = config.get('inEditorFeedback', true);
            const scope = String(config.get('scope', 'wholeFile'));

            if (!modelId) {
                vscode.window.showErrorMessage('No language model configured. Please set vibeChecks.modelId in settings.');
                throw new Error('No language model configured. Please set vibeChecks.modelId in settings.');
            }

            // Read instructions (language-aware)
            const languageId = document ? document.languageId : undefined;
            let instructions = '';
            try {
                instructions = await this.readInstructions(instructionsFolder, languageId);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('Instructions folder not found')) {
                    vscode.window.showErrorMessage('Vibe Checks: No instructions folder found. Please create a .vibe-checks folder in your workspace and add at least one markdown (.md) file with your instructions.');
                } else if (msg.includes('No instructions found')) {
                    vscode.window.showErrorMessage('Vibe Checks: No instruction files found in your .vibe-checks folder. Please add at least one markdown (.md) file with your instructions.');
                } else {
                    vscode.window.showErrorMessage('Vibe Checks: ' + msg);
                }
                this.outputChannel.appendLine('❌ Error: ' + msg);
                return { passed: false, errors: [msg], warnings: [] };
            }

            // Get content to check
            if (!document) {
                vscode.window.showErrorMessage('No document provided for Vibe Check.');
                return { passed: false, errors: ['No document provided for Vibe Check.'], warnings: [] };
            }
            const fileContent = document.getText();
            let diff = '';
            if (scope === 'changedLines') {
                diff = await getGitDiffForFile(filePath);
            } else {
                diff = fileContent;
            }

            if (!diff.trim()) {
                this.outputChannel.appendLine('ℹ️  No changes detected or no files found to check.');
                if (inEditorFeedback && document) {
                    this.diagnosticCollection.set(document.uri, []);
                }
                return { passed: true, errors: [], warnings: [] };
            }

            // --- Caching logic ---
            const instructionsHash = crypto.createHash('sha256').update(instructions).digest('hex');
            const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
            const cacheKey = workspaceRoot && filePath ? path.relative(workspaceRoot, filePath) : filePath;
            const cached = this.cache.get(cacheKey);
            if (cached && cached.instructionsHash === instructionsHash && cached.fileHash === fileHash) {
                const result = this.analyzeResult(cached.response);
                this.outputResults(result, filePath);
                if (inEditorFeedback && document) {
                    this.showDiagnostics(result, document);
                }
                return result;
            }
            // Call language model
            this.outputChannel.appendLine('✨ Checking vibes...');
            const response = await this.callLanguageModel(instructions, diff, modelId);
            // Cache the result
            this.cache.set(cacheKey, { instructionsHash, fileHash, response });
            this.saveCacheToDisk();
            // Analyze result
            const result = this.analyzeResult(response);

            // Output results
            this.outputResults(result, filePath);

            // In-editor feedback
            if (inEditorFeedback && document) {
                this.showDiagnostics(result, document);
            }

            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`❌ Error: ${errorMsg}`);
            return { passed: false, errors: [errorMsg], warnings: [] };
        }
    }

    private resolveWorkspacePath(configPath: string): string {
        if (!vscode.workspace.workspaceFolders?.[0]) {
            throw new Error('No workspace folder opened');
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return configPath.replace('${workspaceFolder}', workspaceRoot);
    }

    private async readInstructions(instructionsFolder: string, languageId?: string): Promise<string> {
        if (!fs.existsSync(instructionsFolder)) {
            fs.mkdirSync(instructionsFolder, { recursive: true });
        }

        const files = fs.readdirSync(instructionsFolder)
            .filter(file => file.endsWith('.md'))
            .sort();

        if (files.length === 0) {
            throw new Error(`No markdown files found in: ${instructionsFolder}`);
        }

        let relevantInstructions = '';
        let generalInstructions = '';
        const lang = languageId ? languageId.toLowerCase() : '';

        for (const file of files) {
            const filePath = path.join(instructionsFolder, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            // Split by headings (## ...)
            const sections = content.split(/(^## .*$)/m);
            let foundLangSection = false;
            for (let i = 0; i < sections.length; i++) {
                const section = sections[i];
                if (/^##\s+/m.test(section)) {
                    // Check if this heading matches the language
                    if (lang && section.toLowerCase().includes(lang)) {
                        // Add this section and the next (the content)
                        relevantInstructions += `\n${section}\n${sections[i + 1] || ''}`;
                        foundLangSection = true;
                    }
                }
            }
            if (!foundLangSection) {
                // If no language-specific section, add the whole file as general
                generalInstructions += `\n# ${file}\n${content}\n`;
            }
        }
        // Prefer language-specific, else fallback to general
        return (relevantInstructions.trim() || generalInstructions.trim());
    }


    private async callLanguageModel(instructions: string, diff: string, modelId: string): Promise<string> {
        try {
            // Check if Language Model API is available
            if (!vscode.lm.selectChatModels) {
                throw new Error('VSCode Language Model API not available. Update to a newer version of VS Code.');
            }

            // Get available models
            const models = await vscode.lm.selectChatModels();
            const targetModel = models.find(model => model.id === modelId);

            if (!targetModel) {
                const availableModels = models.map(m => m.id).join(', ');
                throw new Error(`Model '${modelId}' not found. Available models: ${availableModels}`);
            }

            // Prepare the prompt
            const prompt = buildPrompt(instructions, diff);

            // Debug: Save prompt if debugPrompt is enabled
            const config = vscode.workspace.getConfiguration('vibeChecks');
            const debugPrompt = config.get('debugPrompt', false);
            if (debugPrompt) {
                try {
                    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (wsRoot) {
                        const fs = require('fs');
                        fs.writeFileSync(require('path').join(wsRoot, 'debug-prompt.json'), JSON.stringify({ prompt }, null, 2), 'utf-8');
                    }
                } catch (e) {/* ignore */}
            }

            // Create chat request
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const request = await targetModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let response = '';
            for await (const fragment of request.text) {
                response += fragment;
            }

            // Debug: Save response if debugPrompt is enabled
            if (debugPrompt) {
                try {
                    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (wsRoot) {
                        const fs = require('fs');
                        fs.writeFileSync(require('path').join(wsRoot, 'debug-response.json'), JSON.stringify({ response }, null, 2), 'utf-8');
                    }
                } catch (e) {/* ignore */}
            }

            return response;

        } catch (error) {
            throw new Error(`Language model request failed: ${error}`);
        }
    }

    private analyzeResult(response: string): CheckResult {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                // Fallback: treat entire response as summary and create default result
                return {
                    passed: true,
                    errors: [],
                    warnings: [`AI Response: ${response.substring(0, 200)}...`]
                };
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Normalize errors/warnings to only expect { line, message }
            function normalize(arr: any[]): (string | { line: number | null, message: string })[] {
                if (!Array.isArray(arr)) return [];
                return arr.map(item => {
                    if (typeof item === 'string') return item;
                    if (item && typeof item === 'object' && 'message' in item) {
                        return {
                            line: typeof item.line === 'number' ? item.line : null,
                            message: String(item.message)
                        };
                    }
                    return String(item);
                });
            }

            return {
                passed: parsed.passed ?? true,
                errors: normalize(parsed.errors),
                warnings: normalize(parsed.warnings)
            };

        } catch (error) {
            // If parsing fails, treat as warning
            return {
                passed: true,
                errors: [],
                warnings: [`Failed to parse AI response: ${response.substring(0, 200)}...`]
            };
        }
    }

    private outputResults(result: CheckResult, filePath?: string): void {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relPath = filePath && workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath || '';
        if (result.passed) {
            this.outputChannel.appendLine('✅ Vibes immaculate 💅');
        } else {
            this.outputChannel.appendLine('❌ Vibes off 💀');
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
        if (!result.passed) {
            vscode.window.showErrorMessage(`Vibe Check failed with ${result.errors.length} errors in ${relPath}`);
        } else if (result.warnings.length > 0) {
            vscode.window.showWarningMessage(`Vibe Check passed with ${result.warnings.length} warnings in ${relPath}`);
        } else {
            vscode.window.showInformationMessage('Vibe Check passed successfully!');
        }
    }

    private showDiagnostics(result: CheckResult, document: vscode.TextDocument) {
        const diagnostics: vscode.Diagnostic[] = [];
        for (const entry of result.errors) {
            if (typeof entry === 'string') {
                // Fallback: try to extract line number from string
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
                // LintMessage object
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

    public clearDiagnostics(document: vscode.TextDocument) {
        this.diagnosticCollection.set(document.uri, []);
    }

    clearCache() {
        this.cache.clear();
        if (this.cacheFilePath && fs.existsSync(this.cacheFilePath)) {
            try {
                fs.unlinkSync(this.cacheFilePath);
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
        this.diagnosticCollection.dispose();
    }
}