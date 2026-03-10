import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { enhancedImages } from '@sveltejs/enhanced-img';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [enhancedImages(), tailwindcss(), sveltekit(), devtoolsJson()],
	resolve: {
		alias: {
			// Point directly at the TS source so Vite never needs to
			// serve files outside its allow list via the dist symlink.
			'@vaultsy/shared': resolve(__dirname, 'packages/shared/src/index.ts')
		}
	},
	server: {
		fs: {
			allow: [resolve(__dirname), resolve(__dirname, 'packages/shared')]
		}
	}
});
