import * as vscode from 'vscode';
import {
	isHexColor,
	readableTextOn,
	type AnnouncementPosition,
	type EditorAnnouncementSettings,
} from '../configuration/settings';

/**
 * How long the announcement refuses to repeat after showing. Focus events arrive
 * in bursts; without this the decoration would restart on each one.
 */
const MIN_INTERVAL_MS = 400;

/**
 * Announces the project name inside the editor viewport.
 *
 * This is the supported replacement for the overlay removed in 2.0.0 — see
 * ARCHITECTURE.md. A text-editor decoration is the only surface the extension
 * API offers that renders where the user is actually looking, without taking
 * focus, changing the editor layout, or leaving anything behind.
 *
 * Unlike the status-bar flash, the color here is entirely ours, so it looks the
 * same in every theme.
 */
export class EditorAnnouncement {
	/**
	 * Created once. Each `createTextEditorDecorationType` call injects a CSS rule,
	 * so making one per announcement would churn the stylesheet.
	 */
	private readonly decoration = vscode.window.createTextEditorDecorationType({
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	});

	private timer: NodeJS.Timeout | undefined;
	private lastShownAt = 0;
	private decorated: vscode.TextEditor[] = [];

	/**
	 * Clears the editors that were decorated, not the currently visible ones — the
	 * set can change while an announcement is on screen, and a decoration left on
	 * an editor that scrolled out of view would never be removed.
	 */
	private clear(): void {
		for (const editor of this.decorated) {
			editor.setDecorations(this.decoration, []);
		}
		this.decorated = [];
	}

	/** Shows the name briefly in every visible editor. */
	announce(name: string, settings: EditorAnnouncementSettings): void {
		if (!settings.enabled) {
			return;
		}

		const now = Date.now();
		if (now - this.lastShownAt < MIN_INTERVAL_MS) {
			return;
		}
		this.lastShownAt = now;

		// Nothing to decorate on a Welcome tab, the Settings UI, or an empty
		// workbench. The status-bar badge still carries the name there.
		const editors = [...vscode.window.visibleTextEditors];
		if (editors.length === 0) {
			return;
		}

		const options = announcementDecoration(name, settings);
		for (const editor of editors) {
			editor.setDecorations(this.decoration, [
				{ range: anchorRange(editor, settings.position), renderOptions: options },
			]);
		}
		this.decorated = editors;

		if (this.timer !== undefined) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.clear();
		}, settings.milliseconds);
	}

	dispose(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.clear();
		this.decoration.dispose();
	}
}

/**
 * How far below the first visible line `'top'` sits.
 *
 * Scaled past 100% the attachment is taller than the line box it hangs off, and
 * the overflow goes upward — on the very first visible line that puts it under
 * the breadcrumb bar, which paints over it. One line of clearance is enough,
 * because breadcrumbs are a single row.
 */
const TOP_CLEARANCE_LINES = 1;

/**
 * Where the announcement attaches: the **end** of a line in the viewport.
 *
 * Anchoring at column 0 would push the line's own text to the right and read as
 * if the file had changed. Attaching past the end of the line is the same
 * placement inline blame annotations use, so it reads as an annotation.
 *
 * Which line depends on `position`. `'center'` is the default because the middle
 * of the viewport is clear of both the breadcrumb bar and sticky scroll at the
 * top, and it is where the eye already is.
 */
export function anchorRange(
	editor: vscode.TextEditor,
	position: AnnouncementPosition
): vscode.Range {
	const visible = editor.visibleRanges[0];
	const first = visible === undefined ? 0 : visible.start.line;
	const last = visible === undefined ? 0 : visible.end.line;

	const line = first + (position === 'top' ? TOP_CLEARANCE_LINES : Math.floor((last - first) / 2));

	const lastLine = Math.max(0, editor.document.lineCount - 1);
	const safeLine = Math.min(Math.max(line, 0), lastLine);
	const end = editor.document.lineAt(safeLine).range.end;
	return new vscode.Range(end, end);
}

/**
 * The appearance of the announcement. Pure, so it is testable without a live
 * editor — the class above only applies the result.
 */
export function announcementDecoration(
	name: string,
	settings: EditorAnnouncementSettings
): vscode.DecorationInstanceRenderOptions {
	const filled = isHexColor(settings.color);

	// A hex color can be filled, because a readable text color is derivable from
	// it. A theme color id cannot — its value is not known here — so that case
	// stays outlined rather than risking light-on-light.
	const color = filled ? readableTextOn(settings.color) : new vscode.ThemeColor(settings.color);
	const background = filled ? settings.color : 'transparent';
	const borderColor = filled ? settings.color : new vscode.ThemeColor(settings.color);

	return {
		after: {
			contentText: `  ${settings.uppercase ? name.toUpperCase() : name}  `,
			color,
			backgroundColor: background,
			fontWeight: '700',
			// Pushed clear of the code so it never looks like part of the line.
			margin: '0 0 0 2em',
			border: '1px solid',
			borderColor,
			...scaledFont(settings.fontSizePercent),
		},
	};
}

/**
 * Scales the announcement past the editor's font size.
 *
 * **This is an undocumented use of `textDecoration`.** The attachment options
 * expose no `fontSize`, but VS Code copies every one of them into a CSS rule
 * verbatim, so a declaration can be appended to this one. It is a deliberate,
 * user-facing choice — `editorAnnouncement.fontSizePercent` — not something done
 * behind the user's back, and the README says so.
 *
 * It fails soft. If VS Code ever escapes these values, `text-decoration` simply
 * becomes an invalid declaration, the browser drops it, and the announcement
 * renders at the normal size instead of breaking.
 *
 * `fontSizePercent` is clamped to 100–500 in settings.ts, so nothing arbitrary
 * reaches the stylesheet; at 100 nothing is injected at all.
 */
function scaledFont(fontSizePercent: number): { textDecoration?: string } {
	if (fontSizePercent <= 100) {
		return {};
	}
	return { textDecoration: `none; font-size: ${fontSizePercent}%; vertical-align: middle` };
}
