import * as vscode from 'vscode';
import { VibeChecksProvider } from './vibe-checks-provider';
import { getInstructions } from './instructions';


export function activate(context: vscode.ExtensionContext) {
    const provider = new VibeChecksProvider(context);
    const config = vscode.workspace.getConfiguration('vibeChecks');
    const runOn = String(config.get('runOn', 'onCommand'));

    // Register commands
    const runCheckFileCommand = vscode.commands.registerCommand('vibeChecks.runCheckFile', async () => {
        await provider.runCheckOnActiveEditor();
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
                const instructions = await getInstructions();
                if (!instructions) {
                    return;
                }
                await provider.runCheck(doc, instructions);
            })
        );
    } else if (runOn === 'onOpen') {
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(async (doc) => {
                const instructions = await getInstructions();
                if (!instructions) {
                    return;
                }
                await provider.runCheck(doc, instructions);
            })
        );
    } else if (runOn === 'onChange') {
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(async (e) => {
                if (provider.debounceTimer) clearTimeout(provider.debounceTimer);
                provider.debounceTimer = setTimeout(async () => {
                    const instructions = await getInstructions();
                    if (!instructions) {
                        return;
                    }
                    await provider.runCheck(e.document, instructions);
                }, 1500);
            })
        );
    }

    const hasActivated = context.globalState.get<boolean>('vibeChecksActivated');
    if (!hasActivated) {
        vscode.window.showInformationMessage(
            'Vibe Checks extension activated! Use "Configure Vibe Checks" to set up your language model.'
        );
        context.globalState.update('vibeChecksActivated', true);
    }
}

export function deactivate() { }