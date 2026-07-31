import * as assert from 'node:assert';
import { clampNumber, sanitizeCodicon, sanitizeColor } from './settings';

// These reach the VS Code API directly — an unknown theme color id or a codicon
// name that is not a plain identifier renders as a broken badge, so anything
// unrecognized falls back instead of passing through.
suite('settings sanitizers', () => {
	test('accepts hex colors and theme color ids', () => {
		assert.equal(sanitizeColor('#22D3EE', '#000'), '#22D3EE');
		assert.equal(sanitizeColor('  #abc  ', '#000'), '#abc');
		assert.equal(sanitizeColor('terminal.ansiCyan', '#000'), 'terminal.ansiCyan');
	});

	test('rejects anything that is not a color', () => {
		assert.equal(sanitizeColor('red; } body { display: none', '#000'), '#000');
		assert.equal(sanitizeColor('url(https://example.com/x.png)', '#000'), '#000');
		assert.equal(sanitizeColor('', '#000'), '#000');
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
	// The flash duration reaches setTimeout, so a hostile or mistyped value must
	// not park the badge in its prominent state.
	test('clamps the flash duration and falls back for non-finite input', () => {
		assert.equal(clampNumber(1200, 200, 10_000, 1200), 1200);
		assert.equal(clampNumber(5, 200, 10_000, 1200), 200);
		assert.equal(clampNumber(999_999, 200, 10_000, 1200), 10_000);
		assert.equal(clampNumber(NaN, 200, 10_000, 1200), 1200);
	});
});
