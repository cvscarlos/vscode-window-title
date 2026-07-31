import * as assert from 'node:assert';
import type { StatusBarSettings } from '../configuration/settings';
import { badgeStyle } from './statusBar';

const SETTINGS: StatusBarSettings = {
	enabled: true,
	alignment: 'left',
	color: '#22D3EE',
	icon: 'window',
	flashOnFocus: true,
	flashMilliseconds: 1200,
};

suite('badgeStyle', () => {
	test('at rest the badge keeps its configured color and no background', () => {
		const style = badgeStyle('payments-api', SETTINGS, false);
		assert.equal(style.text, '$(window) payments-api');
		assert.equal(style.prominent, false);
		assert.equal(style.color, '#22D3EE');
	});

	// The prominent background supplies its own foreground; keeping ours on top of
	// it fights the theme and can come out unreadable.
	test('while flashing it goes prominent and yields the foreground to the theme', () => {
		const style = badgeStyle('payments-api', SETTINGS, true);
		assert.equal(style.prominent, true);
		assert.equal(style.color, undefined);
		assert.equal(style.text, '$(window) payments-api', 'the name must not move or change');
	});

	test('an empty icon leaves the name unprefixed', () => {
		assert.equal(badgeStyle('api', { ...SETTINGS, icon: '' }, false).text, 'api');
	});
});
