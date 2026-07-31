import * as vscode from 'vscode';
import { isHexColor, readableTextOn } from '../configuration/settings';

/**
 * Colors VS Code's Command Center so the project name in the title bar reads as
 * a filled pill.
 *
 * An extension cannot draw in the title bar — VS Code's allowlist of
 * contributable menus has no title-bar id, which is why the patched-in pill was
 * removed in 2.0.0. What it *can* do is write the settings a user would write by
 * hand. Everything here is a supported setting; nothing is patched.
 */
const KEYS = [
	'commandCenter.background',
	'commandCenter.foreground',
	'commandCenter.border',
	'commandCenter.activeBackground',
	'commandCenter.activeForeground',
	'commandCenter.activeBorder',
] as const;

/**
 * The customizations to write, merged over whatever is already there.
 *
 * Pure, and merging rather than replacing is the point: a user's
 * `workbench.colorCustomizations` commonly holds unrelated keys and per-theme
 * blocks, and overwriting the object would silently destroy them.
 */
export function titleBarCustomizations(
	existing: Record<string, unknown>,
	color: string
): Record<string, unknown> {
	const foreground = readableTextOn(color);
	return {
		...existing,
		'commandCenter.background': color,
		'commandCenter.foreground': foreground,
		'commandCenter.border': color,
		'commandCenter.activeBackground': color,
		'commandCenter.activeForeground': foreground,
		'commandCenter.activeBorder': color,
	};
}

/** Removes only our keys, leaving every other customization untouched. */
export function withoutTitleBarCustomizations(
	existing: Record<string, unknown>
): Record<string, unknown> {
	const next = { ...existing };
	for (const key of KEYS) {
		delete next[key];
	}
	return next;
}

function colorCustomizations(): Record<string, unknown> {
	const value = vscode.workspace.getConfiguration('workbench').get('colorCustomizations');
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

async function write(
	next: Record<string, unknown> | undefined,
	commandCenter: boolean | undefined
) {
	const workbench = vscode.workspace.getConfiguration('workbench');
	await workbench.update('colorCustomizations', next, vscode.ConfigurationTarget.Workspace);
	await vscode.workspace
		.getConfiguration('window')
		.update('commandCenter', commandCenter, vscode.ConfigurationTarget.Workspace);
}

export async function colorTitleBar(color: string): Promise<void> {
	if (vscode.workspace.workspaceFolders === undefined) {
		void vscode.window.showInformationMessage(
			'Open a folder first — this writes to the workspace settings.'
		);
		return;
	}

	if (!isHexColor(color)) {
		void vscode.window.showInformationMessage(
			`Set ntWindowTitle.statusBar.color to a hex color first — "${color}" cannot be used for the title bar, because a readable text color has to be derived from it.`
		);
		return;
	}

	const choice = await vscode.window.showWarningMessage(
		'Color the title bar for this project?',
		{
			modal: true,
			detail:
				'This writes window.commandCenter and workbench.colorCustomizations into this workspace, which usually means .vscode/settings.json — a file that is often committed, so your team may see it.\n\nNothing else is modified, and "Window Title nt: Clear Title Bar Color" undoes it.',
		},
		'Color It'
	);
	if (choice !== 'Color It') {
		return;
	}

	await write(titleBarCustomizations(colorCustomizations(), color), true);
}

export async function clearTitleBarColor(): Promise<void> {
	const next = withoutTitleBarCustomizations(colorCustomizations());
	// Leave window.commandCenter alone: the user may have wanted it before we did.
	await write(Object.keys(next).length === 0 ? undefined : next, undefined);
}
