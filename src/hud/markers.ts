/**
 * The status-bar item is the HUD's name channel.
 *
 * The HUD runs inside the workbench renderer, where it has no connection to the
 * extension host — so it has to read the resolved project name out of the DOM.
 * Wrapping the name in two invisible format characters makes that read exact and
 * independent of VS Code's internal DOM shape: the HUD scans status-bar entries
 * for the pair and takes whatever sits between them. Both are Unicode `Cf`
 * (format) characters, so they occupy no space and do not count as whitespace.
 *
 * Built from code points rather than written literally, because as literals they
 * would be invisible in this file.
 */
export const NAME_OPEN = String.fromCodePoint(0x20_62); // INVISIBLE TIMES
export const NAME_CLOSE = String.fromCodePoint(0x20_63); // INVISIBLE SEPARATOR

/** Codicons render as Private Use Area code points, so they are noise too. */
const PRIVATE_USE_FIRST = String.fromCodePoint(0xe0_00);
const PRIVATE_USE_LAST = String.fromCodePoint(0xf8_ff);

/** The markers plus any codicon glyph: everything that is not the name itself. */
const NOISE = new RegExp(
	`[${NAME_OPEN}${NAME_CLOSE}${PRIVATE_USE_FIRST}-${PRIVATE_USE_LAST}]`,
	'gu'
);

/** Strips markers and codicon glyphs, leaving the bare project name. */
export function cleanName(raw: string): string {
	return raw.replaceAll(NOISE, '').trim();
}

/**
 * Halves a string that is exactly itself twice.
 *
 * The title bar renders the window title more than once — with the Command Center
 * enabled, VS Code 1.130 keeps hidden duplicate labels inside `.window-title` —
 * so reading `textContent` there yields the name repeated. The HUD's own fallback
 * prefers visibly laid-out text nodes; this is the last-resort guard for when
 * nothing is measurable. The generated HUD script carries a copy of this logic;
 * the two must stay in step.
 */
export function undoubleText(text: string): string {
	const half = text.length / 2;
	if (half > 0 && Number.isSafeInteger(half) && text.slice(0, half) === text.slice(half)) {
		return text.slice(0, half);
	}
	return text;
}

/** Extracts the name from status-bar text that carries the marker pair. */
export function extractMarkedName(text: string): string | undefined {
	const start = text.indexOf(NAME_OPEN);
	const end = text.indexOf(NAME_CLOSE, start + 1);
	if (start === -1 || end === -1) {
		return undefined;
	}
	const name = cleanName(text.slice(start + 1, end));
	return name === '' ? undefined : name;
}
