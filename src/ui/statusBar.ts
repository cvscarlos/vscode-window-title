import * as vscode from 'vscode';
import { isHexColor, type StatusBarSettings, type StatusBarSide } from '../configuration/settings';
import { NAME_CLOSE, NAME_OPEN } from '../hud/markers';

/**
 * The always-visible project badge.
 *
 * Deliberately timer-free: the badge only changes when the workspace or the
 * settings change, so at rest it costs nothing. Announcing a focus change is the
 * HUD's job, inside the renderer.
 */
export class ProjectStatusBar {
	private item: vscode.StatusBarItem | undefined;
	private alignment: StatusBarSide | undefined;

	/**
	 * Alignment is fixed when a status-bar item is created, so a change of side
	 * means a new item.
	 */
	private ensureItem(alignment: StatusBarSide): vscode.StatusBarItem {
		if (this.item !== undefined && this.alignment === alignment) {
			return this.item;
		}

		this.disposeItem();
		const side =
			alignment === 'right' ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
		// A high priority keeps the project name at the outer edge of its side,
		// which is where the eye lands.
		const item = vscode.window.createStatusBarItem('projectName', side, 1_000_000);
		item.name = 'Project Name';
		this.item = item;
		this.alignment = alignment;
		return item;
	}

	private disposeItem(): void {
		this.item?.dispose();
		this.item = undefined;
		this.alignment = undefined;
	}

	update(name: string | undefined, settings: StatusBarSettings): void {
		if (name === undefined || !settings.enabled) {
			this.disposeItem();
			return;
		}

		const item = this.ensureItem(settings.alignment);
		const icon = settings.icon === '' ? '' : `$(${settings.icon}) `;

		// The markers wrap the name only, so the HUD reads it back exactly.
		item.text = `${icon}${NAME_OPEN}${name}${NAME_CLOSE}`;
		item.tooltip = `Project: ${name}`;
		item.color = isHexColor(settings.color)
			? settings.color
			: new vscode.ThemeColor(settings.color);
		item.show();
	}

	dispose(): void {
		this.disposeItem();
	}
}
