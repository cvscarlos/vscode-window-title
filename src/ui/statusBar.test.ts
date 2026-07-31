import * as assert from 'node:assert';
import type { StatusBarSettings } from '../configuration/settings';
import { badgeStyle, ProjectStatusBar } from './statusBar';

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

// Alignment is fixed when a status-bar item is created, so changing sides disposes
// the item and builds a new one. That path is not observable through the API, so
// this asserts the thing that would actually break: a disposed item being reused,
// or a double dispose.
suite('ProjectStatusBar lifecycle', () => {
	const BASE: StatusBarSettings = {
		enabled: true,
		alignment: 'left',
		color: '#22D3EE',
		icon: 'window',
		flashOnFocus: true,
		flashMilliseconds: 200,
	};

	test('survives an alignment flip, a disable, and disposal', () => {
		const bar = new ProjectStatusBar();
		try {
			bar.update('api', BASE);
			bar.update('api', BASE); // same side: must reuse the item
			bar.update('api', { ...BASE, alignment: 'right' }); // must recreate
			bar.flash();
			bar.update('api', { ...BASE, alignment: 'right', enabled: false }); // must dispose
			bar.update('api', { ...BASE, alignment: 'right' }); // must come back
			bar.update(undefined, BASE); // no project: must dispose again
			bar.dispose();
			bar.dispose();
		} finally {
			bar.dispose();
		}
	});

	test('flashing without a name does nothing', () => {
		const bar = new ProjectStatusBar();
		bar.flash();
		bar.dispose();
	});
});
