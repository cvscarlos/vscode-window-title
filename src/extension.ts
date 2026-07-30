import * as vscode from 'vscode';
import { CONFIG_SECTION, readSettings, type Settings } from './configuration/settings';
import { HudController } from './hud/hudController';
import { Logger } from './log';
import { resolveProjectName } from './project/projectName';
import { ProjectStatusBar } from './ui/statusBar';

function currentName(settings: Settings): string | undefined {
	return resolveProjectName(
		{ name: vscode.workspace.name, folders: vscode.workspace.workspaceFolders },
		settings.label
	);
}

export function activate(context: vscode.ExtensionContext): void {
	const log = new Logger();
	const statusBar = new ProjectStatusBar();
	const hud = new HudController(context, log);

	const refreshBadge = (): void => {
		const settings = readSettings();
		statusBar.update(currentName(settings), settings.statusBar);
	};

	const refreshAll = (): void => {
		refreshBadge();
		// Deliberately not awaited: patching must never delay activation.
		void hud.sync(readSettings());
	};

	context.subscriptions.push(
		log,
		statusBar,
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(CONFIG_SECTION)) {
				refreshAll();
			}
		}),
		// The announced name can change without any settings change.
		vscode.workspace.onDidChangeWorkspaceFolders(refreshBadge),
		vscode.commands.registerCommand('ntWindowTitle.enableHud', () =>
			hud.enable('hud', readSettings())
		),
		vscode.commands.registerCommand('ntWindowTitle.disableHud', () => hud.disable('hud')),
		vscode.commands.registerCommand('ntWindowTitle.enableTitleBarPill', () =>
			hud.enable('titleBarPill', readSettings())
		),
		vscode.commands.registerCommand('ntWindowTitle.disableTitleBarPill', () =>
			hud.disable('titleBarPill')
		),
		vscode.commands.registerCommand('ntWindowTitle.reapplyInjection', () =>
			hud.reapply(readSettings())
		),
		vscode.commands.registerCommand('ntWindowTitle.showOutput', () => log.show())
	);

	refreshAll();
}

export function deactivate(): void {
	// Everything is disposed through context.subscriptions.
}
