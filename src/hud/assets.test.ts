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

/**
 * Executes the generated script against a stub DOM, so tests can assert what it
 * does rather than what it contains. Only the handful of DOM APIs the script
 * actually uses are implemented.
 */
function runGeneratedScript(
	script: string,
	options: { titleBarExists: boolean }
): {
	observers: { target: { className: string }; options: unknown; callback: () => void }[];
	addTitleBar: () => void;
	fireFocus: () => void;
	notifyObservers: () => void;
	pill: () => { id: string; textContent: string } | undefined;
	removePill: () => void;
} {
	interface Node {
		id: string;
		className: string;
		textContent: string;
		isConnected: boolean;
		parentElement: Node | undefined;
		children: Node[];
		setAttribute: (name: string, value: string) => void;
		append: (child: Node) => void;
		prepend: (child: Node) => void;
		appendChild: (child: Node) => void;
		classList: { add: () => void; remove: () => void; contains: () => boolean };
		getBoundingClientRect: () => { width: number; height: number };
		offsetWidth: number;
		offsetHeight: number;
		querySelector: (selector: string) => Node | undefined;
	}

	const observers: { target: { className: string }; options: unknown; callback: () => void }[] = [];
	const focusHandlers: (() => void)[] = [];
	const timers: (() => void)[] = [];

	const makeNode = (className = ''): Node => {
		const node: Node = {
			id: '',
			className,
			textContent: '',
			isConnected: true,
			parentElement: undefined,
			children: [],
			setAttribute: () => {},
			append: (child) => {
				node.children.push(child);
				child.parentElement = node;
			},
			prepend: (child) => {
				node.children.unshift(child);
				child.parentElement = node;
			},
			appendChild: (child) => {
				node.children.push(child);
				child.parentElement = node;
			},
			classList: { add: () => {}, remove: () => {}, contains: () => false },
			getBoundingClientRect: () => ({ width: 100, height: 20 }),
			offsetWidth: 100,
			offsetHeight: 20,
			querySelector: (selector) => descendants(node).find((n) => matches(n, selector)),
		};
		return node;
	};

	const descendants = (node: Node): Node[] =>
		node.children.flatMap((child) => [child, ...descendants(child)]);

	const matches = (node: Node, selector: string): boolean =>
		selector
			.split(' ')
			.at(-1)!
			.split('.')
			.filter(Boolean)
			.every((part) => node.className.split(' ').includes(part));

	const workbench = makeNode('monaco-workbench');
	const body = makeNode('');
	body.append(workbench);

	const titleBarContainer = makeNode('titlebar-container');
	const titleBarRight = makeNode('titlebar-right');
	titleBarContainer.append(titleBarRight);
	const titleBarPart = makeNode('part titlebar');
	titleBarPart.append(titleBarContainer);

	const addTitleBar = (): void => workbench.append(titleBarPart);
	if (options.titleBarExists) {
		addTitleBar();
	}

	const all = (): Node[] => [body, ...descendants(body)];

	const documentStub = {
		body,
		title: 'stub',
		hasFocus: () => true,
		createElement: () => makeNode(''),
		querySelector: (selector: string) => all().find((n) => matches(n, selector)),
		querySelectorAll: (selector: string) => all().filter((n) => matches(n, selector)),
		createTreeWalker: () => ({ nextNode: () => {} }),
	};

	const sandbox = {
		document: documentStub,
		window: {
			addEventListener: (event: string, handler: () => void) => {
				if (event === 'focus') {
					focusHandlers.push(handler);
				}
			},
		},
		setTimeout: (fn: () => void) => {
			timers.push(fn);
			return 0;
		},
		clearTimeout: () => {},
		MutationObserver: class {
			constructor(private readonly callback: () => void) {}
			observe(target: Node, opts: unknown) {
				observers.push({ target, options: opts, callback: this.callback });
			}
			disconnect() {
				// Nothing to undo in the stub.
			}
		},
		NodeFilter: { SHOW_TEXT: 4 },
		globalThis: {} as Record<string, unknown>,
		Date,
		String,
		RegExp,
		Number,
	};

	const run = new Function(...Object.keys(sandbox), script);
	run(...Object.values(sandbox));

	// The script defers its first render; run the deferred work.
	const pending = [...timers];
	timers.length = 0;
	for (const timer of pending) {
		timer();
	}

	const findPill = (): Node | undefined =>
		all().find((n) => n.id === 'nt-window-title-pill' && n.parentElement !== undefined);

	return {
		observers,
		addTitleBar,
		fireFocus: () => {
			for (const handler of focusHandlers) {
				handler();
			}
			const pending = [...timers];
			timers.length = 0;
			for (const timer of pending) {
				timer();
			}
		},
		notifyObservers: () => {
			for (const observer of observers) {
				observer.callback();
			}
		},
		pill: findPill,
		removePill: () => {
			const pill = findPill();
			if (pill?.parentElement) {
				pill.parentElement.children = pill.parentElement.children.filter((c) => c !== pill);
				pill.parentElement = undefined;
			}
		},
	};
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

	// This ran as a string check for "MutationObserver" and passed while the
	// observer was never attached at all: the script is evaluated when the page
	// body is still empty, so the title bar does not exist yet. Execute the
	// generated code against a stub DOM so the behaviour is what gets tested.
	test('the pill observes the title bar even though it appears after the script', () => {
		const dom = runGeneratedScript(buildHudAssets(WITH_PILL).script, { titleBarExists: false });

		assert.equal(dom.observers.length, 0, 'nothing to observe while the page is empty');

		// VS Code builds the workbench, then the window takes focus.
		dom.addTitleBar();
		dom.fireFocus();

		assert.equal(dom.observers.length, 1, 'must attach once the title bar exists');
		assert.deepEqual(dom.observers[0].options, { childList: true });
		assert.equal(dom.observers[0].target.className, 'titlebar-right');
		assert.ok(dom.pill(), 'the pill must be mounted');
	});

	test('the pill comes back when the title bar drops it', () => {
		const dom = runGeneratedScript(buildHudAssets(WITH_PILL).script, { titleBarExists: true });
		dom.fireFocus();
		assert.ok(dom.pill(), 'mounted initially');

		// What a title-bar rebuild looks like: our element is simply gone.
		dom.removePill();
		assert.equal(dom.pill(), undefined);

		dom.notifyObservers();
		assert.ok(dom.pill(), 'the observer must put it back without a focus event');
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
