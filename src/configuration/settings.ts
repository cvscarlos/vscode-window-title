import * as vscode from 'vscode';

export const CONFIG_SECTION = 'ntWindowTitle';

const DEFAULT_STATUS_BAR_COLOR = '#22D3EE';
const DEFAULT_ICON = 'window';
const DEFAULT_DISPLAY_MILLISECONDS = 1100;
const DEFAULT_FONT_SIZE_PIXELS = 40;

/**
 * How long the HUD refuses to re-announce after showing. Focus/blur pairs arrive
 * in bursts when a window is dragged or an OS overlay closes; without this the
 * HUD would flicker. Not configurable — it is a correctness guard, not taste.
 */
export const MIN_INTERVAL_MILLISECONDS = 350;

export type StatusBarSide = 'left' | 'right';
export type HudPosition = 'center' | 'top';
export type HudFontFamily = 'ui' | 'mono';
export type PillPosition = 'left' | 'center' | 'right';

export interface StatusBarSettings {
	enabled: boolean;
	alignment: StatusBarSide;
	/** Hex color or theme color id — already validated. */
	color: string;
	/** Codicon name, or '' for no icon — already validated. */
	icon: string;
}

export interface HudSettings {
	enabled: boolean;
	showOnWindowOpen: boolean;
	displayMilliseconds: number;
	position: HudPosition;
	fontSizePixels: number;
	uppercase: boolean;
	/** CSS-ready: a hex literal or `var(--vscode-…)`; '' means the theme foreground. */
	color: string;
	fontFamily: HudFontFamily;
}

export interface TitleBarPillSettings {
	enabled: boolean;
	position: PillPosition;
	/** A validated hex color, or '' meaning "use the theme's button colors". */
	color: string;
	uppercase: boolean;
	fontFamily: HudFontFamily;
	/**
	 * Whether to outline the pill. Needed when the title bar happens to be the same
	 * color as the pill, which makes an unbordered pill invisible.
	 */
	bordered: boolean;
}

export interface Settings {
	label: string;
	statusBar: StatusBarSettings;
	hud: HudSettings;
	titleBarPill: TitleBarPillSettings;
}

const HEX_COLOR = /^#(?:[\dA-Fa-f]{3,4}|[\dA-Fa-f]{6}|[\dA-Fa-f]{8})$/;
const THEME_COLOR_ID = /^[A-Za-z]+(?:\.[\dA-Za-z]+)+$/;
const CODICON_NAME = /^[\da-z-]+$/;

export function isHexColor(raw: string): boolean {
	return HEX_COLOR.test(raw);
}

/**
 * Accepts a hex color or a theme color id. Everything else falls back, because
 * this value reaches both the VS Code API and generated CSS.
 */
export function sanitizeColor(raw: string, fallback: string): string {
	const value = raw.trim();
	if (isHexColor(value) || THEME_COLOR_ID.test(value)) {
		return value;
	}
	return fallback;
}

/** Hex only: the pill needs a literal it can derive a readable text color from. */
export function sanitizeHexColor(raw: string, fallback: string): string {
	const value = raw.trim();
	return isHexColor(value) ? value : fallback;
}

/**
 * Turns a setting into something safe to paste into the generated stylesheet:
 * a hex literal stays as-is, and a theme color id becomes the matching custom
 * property. VS Code exposes every theme color that way, replacing dots with
 * dashes — `terminal.ansiCyan` is `--vscode-terminal-ansiCyan`. Those properties
 * are defined on `.monaco-workbench`, which is why the overlay mounts inside it.
 *
 * Returns undefined for anything unrecognized, so callers fall back rather than
 * interpolating untrusted text into CSS.
 */
export function toCssColor(raw: string): string | undefined {
	const value = raw.trim();
	if (isHexColor(value)) {
		return value;
	}
	if (THEME_COLOR_ID.test(value)) {
		return `var(--vscode-${value.replaceAll('.', '-')})`;
	}
	return undefined;
}

export function sanitizeCodicon(raw: string): string {
	const value = raw.trim().replace(/^\$\((.*)\)$/, '$1');
	return CODICON_NAME.test(value) ? value : '';
}

export function clampNumber(raw: number, min: number, max: number, fallback: number): number {
	if (!Number.isFinite(raw)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, Math.round(raw)));
}

/**
 * Near-black or white, whichever stays readable on the given hex background.
 *
 * The title-bar pill lets you choose its background, so its text color has to be
 * derived rather than configured — otherwise a light pill renders white on white.
 * Uses the WCAG relative-luminance threshold.
 */
export function readableTextOn(hexColor: string): string {
	const hex = hexColor.replace('#', '');
	const full =
		hex.length === 3 || hex.length === 4
			? hex
					.slice(0, 3)
					.split('')
					.map((c) => c + c)
					.join('')
			: hex.slice(0, 6);

	const channel = (offset: number): number => {
		const value = Number.parseInt(full.slice(offset, offset + 2), 16) / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
	return luminance > 0.179 ? '#15151E' : '#FFFFFF';
}

/**
 * Settings arrive as raw JSON — the type parameter on `get` is a claim, not a
 * guarantee. A number where a string belongs used to throw out of `readSettings`,
 * which propagates out of `activate` and takes the whole extension down, badge
 * included. Coercing here keeps the "unrecognized input falls back" rule true.
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

function readNumber(config: vscode.WorkspaceConfiguration, key: string, fallback: number): number {
	const value = config.get(key);
	return typeof value === 'number' ? value : fallback;
}

export function readSettings(): Settings {
	const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

	const statusBarColor = sanitizeColor(
		readString(config, 'statusBar.color', DEFAULT_STATUS_BAR_COLOR),
		DEFAULT_STATUS_BAR_COLOR
	);

	// An unset HUD color reuses the status-bar color, so the badge and the overlay
	// agree by default. Both hex values and theme color ids work, since the overlay
	// lives inside .monaco-workbench where the --vscode-* properties are defined.
	//
	// Deliberately the GLOBAL status-bar color, not the effective one: the badge is
	// per-window and may legitimately be set per project, but the overlay is baked
	// into machine-global assets. Inheriting a workspace value would make the asset
	// hash differ per window, so every window would see the patch as stale and
	// re-apply it with its own color, fighting the others.
	const inheritedColor = sanitizeColor(
		typeof config.inspect<string>('statusBar.color')?.globalValue === 'string'
			? (config.inspect<string>('statusBar.color')?.globalValue as string)
			: DEFAULT_STATUS_BAR_COLOR,
		DEFAULT_STATUS_BAR_COLOR
	);
	const hudColorRaw = readString(config, 'hud.color', '').trim();
	const hudColor = toCssColor(hudColorRaw === '' ? inheritedColor : hudColorRaw) ?? '';

	// Anything other than left/center falls back to right, where VS Code puts its
	// own Update and Sign in pills.
	const pillPosition = readString(config, 'titleBarPill.position', 'right');

	return {
		label: readString(config, 'label', '').trim(),
		statusBar: {
			enabled: readBoolean(config, 'statusBar.enabled', true),
			alignment: readString(config, 'statusBar.alignment', 'left') === 'right' ? 'right' : 'left',
			color: statusBarColor,
			icon: sanitizeCodicon(readString(config, 'statusBar.icon', DEFAULT_ICON)),
		},
		hud: {
			enabled: readBoolean(config, 'hud.enabled', false),
			showOnWindowOpen: readBoolean(config, 'hud.showOnWindowOpen', true),
			displayMilliseconds: clampNumber(
				readNumber(config, 'hud.displayMilliseconds', DEFAULT_DISPLAY_MILLISECONDS),
				200,
				10_000,
				DEFAULT_DISPLAY_MILLISECONDS
			),
			position: readString(config, 'hud.position', 'center') === 'top' ? 'top' : 'center',
			fontSizePixels: clampNumber(
				readNumber(config, 'hud.fontSizePixels', DEFAULT_FONT_SIZE_PIXELS),
				10,
				200,
				DEFAULT_FONT_SIZE_PIXELS
			),
			uppercase: readBoolean(config, 'hud.uppercase', true),
			color: hudColor,
			fontFamily: readString(config, 'hud.fontFamily', 'mono') === 'ui' ? 'ui' : 'mono',
		},
		titleBarPill: {
			enabled: readBoolean(config, 'titleBarPill.enabled', false),
			position: pillPosition === 'left' || pillPosition === 'center' ? pillPosition : 'right',
			color: sanitizeHexColor(readString(config, 'titleBarPill.color', ''), ''),
			uppercase: readBoolean(config, 'titleBarPill.uppercase', false),
			fontFamily: readString(config, 'titleBarPill.fontFamily', 'ui') === 'mono' ? 'mono' : 'ui',
			bordered: readBoolean(config, 'titleBarPill.bordered', true),
		},
	};
}

/**
 * Whether anything has to be injected into the workbench page. Both in-window
 * features ship in the same generated assets, so either one alone requires the
 * patch — neither is subordinate to the other.
 */
export function needsInjection(settings: Settings): boolean {
	return settings.hud.enabled || settings.titleBarPill.enabled;
}

export async function setFeatureEnabled(
	feature: 'hud' | 'titleBarPill',
	enabled: boolean
): Promise<void> {
	await vscode.workspace
		.getConfiguration(CONFIG_SECTION)
		.update(`${feature}.enabled`, enabled, vscode.ConfigurationTarget.Global);
}
