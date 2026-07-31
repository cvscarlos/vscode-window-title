import * as vscode from 'vscode';
import { CONFIG_SECTION, readSettings, type Settings } from './configuration/settings';
import { resolveProjectName } from './project/projectName';
import { EditorAnnouncement } from './ui/editorAnnouncement';
import { ProjectStatusBar } from './ui/statusBar';

function currentName(settings: Settings): string | undefined {
	return resolveProjectName(
		{ name: vscode.workspace.name, folders: vscode.workspace.workspaceFolders },
		settings.label
	);
}

/**
 * Whether this window-state change is the user switching *into* this window.
 *
 * `onDidChangeWindowState` also fires when `WindowState.active` changes, which is
 * driven by a ten-second user-idle timer — so testing `state.focused` on its own
 * announces during ordinary work in a window that never lost focus.
 */
export function isFocusGain(previous: boolean, next: boolean): boolean {
	return !previous && next;
}

export function activate(context: vscode.ExtensionContext): void {
	const statusBar = new ProjectStatusBar();
	const announcement = new EditorAnnouncement();

	const refresh = (): void => {
		const settings = readSettings();
		statusBar.update(currentName(settings), settings.statusBar);
	};

	// `force` marks the command path: it skips the burst throttle, because there the
	// user asked for this one deliberately rather than by switching windows.
	const announce = (force: boolean): void => {
		const settings = readSettings();
		const name = currentName(settings);
		if (name === undefined) {
			// Silent on a focus change — an empty window has nothing to announce and
			// says so through the missing badge. Invoked by hand it must answer.
			if (force) {
				void vscode.window.showInformationMessage(
					'Window Title nt: this window has no project. Open a folder to see its name.'
				);
			}
			return;
		}
		announcement.announce(name, settings.editorAnnouncement, force);
		statusBar.flash(force);
	};

	// The window is focused at activation, so the first transition to watch for is
	// away and back.
	let focused = vscode.window.state.focused;

	context.subscriptions.push(
		statusBar,
		announcement,
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(CONFIG_SECTION)) {
				refresh();
			}
		}),
		// The name can change without any settings change.
		vscode.workspace.onDidChangeWorkspaceFolders(refresh),
		vscode.window.onDidChangeWindowState((state) => {
			const gained = isFocusGain(focused, state.focused);
			focused = state.focused;
			if (gained) {
				announce(false);
			}
		}),
		vscode.commands.registerCommand('ntWindowTitle.announceProjectName', () => announce(true))
	);

	refresh();
}

export function deactivate(): void {
	// Everything is disposed through context.subscriptions.
}
