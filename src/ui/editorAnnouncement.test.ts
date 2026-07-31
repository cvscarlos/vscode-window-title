import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { EditorAnnouncementSettings } from '../configuration/settings';
import { isFocusGain } from '../extension';
import { anchorRange, announcementDecoration } from './editorAnnouncement';

const SETTINGS: EditorAnnouncementSettings = {
	enabled: true,
	milliseconds: 1200,
	color: '#22D3EE',
	uppercase: true,
	fontSizePercent: 220,
};

suite('announcementDecoration', () => {
	test('renders the name with the configured color', () => {
		const after = announcementDecoration('payments-api', SETTINGS).after;
		assert.ok(after);
		assert.match(String(after.contentText), /PAYMENTS-API/);
		assert.equal(after.backgroundColor, '#22D3EE');
		assert.equal(after.borderColor, '#22D3EE', 'the border must track the fill');
	});

	test('a theme color id becomes a ThemeColor rather than a raw string', () => {
		const after = announcementDecoration('api', { ...SETTINGS, color: 'terminal.ansiCyan' }).after;
		assert.ok(after?.color instanceof vscode.ThemeColor);
	});

	// Attachment options have no fontSize; above 100% the size is appended to
	// textDecoration, which VS Code passes through as raw CSS. Undocumented, opt-in,
	// and it fails soft: an escaped value just drops the declaration.
	test('scales the text only above 100 percent', () => {
		const scaled = announcementDecoration('api', { ...SETTINGS, fontSizePercent: 220 }).after;
		assert.match(String(scaled?.textDecoration), /font-size: 220%/);

		const unscaled = announcementDecoration('api', { ...SETTINGS, fontSizePercent: 100 }).after;
		assert.equal(unscaled?.textDecoration, undefined, '100% must inject nothing at all');
	});

	// A hex fill can derive a readable foreground; a theme color id cannot, so
	// that case stays outlined rather than risking light text on a light fill.
	test('fills for a hex color and stays outlined for a theme color id', () => {
		const hex = announcementDecoration('api', SETTINGS).after;
		assert.equal(hex?.backgroundColor, '#22D3EE');
		assert.equal(hex?.color, '#15151E', 'dark text derived for a light cyan fill');

		const themed = announcementDecoration('api', { ...SETTINGS, color: 'terminal.ansiCyan' }).after;
		assert.equal(themed?.backgroundColor, 'transparent');
	});

	test('uppercase is optional', () => {
		const after = announcementDecoration('payments-api', { ...SETTINGS, uppercase: false }).after;
		assert.match(String(after?.contentText), /payments-api/);
	});
});

suite('anchorRange', () => {
	// Anchoring at column 0 would push the line's own text right and read as if
	// the file had changed; past the end of the line reads as an annotation.
	test('is an empty range at the end of the first visible line', async () => {
		const document = await vscode.workspace.openTextDocument({
			content: 'const first = 1;\nconst second = 2;\nconst third = 3;\n',
		});
		const editor = await vscode.window.showTextDocument(document, { preview: false });

		const range = anchorRange(editor);
		const firstVisibleLine = editor.visibleRanges[0]?.start.line ?? 0;

		assert.ok(range.isEmpty, 'must not cover any text');
		assert.equal(range.start.line, firstVisibleLine);
		assert.equal(
			range.start.character,
			document.lineAt(firstVisibleLine).range.end.character,
			'must sit past the end of the line'
		);
	});
});

// Decorations are not readable back through the API, so this cannot assert what
// is on screen. It does exercise the real path end to end — command registration,
// name resolution, settings read, anchor computation and setDecorations — which
// is where a crash would otherwise only show up in front of the user.
suite('the announce command', () => {
	test('is registered and runs against a real editor without throwing', async () => {
		const document = await vscode.workspace.openTextDocument({ content: 'const x = 1;\n' });
		await vscode.window.showTextDocument(document, { preview: false });

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('ntWindowTitle.announceProjectName'), 'command must be registered');

		await vscode.commands.executeCommand('ntWindowTitle.announceProjectName');
	});
});

// onDidChangeWindowState also fires when WindowState.active flips, which is
// driven by a ten-second idle timer — so a level check announces during ordinary
// work in a window that never lost focus.
suite('isFocusGain', () => {
	test('only a transition into focus counts', () => {
		assert.equal(isFocusGain(false, true), true, 'switching into the window');
		assert.equal(isFocusGain(true, true), false, 'idle then active, never unfocused');
		assert.equal(isFocusGain(true, false), false, 'switching away');
		assert.equal(isFocusGain(false, false), false);
	});
});
