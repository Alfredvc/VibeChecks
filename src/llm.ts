import { buildPrompt } from "./prompt";
import { CheckResult } from "./types";

import * as path from 'path';
import * as vscode from 'vscode';

export async function callLanguageModel(instructions: string, sourceCode: string, modelId: string, filePath: string, languageId: string): Promise<string> {
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
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const relPath = workspaceRoot && filePath ? path.relative(workspaceRoot, filePath) : filePath || '';
        const prompt = buildPrompt(instructions, sourceCode, relPath, languageId);

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
            } catch (e) {/* ignore */ }
        }

        const maxInputTokens = targetModel.maxInputTokens;

        if (prompt.length > maxInputTokens) {
            throw new Error(`Prompt exceeds model's max input tokens (${maxInputTokens}). Check smaller files or choose another model.`);
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(prompt)
        ];

        const request = await targetModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let response = '';
        for await (const fragment of request.text) {
            response += fragment;
        }

        if (debugPrompt) {
            try {
                const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (wsRoot) {
                    const fs = require('fs');
                    fs.writeFileSync(require('path').join(wsRoot, 'debug-response.json'), JSON.stringify({ response }, null, 2), 'utf-8');
                }
            } catch (e) {/* ignore */ }
        }

        return response;

    } catch (error) {
        let details = ''
        try {
            const models = await vscode.lm.selectChatModels();
            const targetModel = models.find(model => model.id === modelId);
            if (targetModel && targetModel.family === 'copilot') {
                details = "There might be something wrong with Github Copilot. Check https://githubstatus.com ";
            }
        } catch {
            // Ignore errors while fetching models
        }
        throw new Error(`Language model request failed: ${error}${details}`);
    }
}

export function parseResponse(response: string): CheckResult {
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