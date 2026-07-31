import * as assert from 'node:assert';
import { titleBarCustomizations, withoutTitleBarCustomizations } from './titleBarColor';

// workbench.colorCustomizations routinely holds unrelated keys and per-theme
// blocks. Replacing the object instead of merging would silently destroy them,
// in a file the user often has committed.
suite('titleBarCustomizations', () => {
	const existing = {
		'editorInlayHint.background': '#00000000',
		'[Dracula Theme Soft]': { 'tab.activeBorder': '#ff79c6' },
	};

	test('merges over existing customizations rather than replacing them', () => {
		const next = titleBarCustomizations(existing, '#22D3EE');
		assert.equal(next['editorInlayHint.background'], '#00000000');
		assert.deepEqual(next['[Dracula Theme Soft]'], { 'tab.activeBorder': '#ff79c6' });
		assert.equal(next['commandCenter.background'], '#22D3EE');
	});

	test('derives a readable foreground rather than taking one on trust', () => {
		assert.equal(titleBarCustomizations({}, '#22D3EE')['commandCenter.foreground'], '#15151E');
		assert.equal(titleBarCustomizations({}, '#12203A')['commandCenter.foreground'], '#FFFFFF');
	});

	test('clearing removes only our keys', () => {
		const cleared = withoutTitleBarCustomizations(titleBarCustomizations(existing, '#22D3EE'));
		assert.deepEqual(cleared, existing, 'everything else must survive untouched');
	});
});
