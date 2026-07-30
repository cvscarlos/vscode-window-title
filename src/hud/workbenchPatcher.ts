import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CSS_FILE_NAME, SCRIPT_FILE_NAME, type HudAssets } from './assets';

/**
 * Where the workbench page lives, newest layout first. VS Code has moved this
 * file between `electron-sandbox` and `electron-browser`, and some builds ship an
 * `.esm.` variant, so all known spellings are probed.
 */
const WORKBENCH_CANDIDATES: readonly string[] = [
	'out/vs/code/electron-browser/workbench/workbench.html',
	'out/vs/code/electron-browser/workbench/workbench.esm.html',
	'out/vs/code/electron-sandbox/workbench/workbench.html',
	'out/vs/code/electron-sandbox/workbench/workbench.esm.html',
];

const MARKER_BEGIN_PREFIX = '<!-- nt-window-title:begin';
const MARKER_END = '<!-- nt-window-title:end -->';

/**
 * Matches a whole injected block including its indentation and trailing newline,
 * so stripping restores the file byte-for-byte.
 *
 * The hash pattern is deliberately wider than the 12 lowercase hex characters we
 * currently emit: if a future version changes the hash length or alphabet, every
 * installation patched by an older version must still be strippable. Detection
 * (`isPatched`) is derived from this same source so the two can never disagree —
 * a block we can see but not strip would accumulate duplicates on every apply.
 */
const MARKER_BLOCK_SOURCE = String.raw`[ \t]*<!-- nt-window-title:begin [\dA-Za-z]{4,64} -->[\S\s]*?<!-- nt-window-title:end -->\n?`;

const MARKER_BLOCK = new RegExp(MARKER_BLOCK_SOURCE, 'g');

/** Landmarks a workbench page must still have after stripping. */
const ESSENTIAL_LANDMARKS: readonly string[] = ['</head>', '<body', '</html>'];

export type PatchState =
	/** Markers absent — nothing of ours is installed. */
	| 'notPatched'
	/** Installed, but for different assets (settings changed, or we upgraded). */
	| 'stale'
	/** Installed and matching the assets we would generate right now. */
	| 'current';

export type PatchFailure =
	/** No workbench page at any known path — an unfamiliar VS Code layout. */
	| 'unsupported'
	/** The page exists but lacks the tags we anchor to. */
	| 'unexpectedLayout'
	/** The installation directory is read-only for this user. */
	| 'notWritable'
	| 'ioFailure';

/** `errno` codes that mean "this installation is not ours to write to". */
const PERMISSION_CODES = new Set(['EACCES', 'EPERM', 'EROFS']);

/** A one-line, log-friendly rendering of a filesystem error. */
function describeError(error: unknown): string {
	const errno = error as NodeJS.ErrnoException;
	const parts = [errno?.code, errno?.syscall].filter(Boolean);
	if (parts.length > 0) {
		return parts.join(' ');
	}
	return error instanceof Error ? error.message : String(error);
}

export class PatchError extends Error {
	constructor(
		readonly failure: PatchFailure,
		message: string,
		readonly cause?: unknown
	) {
		super(message);
		this.name = 'PatchError';
	}
}

export interface PatchTarget {
	htmlPath: string;
	cssPath: string;
	scriptPath: string;
}

/** Resolves the target from `vscode.env.appRoot`, or undefined if unrecognized. */
export function resolveTarget(appRoot: string): PatchTarget | undefined {
	for (const candidate of WORKBENCH_CANDIDATES) {
		const htmlPath = path.join(appRoot, candidate);
		if (fs.existsSync(htmlPath)) {
			const directory = path.dirname(htmlPath);
			return {
				htmlPath,
				cssPath: path.join(directory, CSS_FILE_NAME),
				scriptPath: path.join(directory, SCRIPT_FILE_NAME),
			};
		}
	}
	return undefined;
}

/** Removes every injected block, restoring the original bytes. */
export function stripPatch(html: string): string {
	return html.replaceAll(MARKER_BLOCK, '');
}

export function isPatched(html: string): boolean {
	// Same pattern as stripPatch, so anything we detect is something we can remove.
	return new RegExp(MARKER_BLOCK_SOURCE).test(html);
}

/**
 * Whether a page still looks like a workbench document.
 *
 * `MARKER_BLOCK` is lazy, so if another tool damages one of our end markers the
 * match runs on to the *next* end marker and swallows everything between —
 * `</head>`, `<body>` and VS Code's own startup script included. Writing that
 * result would leave an editor that does not boot, so the removal path checks
 * before it writes rather than trusting the strip.
 */
export function looksLikeWorkbench(html: string): boolean {
	return ESSENTIAL_LANDMARKS.every((landmark) => html.includes(landmark));
}

function block(indent: string, hash: string, tag: string): string {
	return [
		`${indent}${MARKER_BEGIN_PREFIX} ${hash} -->`,
		`${indent}${tag}`,
		`${indent}${MARKER_END}`,
		'',
	].join('\n');
}

/**
 * Injects the stylesheet into `<head>` and the module script at the end of the
 * document. Both are same-origin relative references, which the workbench CSP
 * allows under `'self'` — no CSP rewriting is needed, and none is done.
 */
export function buildPatchedHtml(html: string, hash: string): string {
	const clean = stripPatch(html);

	if (!/<\/head>/.test(clean) || !/<\/html>/.test(clean)) {
		throw new PatchError(
			'unexpectedLayout',
			'The workbench page does not contain the </head> and </html> tags this patch anchors to.'
		);
	}

	const withCss = clean.replace(
		/([ \t]*)<\/head>/,
		(_match, indent: string) =>
			`${block(`${indent}\t`, hash, `<link rel="stylesheet" href="./${CSS_FILE_NAME}">`)}${indent}</head>`
	);

	return withCss.replace(
		/([ \t]*)<\/html>/,
		(_match, indent: string) =>
			`${block(`${indent}\t`, hash, `<script src="./${SCRIPT_FILE_NAME}" type="module"></script>`)}${indent}</html>`
	);
}

function readText(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf8');
	} catch (error) {
		throw new PatchError(
			'ioFailure',
			`Could not read ${filePath} (${describeError(error)}).`,
			error
		);
	}
}

/**
 * The scratch path for an atomic write. **Must be unique per process.**
 *
 * A shared name races: several windows sync at once, all write the same scratch
 * file, the first rename consumes it and the rest fail with ENOENT.
 */
export function temporaryPathFor(filePath: string): string {
	return `${filePath}.${process.pid}-${randomUUID().slice(0, 8)}.nt-tmp`;
}

/** Write-then-rename, so a crash mid-write cannot leave a truncated workbench. */
function writeAtomic(filePath: string, content: string): void {
	const temporaryPath = temporaryPathFor(filePath);
	try {
		fs.writeFileSync(temporaryPath, content, 'utf8');
		fs.renameSync(temporaryPath, filePath);
	} catch (error) {
		try {
			fs.rmSync(temporaryPath, { force: true });
		} catch {
			// Nothing useful to do if even the cleanup fails.
		}
		const code = (error as NodeJS.ErrnoException).code ?? '';
		if (PERMISSION_CODES.has(code)) {
			throw new PatchError(
				'notWritable',
				`No permission to write ${filePath}. This VS Code installation is not writable by your user.`,
				error
			);
		}
		// Name the errno: "could not write <path>" alone is not diagnosable from a log.
		throw new PatchError(
			'ioFailure',
			`Could not write ${filePath} (${describeError(error)}).`,
			error
		);
	}
}

export function readPatchState(target: PatchTarget, hash: string): PatchState {
	const html = readText(target.htmlPath);
	if (!isPatched(html)) {
		return 'notPatched';
	}
	const referencesCurrentAssets = html.includes(`${MARKER_BEGIN_PREFIX} ${hash} -->`);
	const assetsPresent = fs.existsSync(target.cssPath) && fs.existsSync(target.scriptPath);
	return referencesCurrentAssets && assetsPresent ? 'current' : 'stale';
}

/**
 * Applies (or refreshes) the patch. Returns false when the installation was
 * already current, so callers can stay silent instead of nagging about a reload.
 *
 * Safe to run concurrently from several windows: every window strips first and
 * inserts once, so they all converge on identical content, and each uses its own
 * scratch path (see temporaryPathFor) so their renames cannot collide.
 */
export function applyPatch(target: PatchTarget, assets: HudAssets, backupPath: string): boolean {
	const html = readText(target.htmlPath);

	if (readPatchState(target, assets.hash) === 'current') {
		return false;
	}

	const original = stripPatch(html);
	const patched = buildPatchedHtml(html, assets.hash);

	// Keep an untouched copy for this VS Code build before the first change.
	if (!fs.existsSync(backupPath)) {
		try {
			fs.mkdirSync(path.dirname(backupPath), { recursive: true });
			fs.writeFileSync(backupPath, original, 'utf8');
		} catch (error) {
			throw new PatchError(
				'ioFailure',
				`Could not write the backup at ${backupPath} (${describeError(error)}).`,
				error
			);
		}
	}

	writeAtomic(target.cssPath, assets.css);
	writeAtomic(target.scriptPath, assets.script);
	writeAtomic(target.htmlPath, patched);
	return true;
}

/**
 * Restores the workbench page from the backup taken before the first patch, and
 * deletes our assets. The escape hatch for when the page has been damaged badly
 * enough that stripping cannot be trusted — without this the backup would be
 * write-only, which is worse than no backup because it makes the risky path feel
 * covered.
 */
export function restoreFromBackup(target: PatchTarget, backupPath: string): void {
	if (!fs.existsSync(backupPath)) {
		throw new PatchError('ioFailure', `No backup to restore from at ${backupPath}.`);
	}

	const backup = readText(backupPath);
	if (!looksLikeWorkbench(backup) || isPatched(backup)) {
		throw new PatchError('unexpectedLayout', `The backup at ${backupPath} is not a clean page.`);
	}

	writeAtomic(target.htmlPath, backup);
	for (const assetPath of [target.cssPath, target.scriptPath]) {
		try {
			fs.rmSync(assetPath, { force: true });
		} catch (error) {
			throw new PatchError(
				'ioFailure',
				`Could not delete ${assetPath} (${describeError(error)}).`,
				error
			);
		}
	}
}

/** Reverts the patch. Returns false when there was nothing installed. */
export function removePatch(target: PatchTarget): boolean {
	const html = readText(target.htmlPath);
	const assetsPresent = fs.existsSync(target.cssPath) || fs.existsSync(target.scriptPath);

	if (!assetsPresent && !isPatched(html)) {
		return false;
	}

	if (isPatched(html)) {
		const stripped = stripPatch(html);
		if (!looksLikeWorkbench(stripped)) {
			throw new PatchError(
				'unexpectedLayout',
				`Refusing to write ${target.htmlPath}: removing our blocks would also remove part of the page, so its markers have been altered by something else. Restore it from a backup or reinstall VS Code.`
			);
		}
		writeAtomic(target.htmlPath, stripped);
	}

	for (const assetPath of [target.cssPath, target.scriptPath]) {
		try {
			fs.rmSync(assetPath, { force: true });
		} catch (error) {
			throw new PatchError(
				'ioFailure',
				`Could not delete ${assetPath} (${describeError(error)}).`,
				error
			);
		}
	}

	return true;
}
