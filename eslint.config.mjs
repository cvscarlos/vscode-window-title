import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

export default [
	{ files: ['**/*.ts'] },
	// If this import shape errors, use eslintPluginUnicorn.configs['flat/recommended'].
	eslintPluginUnicorn.configs.recommended,
	{
		plugins: {
			'@typescript-eslint': typescriptEslint,
		},
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{ selector: 'import', format: ['camelCase', 'PascalCase'] },
			],
			curly: 'warn',
			eqeqeq: 'warn',
			'no-throw-literal': 'warn',
			semi: 'warn',
			'unicorn/prevent-abbreviations': 'off',
			// Opinionated abbreviation dictionary (v72): would rename domain fields for
			// style only.
			'unicorn/name-replacements': 'off',
			// Would rename boolean-returning functions to did*/is*. `applyPatch` and
			// `removePatch` are actions whose result reports whether anything changed,
			// and `setHudEnabled(enabled)` mirrors the setting it writes.
			'unicorn/consistent-boolean-name': 'off',
			// The tsconfig leaves esModuleInterop off, matching the sibling extensions,
			// so CommonJS builtins have to be imported as namespaces.
			'unicorn/import-style': [
				'error',
				{
					styles: {
						path: { namespace: true, default: true },
						'node:path': { namespace: true, default: true },
					},
				},
			],
			'unicorn/filename-case': ['warn', { case: 'camelCase' }],
		},
	},
	// Must come last: turns off ESLint rules that conflict with Prettier.
	eslintConfigPrettier,
];
