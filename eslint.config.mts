import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		// The LOKF sidecar is a Python/uv project; nothing under it is plugin
		// code, and its .venv ships vendored JS that is not ours to lint.
		'.lokf',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		rules: {
			// This plugin's UI names LOKF things, and the rule's two exception
			// lists are not interchangeable - which one a term belongs in is
			// decided by how the rule treats it:
			//
			// `brands` match case-insensitively, rewrite to the canonical casing,
			// and are the only tokens exempt from being capitalized as the first
			// word of a sentence. So terms that must never be sentence-cased even
			// in the leading position ("LOKF conformance") go here - as does
			// `http_method`, a frontmatter key that is lowercase by spec and would
			// otherwise be uppercased by the built-in HTTP acronym.
			//
			// `ignoreWords` match the token exactly as authored and leave it be,
			// which suits vocabulary class names whose lowercase spelling is also
			// a legitimate English word ("service", "table") -listing those as
			// brands would force the capital everywhere.
			//
			// Both options replace the plugin's own defaults rather than extending
			// them, hence the Obsidian/platform names repeated below.
			'obsidianmd/ui/sentence-case': [
				'warn',
				{
					brands: [
						'LOKF',
						'OKF',
						'Diátaxis',
						'http_method',
						'Obsidian',
						'Obsidian Sync',
						'Obsidian Publish',
						'iOS',
						'iPadOS',
						'macOS',
						'Windows',
						'Android',
						'Linux',
					],
					// A CURIE prefix is lowercase by convention (`lokf:Concept` is
					// how the term is actually spelled in the LOKF context), so a
					// string quoting one is exempt outright - the LOKF brand above
					// would otherwise "correct" the prefix to uppercase.
					ignoreRegex: ['\\blokf:[A-Z]'],
					ignoreWords: [
						'IRI',
						'RDF',
						'RelationType',
						'Concept',
						'Dataset',
						'Table',
						'Metric',
						'Service',
						'Playbook',
						'GlossaryTerm',
						'AttestedComputation',
					],
				},
			],
		},
	},
	{
		// scripts/ is Node-side development tooling that never reaches the plugin
		// bundle, so it gets Node globals, and the console rule - which exists to
		// keep noise out of the Obsidian developer console - does not apply.
		files: ['scripts/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			'obsidianmd/rule-custom-message': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
