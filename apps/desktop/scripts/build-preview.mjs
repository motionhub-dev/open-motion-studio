// Builds the preview core (src/preview/core.tsx: React, @motionhub/runtime and the player)
// into resources/preview/core.js, which the main process serves to every native film's
// preview. Run before `dev` and `build`.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ['src/preview/core.tsx'],
  outfile: 'resources/preview/core.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome130',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
