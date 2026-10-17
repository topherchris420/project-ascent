import { spawn } from 'node:child_process';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';

const origin = 'http://127.0.0.1:3041';
// Explicit blanks prevent Next's local dotenv loader from enabling database-backed accounts.
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3041'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_URL: '',
    APP_ENCRYPTION_KEY: '',
    VERCEL: '',
    APP_ORIGIN: origin,
  },
  windowsHide: true,
  stdio: 'ignore',
});
const checks = [];
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch(origin)).ok;
      if (ready) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.ok(ready, 'Production server did not become ready.');
  for (const [path, status] of [
    ['/', 200],
    ['/demo', 200],
    ['/api/demo/report', 200],
    ['/api/demo/report?state=invalid', 400],
    ['/api/workspace', 401],
  ]) {
    const started = performance.now(),
      response = await fetch(origin + path),
      body = await response.text();
    assert.equal(response.status, status, path);
    if (path === '/demo') assert.match(body, /\$963,010/);
    if (path === '/api/demo/report') {
      assert.match(body, /FICTIONAL DEMONSTRATION DATA/);
      assert.doesNotMatch(body, /NaN|<script/);
    }
    if (path === '/') assert.doesNotMatch(response.headers.get('Content-Security-Policy'), /unsafe-eval/);
    checks.push({ path, status, elapsedMs: Math.round((performance.now() - started) * 10) / 10 });
  }
  const denied = await fetch(origin + '/api/auth/demo', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(denied.status, 503);
  checks.push({
    path: '/api/auth/demo',
    status: 503,
    note: 'Missing production database remains explicit; no SQLite fallback.',
  });
  const envText = await readFile('.env.local', 'utf8').catch(() => ''),
    secrets = [];
  for (const line of envText.split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && /(?:KEY|SECRET|DATABASE_URL)$/.test(match[1])) {
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (value.length > 20) secrets.push(value);
    }
  }
  let scanned = 0;
  const scan = async dir => {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const path = dir + '/' + file.name;
      if (file.isDirectory()) await scan(path);
      else if (/\.(?:js|json|map)$/.test(file.name)) {
        const body = await readFile(path, 'utf8');
        assert.ok(!secrets.some(secret => body.includes(secret)), 'A configured secret appeared in a client artifact.');
        scanned++;
      }
    }
  };
  await scan('.next/static');
  const result = {
    at: new Date().toISOString(),
    environment:
      'Local optimized Next.js production build; no hosted Vercel acceptance, no real provider/model requests',
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
    checks,
    secretScan: { artifacts: scanned, credentialValuesDisclosed: false, matches: 0 },
    sampleSizePerRequest: 1,
  };
  await writeFile('evidence/pricing-production-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  child.kill();
}
