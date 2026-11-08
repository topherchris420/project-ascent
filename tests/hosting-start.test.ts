import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: { dev: string; start: string };
};

test('production startup accepts a platform PORT and listens beyond loopback', () => {
  // Next.js reads PORT automatically when no -p/--port flag overrides it.
  assert.equal(packageJson.scripts.start, 'next start -H 0.0.0.0');
  assert.doesNotMatch(packageJson.scripts.start, /(?:^|\s)(?:-p|--port)(?:\s|=)\d+/);
});

test('local development remains bound to its existing private address and port', () => {
  assert.equal(packageJson.scripts.dev, 'next dev --webpack -H 127.0.0.1 -p 3040');
});
