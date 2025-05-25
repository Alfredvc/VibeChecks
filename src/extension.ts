import * as vscode from 'vscode';
import { VibeChecksProvider } from './vibe-checks-provider';


export function activate(context: vscode.ExtensionContext) {
    const provider = new VibeChecksProvider(context);
    const config = vscode.workspace.getConfiguration('vibeChecks');
    const runOn = String(config.get('runOn', 'onCommand'));

    // Register commands
    const runCheckFileCommand = vscode.commands.registerCommand('vibeChecks.runCheckFile', async (fileUri?: vscode.Uri) => {
        if (fileUri && fileUri instanceof vscode.Uri) {
            const document = await vscode.workspace.openTextDocument(fileUri);
            await provider.runCheck(document);
        } else {
            await provider.runCheckOnActiveEditor();
        }
    });
    const chooseModelCommand = vscode.commands.registerCommand('vibeChecks.chooseModel', async () => {
        const config = vscode.workspace.getConfiguration('vibeChecks');
        // Show available models and let user select
        try {
            const models = await vscode.lm.selectChatModels();
            const modelItems = models.map(model => ({
                label: model.id,
                description: `${model.vendor}: ${model.name}`,
            }));

            const selectedModel = await vscode.window.showQuickPick(modelItems, {
                placeHolder: 'Select a language model for Vibe Checks'
            });

            if (selectedModel) {
                await config.update('modelId', selectedModel.label, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Vibe Checks configured to use: ${selectedModel.label}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to load available models. Make sure you have access to VSCode Language Model API.');
        }
    });
    const clearCacheCommand = vscode.commands.registerCommand('vibeChecks.clearCache', () => {
        provider.clearCache();
    });
    const openSettingsCommand = vscode.commands.registerCommand('vibeChecks.openSettings', async () => {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:alfredvc.vibe-checks ');
    });
    const runCheckRepoCommand = vscode.commands.registerCommand('vibeChecks.runCheckRepo', async () => {
        await provider.runCheckOnRepoChanges();
    });
    context.subscriptions.push(
        runCheckFileCommand,
        chooseModelCommand,
        clearCacheCommand,
        openSettingsCommand,
        provider,
        runCheckRepoCommand
    );

    // Register triggers
    if (runOn === 'onSave') {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (doc) => {
                await provider.runCheck(doc);
            })
        );
    } else if (runOn === 'onOpen') {
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(async (doc) => {
                await provider.runCheck(doc);
            })
        );
    } else if (runOn === 'onChange') {
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                if (provider.debounceTimer) clearTimeout(provider.debounceTimer);
                provider.debounceTimer = setTimeout(async () => {
                    await provider.runCheck(e.document);
                }, 1500);
            })
        );
    }

    vscode.window.showInformationMessage(
        'Vibe Checks extension activated! Use "Configure Vibe Checks" to set up your language model.'
    );
}

export function deactivate() {}