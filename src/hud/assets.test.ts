import * as assert from 'node:assert';
import { readableTextOn } from '../configuration/settings';
import { buildHudAssets, type HudAssetConfig } from './assets';

const BASE: HudAssetConfig = {
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

const WITH_PILL: HudAssetConfig = {
	...BASE,
	pill: { ...BASE.pill, enabled: true },
};

/**
 * Strips comments, so the "must not contain" guards below assert about the code
 * the renderer executes rather than about the prose explaining it.
 */
function codeOnly(script: string): string {
	return script
		.replaceAll(/\/\*[\S\s]*?\*\//g, '')
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('//'))
		.join('\n');
}

/** Just the pill's own rule — the HUD block sets some of the same properties. */
function pillRule(css: string): string {
	const start = css.indexOf('#nt-window-title-pill {');
	assert.notEqual(start, -1, 'expected a pill rule in the stylesheet');
	return css.slice(start, css.indexOf('}', start));
}

suite('HUD assets', () => {
	test('bakes the configuration in, because the renderer cannot read files', () => {
		const { css, script } = buildHudAssets({ ...BASE, displayMilliseconds: 2500 });
		assert.match(script, /"displayMs": 2500/);
		assert.match(script, /"minIntervalMs": 350/);
		assert.ok(css.includes('font-size: 40px'));
		assert.ok(css.includes('color: #22D3EE'));
		assert.ok(css.includes('text-transform: uppercase'));
	});

	test('an unset color inherits the theme foreground, with a literal fallback', () => {
		assert.ok(
			buildHudAssets({ ...BASE, color: '' }).css.includes('color: var(--vscode-foreground, ')
		);
	});

	// Theme custom properties and the UI font live on .monaco-workbench, so an
	// overlay on document.body renders unthemed, in Times.
	test('the overlay hosts itself in the themed workbench element', () => {
		const code = codeOnly(buildHudAssets(BASE).script);
		assert.ok(code.includes('monaco-workbench'), 'must target the themed host');
		assert.ok(!code.includes('document.body.appendChild'), 'body is outside the theme scope');
		// Re-checked per announcement, since one can fire before the host exists.
		assert.ok(code.includes('parentElement'), 'must re-home rather than parent once');
	});

	test('the pill defaults to monospace and can inherit the workbench font', () => {
		assert.ok(pillRule(buildHudAssets(WITH_PILL).css).includes('monospace'));
		const ui = buildHudAssets({ ...WITH_PILL, pill: { ...WITH_PILL.pill, fontFamily: 'ui' } });
		assert.ok(pillRule(ui.css).includes('font-family: inherit'));
	});

	// VS Code's own pills border in their own background color, so the border is
	// invisible — and the pill disappears when the title bar is that same color.
	// Bordering in the text color always contrasts, since that color is already
	// chosen to be readable on the fill.
	test('a bordered pill outlines in its text color, so it never blends in', () => {
		const themed = pillRule(buildHudAssets(WITH_PILL).css);
		assert.ok(themed.includes('border: 1px solid var(--vscode-button-foreground'));

		const custom = buildHudAssets({
			...WITH_PILL,
			pill: { ...WITH_PILL.pill, color: '#22D3EE', textColor: readableTextOn('#22D3EE') },
		});
		const rule = pillRule(custom.css);
		assert.ok(rule.includes('border: 1px solid #15151E'), 'dark outline on a light cyan fill');
		assert.ok(rule.includes('background-color: #22D3EE'));
	});

	test('an unbordered pill matches the built-in pills exactly', () => {
		const rule = pillRule(
			buildHudAssets({ ...WITH_PILL, pill: { ...WITH_PILL.pill, bordered: false } }).css
		);
		assert.ok(rule.includes('border: 1px solid var(--vscode-button-background'));
	});

	test('the ui font inherits the workbench font rather than naming one', () => {
		// --vscode-font-family does not exist as a custom property, so referencing
		// it silently resolved to nothing.
		const { css } = buildHudAssets({ ...BASE, fontFamily: 'ui' });
		assert.ok(css.includes('font-family: inherit'));
		assert.ok(!css.includes('--vscode-font-family'), 'that property does not exist');
	});

	test('the mono font ships an explicit stack', () => {
		const { css } = buildHudAssets({ ...BASE, fontFamily: 'mono' });
		assert.ok(css.includes('monospace'));
		assert.ok(!css.includes('font-family: inherit'));
	});

	test('the top position anchors near the top instead of the middle', () => {
		const { css } = buildHudAssets({ ...BASE, position: 'top' });
		assert.ok(css.includes('top: 11vh'));
		assert.ok(!css.includes('top: 50%'));
	});

	// The workbench page sets require-trusted-types-for 'script', which rejects
	// innerHTML-style sinks outright.
	test('builds its DOM without a Trusted Types sink', () => {
		const code = codeOnly(buildHudAssets(BASE).script);
		for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
			assert.ok(!code.includes(sink), `script must not use ${sink}`);
		}
		assert.ok(code.includes('createElement'));
		assert.ok(code.includes('textContent'));
	});

	// CSP is default-src 'none' with connect-src limited to self/https/ws.
	test('performs no network or filesystem access at runtime', () => {
		const code = codeOnly(buildHudAssets(BASE).script);
		for (const forbidden of ['fetch(', 'XMLHttpRequest', 'import(', 'require(', 'WebSocket']) {
			assert.ok(!code.includes(forbidden), `script must not contain ${forbidden}`);
		}
	});

	test('guards against a duplicated script tag installing twice', () => {
		assert.ok(buildHudAssets(BASE).script.includes('__ntWindowTitleHudInstalled'));
	});

	test('emits no pill CSS or DOM work when the pill is off', () => {
		const { css, script } = buildHudAssets(BASE);
		assert.ok(!css.includes('nt-window-title-pill'));
		assert.match(script, /"pillEnabled": false/);
	});

	// Reproduces `.update-indicator` / `.update-indicator.prominent` from
	// vs/workbench/contrib/update/browser/media/updateTitleBarEntry.css — the real
	// "Update" pill. Theme tokens rather than literals, or it drifts when VS Code
	// retunes its corner radius or font scale.
	test('the pill reproduces VS Code Update pill rules, tokens included', () => {
		const rule = pillRule(buildHudAssets(WITH_PILL).css);
		assert.ok(rule.includes('height: 22px'));
		assert.ok(rule.includes('padding: 0 8px'));
		assert.ok(rule.includes('box-sizing: border-box'));
		assert.ok(rule.includes('var(--vscode-cornerRadius-medium'), 'radius must be the theme token');
		assert.ok(
			rule.includes('var(--vscode-bodyFontSize-small'),
			'font size must be the theme token'
		);
		assert.ok(rule.includes('var(--vscode-button-background'));
		assert.ok(rule.includes('var(--vscode-button-foreground'));
		// Its host container is taller than the title bar and starts above it, so
		// without this the pill is clipped off the top of the window.
		assert.ok(rule.includes('align-self: center'));
		// The real pill is not bold; matching it means not bolding ours either.
		assert.ok(!rule.includes('font-weight'), 'the Update pill is not bold');
		// The title bar is a window-drag region; the pill must stay transparent.
		assert.ok(rule.includes('pointer-events: none'));
	});

	// .center-adjacent-toolbar-container is where VS Code's own Update / Sign in
	// pills live, but it is display:block, 44px tall and starts above the title
	// bar, so inserting into it clips the pill off the top of the window.
	// .titlebar-right is the flex row that centers it correctly.
	test('the pill mounts in the flex title-bar row, not the block container', () => {
		const code = codeOnly(buildHudAssets(WITH_PILL).script);
		assert.ok(code.includes('.titlebar-right'));
		assert.ok(
			!code.includes('.center-adjacent-toolbar-container'),
			'inserting there clips the pill'
		);
	});

	test('a custom pill color gets a derived readable text color', () => {
		const light = buildHudAssets({
			...WITH_PILL,
			pill: { ...WITH_PILL.pill, color: '#22D3EE', textColor: readableTextOn('#22D3EE') },
		}).css;
		assert.ok(light.includes('background-color: #22D3EE'));
		assert.ok(light.includes('color: #15151E'), 'cyan is light, so text must be dark');

		const dark = buildHudAssets({
			...WITH_PILL,
			pill: { ...WITH_PILL.pill, color: '#12203A', textColor: readableTextOn('#12203A') },
		}).css;
		assert.ok(dark.includes('color: #FFFFFF'), 'navy is dark, so text must be white');
	});

	test('the pill re-asserts itself when VS Code rebuilds the title bar', () => {
		const code = codeOnly(buildHudAssets(WITH_PILL).script);
		assert.ok(code.includes('MutationObserver'));
		assert.ok(code.includes('childList'));
		// Never subtree or characterData: the title text changes constantly, so
		// those would fire continuously instead of only when children change.
		assert.ok(!code.includes('subtree: true'));
		assert.ok(!code.includes('characterData'));
	});

	// The title bar keeps hidden duplicate labels of the window title, so reading
	// its textContent yields the name repeated. Only the laid-out copy is real.
	test('the title-bar fallback prefers text that is actually laid out', () => {
		const code = codeOnly(buildHudAssets(BASE).script);
		assert.ok(code.includes('offsetWidth'), 'must test whether a text node is laid out');
	});

	test('the hash tracks the configuration, so a stale patch is detectable', () => {
		const base = buildHudAssets(BASE).hash;
		assert.equal(buildHudAssets({ ...BASE }).hash, base);
		assert.notEqual(buildHudAssets({ ...BASE, fontSizePixels: 41 }).hash, base);
		assert.notEqual(buildHudAssets({ ...BASE, uppercase: false }).hash, base);
		assert.notEqual(buildHudAssets({ ...BASE, showOnWindowOpen: false }).hash, base);
		// Toggling the pill must also invalidate the patch, or enabling it would
		// look "current" and never reach the workbench.
		assert.notEqual(buildHudAssets(WITH_PILL).hash, base);
		assert.match(base, /^[\da-f]{12}$/);
	});
});
