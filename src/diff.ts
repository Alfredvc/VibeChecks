import * as vscode from 'vscode';
import { execAsync } from "./utils";
import * as path from 'path';


export async function getGitDiffForFile(filePath: string): Promise<string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return '';
    const relPath = path.relative(workspaceRoot, filePath);
    try {
        const { stdout } = await execAsync(`git diff ${relPath}`, { cwd: workspaceRoot });
        return stdout;
    } catch {
        return '';
    }
}