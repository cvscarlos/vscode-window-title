import * as vscode from 'vscode';

export const CONFIG_SECTION = 'ntWindowTitle';

const DEFAULT_STATUS_BAR_COLOR = '#22D3EE';
const DEFAULT_ICON = 'window';

export type StatusBarSide = 'left' | 'right';

export interface StatusBarSettings {
	enabled: boolean;
	alignment: StatusBarSide;
	/** Hex color or theme color id — already validated. */
	color: string;
	/** Codicon name, or '' for no icon — already validated. */
	icon: string;
}

export interface Settings {
	label: string;
	statusBar: StatusBarSettings;
}

const HEX_COLOR = /^#(?:[\dA-Fa-f]{3,4}|[\dA-Fa-f]{6}|[\dA-Fa-f]{8})$/;
const THEME_COLOR_ID = /^[A-Za-z]+(?:\.[\dA-Za-z]+)+$/;
const CODICON_NAME = /^[\da-z-]+$/;

export function isHexColor(raw: string): boolean {
	return HEX_COLOR.test(raw);
}

/**
 * Accepts a hex color or a theme color id; anything else falls back. A theme id
 * lets the badge follow the active theme, which `StatusBarItem.color` resolves
 * through `ThemeColor`.
 */
export function sanitizeColor(raw: string, fallback: string): string {
	const value = raw.trim();
	if (isHexColor(value) || THEME_COLOR_ID.test(value)) {
		return value;
	}
	return fallback;
}

export function sanitizeCodicon(raw: string): string {
	const value = raw.trim().replace(/^\$\((.*)\)$/, '$1');
	return CODICON_NAME.test(value) ? value : '';
}

/**
 * Settings arrive as raw JSON — the type parameter on `get` is a claim, not a
 * guarantee. A number where a string belongs would throw out of `readSettings`,
 * which propagates out of `activate` and takes the extension down with it.
 */
function readString(config: vscode.WorkspaceConfiguration, key: string, fallback: string): string {
	const value = config.get(key);
	return typeof value === 'string' ? value : fallback;
}

function readBoolean(
	config: vscode.WorkspaceConfiguration,
	key: string,
	fallback: boolean
): boolean {
	const value = config.get(key);
	return typeof value === 'boolean' ? value : fallback;
}

export function readSettings(): Settings {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

	return {
		label: readString(config, 'label', '').trim(),
		statusBar: {
			enabled: readBoolean(config, 'statusBar.enabled', true),
			alignment: readString(config, 'statusBar.alignment', 'left') === 'right' ? 'right' : 'left',
			color: sanitizeColor(
				readString(config, 'statusBar.color', DEFAULT_STATUS_BAR_COLOR),
				DEFAULT_STATUS_BAR_COLOR
			),
			icon: sanitizeCodicon(readString(config, 'statusBar.icon', DEFAULT_ICON)),
		},
	};
}
