import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

// Reads supplied server credentials only to compare bytes. Never prints their values.
async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (/\.(?:js|json|map)$/.test(entry.name)) files.push(path);
  }
  return files;
}
const files = await filesBelow(resolve('.next/static'));
const credentialNames = ['GROQ_API_KEY', 'RENTCAST_API_KEY'].filter(name => process.env[name]);
const credentials = credentialNames.map(name => process.env[name]);
const matches = [];
for (const path of files) {
  const contents = await readFile(path, 'utf8');
  if (credentials.some(credential => contents.includes(credential)) || /gsk_[A-Za-z0-9]{24,}/.test(contents))
    matches.push(relative(process.cwd(), path));
}
const scan = {
  at: new Date().toISOString(),
  scanned: files.length,
  found: matches.length,
  matches,
  suppliedCredentialChecked: credentials.length > 0,
  credentialNamesChecked: credentialNames,
  scope: 'Compiled browser JavaScript, JSON and source maps only; no provider request',
};
await writeFile(resolve('evidence/build-artifact-scan.json'), JSON.stringify(scan, null, 2) + '\n');
console.log(
  JSON.stringify({
    clientArtifacts: files.length,
    credentialMatches: matches.length,
    suppliedCredentialChecked: credentials.length > 0,
    credentialNamesChecked: credentialNames,
  }),
);
if (matches.length) process.exitCode = 1;

if (process.argv.includes('--repository')) {
  const git = args =>
    execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args], {
      encoding: 'utf8',
      windowsHide: true,
    });
  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  let found = 0;
  for (const file of tracked) {
    const text = await readFile(resolve(file), 'utf8');
    if (
      credentials.some(credential => text.includes(credential)) ||
      /gsk_[A-Za-z0-9]{24,}/.test(text) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
    )
      found++;
  }
  const privateEnvironmentIgnored = git(['check-ignore', '.env.local']).trim() === '.env.local';
  const result = {
    at: new Date().toISOString(),
    trackedFilesScanned: tracked.length,
    credentialMatches: found,
    suppliedCredentialChecked: credentials.length > 0,
    credentialNamesChecked: credentialNames,
    privateEnvironmentIgnored,
    scope:
      'Tracked file bytes, known Groq token pattern and private-key markers; not a comprehensive secret/security audit',
  };
  await writeFile(resolve('evidence/repository-secret-scan.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (found || !privateEnvironmentIgnored) process.exitCode = 1;
}

if (process.argv.includes('--production-http')) {
  const origin = 'http://localhost:3040';
  const home = await fetch(origin, { signal: AbortSignal.timeout(10000) });
  const workspace = await fetch(`${origin}/api/workspace`, { signal: AbortSignal.timeout(10000) });
  const provider = await fetch(`${origin}/api/providers/property`, { signal: AbortSignal.timeout(10000) });
  const demo = await fetch(`${origin}/api/auth/demo`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  const error = await demo.json();
  const result = {
    at: new Date().toISOString(),
    environment: 'Local Next production build without PostgreSQL',
    homeStatus: home.status,
    anonymousWorkspaceStatus: workspace.status,
    anonymousProviderStatus: provider.status,
    demoStatusWithoutPostgres: demo.status,
    configurationErrorHandled:
      demo.status === 503 && typeof error.error === 'string' && !/stack|password|postgres:\/\//i.test(error.error),
    cspOmitsUnsafeEval: !(home.headers.get('content-security-policy') || '').includes('unsafe-eval'),
    poweredByHeaderAbsent: !home.headers.has('x-powered-by'),
    scope: 'HTTP launch and fail-closed configuration only; no live PostgreSQL or provider tested',
  };
  await writeFile(resolve('evidence/production-smoke.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (
    home.status !== 200 ||
    workspace.status !== 401 ||
    provider.status !== 401 ||
    !result.configurationErrorHandled ||
    !result.cspOmitsUnsafeEval ||
    !result.poweredByHeaderAbsent
  )
    process.exitCode = 1;
}
