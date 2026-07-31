import * as vscode from 'vscode';
import { CONFIG_SECTION, readSettings, type Settings } from './configuration/settings';
import { resolveProjectName } from './project/projectName';
import { ProjectStatusBar } from './ui/statusBar';

function currentName(settings: Settings): string | undefined {
	return resolveProjectName(
		{ name: vscode.workspace.name, folders: vscode.workspace.workspaceFolders },
		settings.label
	);
}

export function activate(context: vscode.ExtensionContext): void {
	const statusBar = new ProjectStatusBar();

	const refresh = (): void => {
		const settings = readSettings();
		statusBar.update(currentName(settings), settings.statusBar);
	};

	context.subscriptions.push(
		statusBar,
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(CONFIG_SECTION)) {
				refresh();
			}
		}),
		// The name can change without any settings change.
		vscode.workspace.onDidChangeWorkspaceFolders(refresh),
		// Only a transition INTO focus announces; losing focus is silent, and the
		// window that is already focused at startup is not announced either.
		vscode.window.onDidChangeWindowState((state) => {
			if (state.focused) {
				statusBar.flash();
			}
		})
	);

	refresh();
}

export function deactivate(): void {
	// Everything is disposed through context.subscriptions.
}
