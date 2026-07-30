import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildHudAssets, CSS_FILE_NAME, SCRIPT_FILE_NAME, type HudAssetConfig } from './assets';
import {
	applyPatch,
	buildPatchedHtml,
	isPatched,
	PatchError,
	readPatchState,
	removePatch,
	resolveTarget,
	stripPatch,
	temporaryPathFor,
	type PatchTarget,
} from './workbenchPatcher';

/**
 * Mirrors the real workbench page (VS Code 1.130): tab-indented, a `<head>`
 * holding the CSP and the workbench stylesheet, and the startup script last.
 */
const WORKBENCH_HTML = `<!-- Copyright (C) Microsoft Corporation. All rights reserved. -->
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta
			http-equiv="Content-Security-Policy"
			content="
				default-src
					'none'
				;
		"/>

		<!-- Workbench CSS -->
		<link rel="stylesheet" href="../../../workbench/workbench.desktop.main.css">
	</head>

	<body aria-label="">
	</body>

	<!-- Startup (do not modify order of script tags!) -->
	<script src="./workbench.js" type="module"></script>
</html>
`;

const ASSET_CONFIG: HudAssetConfig = {
	hudEnabled: true,
	displayMilliseconds: 1100,
	minIntervalMilliseconds: 350,
	position: 'center',
	fontSizePixels: 40,
	uppercase: true,
	color: '#22D3EE',
	fontFamily: 'ui',
	showOnWindowOpen: true,
	pill: {
		enabled: false,
		position: 'right',
		color: '',
		textColor: '',
		uppercase: false,
		fontFamily: 'mono',
		bordered: true,
	},
};

const FIXTURE_ROOT = path.join(__dirname, '..', '..', 'tmp', 'test-fixtures');

interface Fixture {
	appRoot: string;
	target: PatchTarget;
	backupPath: string;
}

function makeFixture(): Fixture {
	fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
	const appRoot = fs.mkdtempSync(path.join(FIXTURE_ROOT, 'patcher-'));
	const workbenchDirectory = path.join(appRoot, 'out/vs/code/electron-browser/workbench');
	fs.mkdirSync(workbenchDirectory, { recursive: true });
	fs.writeFileSync(path.join(workbenchDirectory, 'workbench.html'), WORKBENCH_HTML, 'utf8');

	const target = resolveTarget(appRoot);
	assert.ok(target, 'the fixture layout should be recognized');
	return { appRoot, target, backupPath: path.join(appRoot, 'backup', 'workbench.html') };
}

function countOccurrences(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

suite('workbenchPatcher — HTML surgery', () => {
	test('injects a same-origin stylesheet and module script', () => {
		const patched = buildPatchedHtml(WORKBENCH_HTML, 'abc123abc123');
		assert.ok(patched.includes(`<link rel="stylesheet" href="./${CSS_FILE_NAME}">`));
		assert.ok(patched.includes(`<script src="./${SCRIPT_FILE_NAME}" type="module"></script>`));
		// The stylesheet belongs in <head>; the script goes last so it cannot
		// disturb the startup script order the page warns about.
		assert.ok(patched.indexOf(CSS_FILE_NAME) < patched.indexOf('</head>'));
		assert.ok(patched.indexOf(SCRIPT_FILE_NAME) > patched.indexOf('./workbench.js'));
	});

	test('leaves the Content-Security-Policy untouched', () => {
		const patched = buildPatchedHtml(WORKBENCH_HTML, 'abc123abc123');
		assert.ok(patched.includes("default-src\n\t\t\t\t\t'none'"));
		assert.equal(countOccurrences(patched, 'Content-Security-Policy'), 1);
	});

	test('stripping restores the original bytes exactly', () => {
		const patched = buildPatchedHtml(WORKBENCH_HTML, 'abc123abc123');
		assert.notEqual(patched, WORKBENCH_HTML);
		assert.equal(stripPatch(patched), WORKBENCH_HTML);
	});

	test('patching an already-patched page does not stack blocks', () => {
		const once = buildPatchedHtml(WORKBENCH_HTML, 'abc123abc123');
		const twice = buildPatchedHtml(once, 'abc123abc123');
		assert.equal(twice, once);
		assert.equal(countOccurrences(twice, CSS_FILE_NAME), 1);
		assert.equal(countOccurrences(twice, SCRIPT_FILE_NAME), 1);
	});

	test('re-patching with new assets replaces the old block', () => {
		const old = buildPatchedHtml(WORKBENCH_HTML, 'aaaaaaaaaaaa');
		const fresh = buildPatchedHtml(old, 'bbbbbbbbbbbb');
		assert.ok(fresh.includes('bbbbbbbbbbbb'));
		assert.ok(!fresh.includes('aaaaaaaaaaaa'));
		assert.equal(stripPatch(fresh), WORKBENCH_HTML);
	});

	test('refuses a page without the tags it anchors to', () => {
		assert.throws(
			() => buildPatchedHtml('<html><body>nothing familiar</body>', 'abc123abc123'),
			(error: unknown) => error instanceof PatchError && error.failure === 'unexpectedLayout'
		);
	});

	test('detects an unfamiliar installation layout', () => {
		assert.equal(resolveTarget(path.join(FIXTURE_ROOT, 'does-not-exist')), undefined);
	});
});

suite('workbenchPatcher — installation lifecycle', () => {
	test('applies, reports itself current, and reverts cleanly', () => {
		const { target, backupPath } = makeFixture();
		const assets = buildHudAssets(ASSET_CONFIG);

		assert.equal(readPatchState(target, assets.hash), 'notPatched');

		assert.equal(applyPatch(target, assets, backupPath), true);
		assert.equal(readPatchState(target, assets.hash), 'current');
		assert.equal(fs.readFileSync(target.cssPath, 'utf8'), assets.css);
		assert.equal(fs.readFileSync(target.scriptPath, 'utf8'), assets.script);
		// The backup holds the untouched page, not the patched one.
		assert.equal(fs.readFileSync(backupPath, 'utf8'), WORKBENCH_HTML);

		// Already current: no work, so the caller stays quiet about reloading.
		assert.equal(applyPatch(target, assets, backupPath), false);

		assert.equal(removePatch(target), true);
		assert.equal(fs.readFileSync(target.htmlPath, 'utf8'), WORKBENCH_HTML);
		assert.equal(fs.existsSync(target.cssPath), false);
		assert.equal(fs.existsSync(target.scriptPath), false);
		assert.equal(removePatch(target), false);
	});

	test('a settings change leaves the patch stale, and re-applying refreshes it', () => {
		const { target, backupPath } = makeFixture();
		const before = buildHudAssets(ASSET_CONFIG);
		const after = buildHudAssets({ ...ASSET_CONFIG, fontSizePixels: 64 });

		applyPatch(target, before, backupPath);
		assert.equal(readPatchState(target, after.hash), 'stale');

		assert.equal(applyPatch(target, after, backupPath), true);
		assert.equal(readPatchState(target, after.hash), 'current');
		assert.ok(fs.readFileSync(target.cssPath, 'utf8').includes('font-size: 64px'));
		assert.equal(stripPatch(fs.readFileSync(target.htmlPath, 'utf8')), WORKBENCH_HTML);
	});

	test('deleted assets count as stale rather than current', () => {
		const { target, backupPath } = makeFixture();
		const assets = buildHudAssets(ASSET_CONFIG);
		applyPatch(target, assets, backupPath);

		fs.rmSync(target.scriptPath);
		assert.equal(readPatchState(target, assets.hash), 'stale');
	});

	test('removes leftover assets even when the page was already replaced', () => {
		const { target, backupPath } = makeFixture();
		applyPatch(target, buildHudAssets(ASSET_CONFIG), backupPath);

		// What a VS Code update looks like: a fresh page, our files left behind.
		fs.writeFileSync(target.htmlPath, WORKBENCH_HTML, 'utf8');
		assert.equal(isPatched(fs.readFileSync(target.htmlPath, 'utf8')), false);

		assert.equal(removePatch(target), true);
		assert.equal(fs.existsSync(target.cssPath), false);
	});

	// A shared scratch filename raced between windows: all wrote the same temp
	// file, the first rename consumed it, the rest failed with ENOENT. Running
	// many windows at once is this extension's whole premise.
	test('scratch paths are unique per process, so concurrent windows cannot race', () => {
		const first = temporaryPathFor('/tmp/x/workbench.html');
		const second = temporaryPathFor('/tmp/x/workbench.html');
		assert.notEqual(first, second, 'two writes must not share a scratch path');
		assert.ok(first.includes(String(process.pid)), 'scratch path must be process-scoped');
		assert.ok(first.startsWith('/tmp/x/workbench.html'), 'must sit beside the target');
		assert.ok(first.endsWith('.nt-tmp'));
	});

	// True interleaving is not reproducible in-process, since the writes are
	// synchronous. Unique scratch paths (above) are what actually prevent the
	// race; this pins the observable consequences.
	test('repeated applies converge and leave no scratch files behind', () => {
		const { target, backupPath } = makeFixture();
		const assets = buildHudAssets(ASSET_CONFIG);

		assert.equal(applyPatch(target, assets, backupPath), true);
		assert.equal(applyPatch(target, assets, backupPath), false);
		assert.equal(readPatchState(target, assets.hash), 'current');
		assert.equal(stripPatch(fs.readFileSync(target.htmlPath, 'utf8')), WORKBENCH_HTML);

		const strays = fs
			.readdirSync(path.dirname(target.htmlPath))
			.filter((name) => name.endsWith('.nt-tmp'));
		assert.deepEqual(strays, [], 'no scratch files may be left in the installation');
	});

	test('a write failure names the underlying errno in its message', () => {
		const { backupPath } = makeFixture();
		const missing = {
			htmlPath: path.join(FIXTURE_ROOT, 'no-such-dir', 'workbench.html'),
			cssPath: path.join(FIXTURE_ROOT, 'no-such-dir', CSS_FILE_NAME),
			scriptPath: path.join(FIXTURE_ROOT, 'no-such-dir', SCRIPT_FILE_NAME),
		};
		assert.throws(
			() => applyPatch(missing, buildHudAssets(ASSET_CONFIG), backupPath),
			(error: unknown) => error instanceof PatchError && /ENOENT/.test(error.message)
		);
	});

	test('reports a read-only installation as such', () => {
		const { target, backupPath } = makeFixture();
		const workbenchDirectory = path.dirname(target.htmlPath);
		fs.chmodSync(workbenchDirectory, 0o500);

		try {
			assert.throws(
				() => applyPatch(target, buildHudAssets(ASSET_CONFIG), backupPath),
				(error: unknown) => error instanceof PatchError && error.failure === 'notWritable'
			);
		} finally {
			fs.chmodSync(workbenchDirectory, 0o700);
		}
	});
});
