import * as assert from 'node:assert';
import { cleanName, extractMarkedName, NAME_CLOSE, NAME_OPEN, undoubleText } from './markers';

const CODICON_GLYPH = String.fromCodePoint(0xea_7b);

suite('name markers', () => {
	test('the markers are invisible and do not widen the badge', () => {
		assert.equal(NAME_OPEN.length, 1);
		assert.equal(NAME_CLOSE.length, 1);
		assert.notEqual(NAME_OPEN, NAME_CLOSE);
		// Not whitespace, so trimming the badge text cannot silently eat them.
		assert.equal(`${NAME_OPEN}${NAME_CLOSE}`.trim().length, 2);
	});

	test('reads the name back out of rendered badge text', () => {
		const rendered = `${CODICON_GLYPH} ${NAME_OPEN}payments-api${NAME_CLOSE}`;
		assert.equal(extractMarkedName(rendered), 'payments-api');
	});

	test('survives neighbouring status-bar entries in the same text run', () => {
		const rendered = `Ln 4, Col 2${NAME_OPEN}web-app${NAME_CLOSE}Spaces: 2`;
		assert.equal(extractMarkedName(rendered), 'web-app');
	});

	test('returns undefined when the badge is absent or empty', () => {
		assert.equal(extractMarkedName('Ln 4, Col 2'), undefined);
		assert.equal(extractMarkedName(`${NAME_OPEN}${NAME_CLOSE}`), undefined);
	});

	test('strips codicon glyphs from a name read without markers', () => {
		assert.equal(cleanName(`${CODICON_GLYPH} my-project `), 'my-project');
	});
});

// The title bar keeps hidden duplicate labels, so reading its textContent
// yielded "vscode-window-titlevscode-window-title" on VS Code 1.130.
suite('undoubleText', () => {
	test('halves a string that is exactly itself twice', () => {
		assert.equal(undoubleText('vscode-window-titlevscode-window-title'), 'vscode-window-title');
		assert.equal(undoubleText('abab'), 'ab');
	});

	test('leaves anything else alone', () => {
		assert.equal(undoubleText('vscode-window-title'), 'vscode-window-title');
		assert.equal(undoubleText('abcab'), 'abcab');
		// A genuinely repeating name must survive: halving 'aa' to 'a' is correct,
		// but 'aaa' is not a doubling and must not be touched.
		assert.equal(undoubleText('aaa'), 'aaa');
		assert.equal(undoubleText(''), '');
	});
});
