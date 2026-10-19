import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import robots from '../src/app/robots';
import sitemap from '../src/app/sitemap';
import manifest from '../src/app/manifest';
import { PUBLIC_PAGES, siteOrigin } from '../src/lib/site-origin';

const withEnv = (env: Record<string, string | undefined>, run: () => void) => {
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
};

test('absolute URLs use the configured origin, then the Vercel production host, then local development', () => {
  withEnv({ APP_ORIGIN: 'https://ascent.example/', VERCEL_PROJECT_PRODUCTION_URL: 'ignored.vercel.app' }, () =>
    assert.equal(siteOrigin(), 'https://ascent.example'),
  );
  withEnv({ APP_ORIGIN: undefined, VERCEL_PROJECT_PRODUCTION_URL: 'ascent.vercel.app' }, () =>
    assert.equal(siteOrigin(), 'https://ascent.vercel.app'),
  );
  withEnv({ APP_ORIGIN: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined }, () =>
    assert.equal(siteOrigin(), 'http://localhost:3040'),
  );
});

test('the sitemap lists every public page and robots keeps APIs and account pages out', () => {
  withEnv({ APP_ORIGIN: 'https://ascent.example' }, () => {
    const urls = sitemap().map(entry => entry.url);
    assert.deepEqual(
      urls,
      PUBLIC_PAGES.map(path => `https://ascent.example${path === '/' ? '' : path}`),
    );
    const rules = robots();
    assert.equal(rules.sitemap, 'https://ascent.example/sitemap.xml');
    assert.deepEqual(rules.rules, { userAgent: '*', allow: '/', disallow: ['/api/', '/account/'] });
  });
  for (const path of PUBLIC_PAGES)
    assert.ok(existsSync(`src/app${path === '/' ? '' : path}/page.tsx`), `${path} has a page`);
});

test('the web manifest points at icons the app serves', () => {
  const icons = manifest().icons ?? [];
  assert.deepEqual(
    icons.map(icon => icon.src),
    ['/icon.svg', '/apple-icon'],
  );
  assert.ok(existsSync('src/app/icon.svg'));
  assert.ok(existsSync('src/app/apple-icon.tsx'));
});
