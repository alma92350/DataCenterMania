import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version;
const build = new Date().toISOString().slice(0, 16).replace(/\D/g, ''); // e.g. 202611271130

/** Publishes version.json next to the page so a running game can tell when a newer build is live. */
const versionFile = (): Plugin => ({
  name: 'dcm-version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build }) });
  },
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version), __APP_BUILD__: JSON.stringify(build) },
  plugins: [versionFile()],
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
});
