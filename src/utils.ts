import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export const execAsync = promisify(exec);


export function resolveWorkspacePath(configPath: string): string {
        if (!vscode.workspace.workspaceFolders?.[0]) {
            throw new Error('No workspace folder opened');
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return configPath.replace('${workspaceFolder}', workspaceRoot);
    }

export async function readInstructions(instructionsFolder: string, languageId?: string): Promise<string> {
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