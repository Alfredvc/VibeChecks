import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';


function resolveWorkspacePath(configPath: string): string {
        if (!vscode.workspace.workspaceFolders?.[0]) {
            throw new Error('No workspace folder opened');
        }

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return configPath.replace('${workspaceFolder}', workspaceRoot);
    }

export async function getInstructions(): Promise<string | null> {
    const instructionsFolder = resolveWorkspacePath(vscode.workspace.getConfiguration('vibeChecks').get('instructionsFolder') as string);
    const maybeInstructions = await loadInstructions(instructionsFolder);
    if (maybeInstructions === null) {
        vscode.window.showErrorMessage('Vibe Checks: Add instructions to your .vibe-checks folder. ');
    }
    return maybeInstructions;
}
    

async function loadInstructions(instructionsFolder: string): Promise<string | null> {
    if (!fs.existsSync(instructionsFolder)) {
        fs.mkdirSync(instructionsFolder, { recursive: true });
    }

    const files = fs.readdirSync(instructionsFolder)
        .filter(file => file.endsWith('.md'))
        .sort();

    if (files.length === 0) {
        return null; 
    }

    const contents = files.map(file => fs.readFileSync(path.join(instructionsFolder, file), 'utf8'));
    return contents.join('\n');

}

export function sourceCodeWithLineNumbers(sourceCode: string): string {
    return sourceCode
        .split('\n')
        .map((line, index) => `${index + 1} ${line}`)
        .join('\n');
}