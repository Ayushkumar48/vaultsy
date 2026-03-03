import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	outDir: 'dist',
	clean: true,
	bundle: true,
	splitting: false,
	sourcemap: false,
	dts: false,
	banner: {
		js: '#!/usr/bin/env node'
	},
	noExternal: ['@vaultsy/shared'],
	external: [
		'chalk',
		'commander',
		'ora',
		'@clack/prompts',
		'node:fs',
		'node:os',
		'node:path',
		'node:child_process'
	],
	esbuildOptions(options) {
		options.platform = 'node';
		options.target = 'node20';
	}
});
