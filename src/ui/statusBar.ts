import * as vscode from 'vscode';
import { isHexColor, type StatusBarSettings, type StatusBarSide } from '../configuration/settings';

/**
 * How long the badge refuses to re-flash after flashing. Focus events arrive in
 * bursts when a window is dragged or an OS overlay closes; without this the badge
 * would strobe. Not configurable — a correctness guard, not taste. The command
 * bypasses it, because there the user asked for the flash directly.
 */
const MIN_FLASH_INTERVAL_MS = 400;

export interface BadgeStyle {
	text: string;
	/** Render as a filled pill using the theme's prominent background. */
	prominent: boolean;
	/** Undefined while prominent: that background supplies its own foreground. */
	color: string | undefined;
}

/**
 * How the badge should look. Pure, so the decision is testable without a live
 * `StatusBarItem` — the class below only applies the result.
 */
export function badgeStyle(
	name: string,
	settings: StatusBarSettings,
	flashing: boolean
): BadgeStyle {
	const icon = settings.icon === '' ? '' : `$(${settings.icon}) `;
	return {
		text: `${icon}${name}`,
		prominent: flashing,
		// Setting a foreground on top of the prominent background fights it and can
		// render unreadably, so the flash leaves the color to the theme.
		color: flashing ? undefined : settings.color,
	};
}

/**
 * The project badge, and the focus announcement.
 *
 * At rest this holds no timer: one exists only while a flash is on screen, and it
 * is cleared on the next flash and on disposal.
 *
 * The flash uses `statusBarItem.warningBackground` because it is one of only two
 * background colors VS Code honours on a status-bar item (the other is the error
 * red). That makes the badge a filled pill for a moment — the standard "look at
 * me" treatment in the status bar — rather than a color of our choosing.
 */
export class ProjectStatusBar {
	private item: vscode.StatusBarItem | undefined;
	private alignment: StatusBarSide | undefined;

	private name: string | undefined;
	private settings: StatusBarSettings | undefined;

	private flashing = false;
	private flashTimer: NodeJS.Timeout | undefined;
	private lastFlashAt = 0;

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
		// Gives the badge a button role for screen readers, and makes clicking it
		// re-announce — the only way to see the name again without switching windows.
		item.command = 'ntWindowTitle.announceProjectName';
		this.item = item;
		this.alignment = alignment;
		return item;
	}

	private disposeItem(): void {
		this.item?.dispose();
		this.item = undefined;
		this.alignment = undefined;
	}

	/** Single place that decides how the badge looks, flashing or not. */
	private render(): void {
		const { name, settings } = this;
		if (name === undefined || settings === undefined || !settings.enabled) {
			this.disposeItem();
			return;
		}

		const style = badgeStyle(name, settings, this.flashing);
		const item = this.ensureItem(settings.alignment);
		item.text = style.text;
		item.tooltip = `Project: ${name}`;
		item.backgroundColor = style.prominent
			? new vscode.ThemeColor('statusBarItem.warningBackground')
			: undefined;
		item.color =
			style.color === undefined
				? undefined
				: isHexColor(style.color)
					? style.color
					: new vscode.ThemeColor(style.color);
		item.show();
	}

	update(name: string | undefined, settings: StatusBarSettings): void {
		this.name = name;
		this.settings = settings;
		this.render();
	}

	/**
	 * Briefly makes the badge prominent, so a window switch is noticeable without
	 * anything being drawn over the editor.
	 */
	flash(force = false): void {
		const settings = this.settings;
		if (settings === undefined || !settings.enabled || !settings.flashOnFocus) {
			return;
		}
		if (this.name === undefined) {
			return;
		}

		const now = Date.now();
		if (!force && now - this.lastFlashAt < MIN_FLASH_INTERVAL_MS) {
			return;
		}
		this.lastFlashAt = now;

		this.flashing = true;
		this.render();

		if (this.flashTimer !== undefined) {
			clearTimeout(this.flashTimer);
		}
		this.flashTimer = setTimeout(() => {
			this.flashTimer = undefined;
			this.flashing = false;
			this.render();
		}, settings.flashMilliseconds);
	}

	dispose(): void {
		if (this.flashTimer !== undefined) {
			clearTimeout(this.flashTimer);
			this.flashTimer = undefined;
		}
		this.disposeItem();
	}
}
