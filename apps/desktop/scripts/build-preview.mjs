// Builds the Studio's preview scripts into resources/preview/, which the main process serves
// at oms-preview://film/studio/: core.js (src/preview/core.tsx: React, @motionhub/runtime and
// the native player), hyperframes.js (src/preview/hyperframes.ts: the bridge to a HyperFrames
// page) and pick.js (src/preview/pick.ts: pointing at the picture, on every page). Run before
// `dev` and `build`.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: { core: 'src/preview/core.tsx', hyperframes: 'src/preview/hyperframes.ts', pick: 'src/preview/pick.ts' },
  outdir: 'resources/preview',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome130',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
