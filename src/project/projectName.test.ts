import * as assert from 'node:assert';
import { resolveProjectName } from './projectName';

suite('resolveProjectName', () => {
	test('uses the single open folder', () => {
		assert.equal(resolveProjectName({ name: 'api', folders: [{ name: 'api' }] }, ''), 'api');
	});

	test('an explicit label overrides the folder name', () => {
		assert.equal(
			resolveProjectName({ name: 'api', folders: [{ name: 'api' }] }, '  Payments API  '),
			'Payments API'
		);
	});

	test('prefers the workspace name over an arbitrary root in a multi-root workspace', () => {
		assert.equal(
			resolveProjectName(
				{ name: 'platform (Workspace)', folders: [{ name: 'api' }, { name: 'web' }] },
				''
			),
			'platform'
		);
	});

	test('falls back to the first root when a multi-root workspace has no usable name', () => {
		assert.equal(
			resolveProjectName({ name: ' (Workspace)', folders: [{ name: 'api' }, { name: 'web' }] }, ''),
			'api'
		);
	});

	test('announces nothing for an empty window', () => {
		assert.equal(resolveProjectName({ name: undefined, folders: undefined }, ''), undefined);
		assert.equal(resolveProjectName({ name: '', folders: [] }, ''), undefined);
	});
});
