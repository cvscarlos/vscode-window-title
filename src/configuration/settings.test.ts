import * as assert from 'node:assert';
import {
	clampNumber,
	sanitizeCodicon,
	sanitizeColor,
	sanitizeHexColor,
	toCssColor,
} from './settings';

// These values are interpolated into a stylesheet and a script that run inside
// VS Code's own renderer, so anything unrecognized has to fall back rather than
// pass through.
suite('settings sanitizers', () => {
	test('accepts hex colors and theme color ids', () => {
		assert.equal(sanitizeColor('#22D3EE', '#000'), '#22D3EE');
		assert.equal(sanitizeColor('  #abc  ', '#000'), '#abc');
		assert.equal(sanitizeColor('terminal.ansiCyan', '#000'), 'terminal.ansiCyan');
	});

	test('rejects anything that could escape the stylesheet', () => {
		assert.equal(sanitizeColor('red; } body { display: none', '#000'), '#000');
		assert.equal(sanitizeColor('url(https://example.com/x.png)', '#000'), '#000');
		assert.equal(sanitizeColor('', '#000'), '#000');
	});

	test('the pill color accepts hex only, since it derives a readable text color', () => {
		assert.equal(sanitizeHexColor('#0aF', ''), '#0aF');
		assert.equal(sanitizeHexColor('terminal.ansiCyan', ''), '');
	});

	// VS Code exposes every theme color as a custom property with dots turned into
	// dashes, defined on .monaco-workbench.
	test('theme color ids become the matching CSS custom property', () => {
		assert.equal(toCssColor('terminal.ansiCyan'), 'var(--vscode-terminal-ansiCyan)');
		assert.equal(toCssColor('charts.blue'), 'var(--vscode-charts-blue)');
		assert.equal(toCssColor('  statusBar.foreground  '), 'var(--vscode-statusBar-foreground)');
	});

	test('hex colors pass through untouched and junk is rejected', () => {
		assert.equal(toCssColor('#22D3EE'), '#22D3EE');
		assert.equal(toCssColor('red; } body { display: none'), undefined);
		assert.equal(toCssColor('var(--evil)'), undefined);
		assert.equal(toCssColor(''), undefined);
	});

	test('accepts codicon names and tolerates the $(...) spelling', () => {
		assert.equal(sanitizeCodicon('window'), 'window');
		assert.equal(sanitizeCodicon('$(folder-active)'), 'folder-active');
		assert.equal(sanitizeCodicon(''), '');
	});

	test('rejects codicon names that are not plain identifiers', () => {
		assert.equal(sanitizeCodicon('window) $(alert'), '');
		assert.equal(sanitizeCodicon('../../etc/passwd'), '');
	});

	test('clamps numbers and falls back for non-finite input', () => {
		assert.equal(clampNumber(500, 200, 10_000, 1100), 500);
		assert.equal(clampNumber(5, 200, 10_000, 1100), 200);
		assert.equal(clampNumber(99_999, 200, 10_000, 1100), 10_000);
		assert.equal(clampNumber(NaN, 200, 10_000, 1100), 1100);
		assert.equal(clampNumber(40.6, 10, 200, 40), 41);
	});
});
