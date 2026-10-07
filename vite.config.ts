import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { APP_VERSION } from './src/lib/versions';

// Every deploy gets a unique build id (the Git commit on Vercel). It is baked
// into the app, stamped into sw.js, and published as /version.json. Running
// apps poll version.json and reload themselves when it changes.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || Date.now().toString(36);

function buildStamp(): Plugin {
  return {
    name: 'bbw-build-stamp',
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      const sw = path.join(dir, 'sw.js');
      fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', BUILD_ID));
      fs.writeFileSync(path.join(dir, 'version.json'),
        JSON.stringify({ version: APP_VERSION, build: BUILD_ID, builtAt: new Date().toISOString() }) + '\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), buildStamp()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { target: 'es2020', sourcemap: false },
  test: { include: ['src/**/*.test.ts'] },
});
