export type DeploymentCheck = { name: string; required: boolean; ok: boolean; message: string };
type Environment = Record<string, string | undefined>;

/** Strictly validate HTTPS origins; never derive an auth origin from an untrusted request Host header. */
function validHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Explicit configuration takes precedence. Otherwise Vercel's deployment-owned URLs are safe
 * alternatives so deployments work on their production alias as well as immutable preview URLs.
 * A malformed explicit APP_ORIGIN is a configuration error, not an invitation to fall back.
 */
export function allowedAppOrigins(env: Environment = process.env): string[] {
  if (env.APP_ORIGIN) {
    const origin = validHttpsOrigin(env.APP_ORIGIN);
    return origin ? [origin] : [];
  }
  if (env.VERCEL !== '1') return [];
  const origins = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]
    .filter((host): host is string => !!host && !host.includes('/') && !host.includes('\\') && !host.includes('@'))
    .map(host => validHttpsOrigin(`https://${host}`))
    .filter((origin): origin is string => origin !== null);
  return [...new Set(origins)];
}

/** Configuration only: no database/provider call and no credential value in the result. */
export function checkDeployment(env: Environment = process.env) {
  let databaseOk = false;
  const originOk = allowedAppOrigins(env).length > 0;
  try {
    const url = new URL(env.DATABASE_URL || '');
    databaseOk = ['postgres:', 'postgresql:'].includes(url.protocol) && !!url.hostname;
  } catch {}
  const key = env.APP_ENCRYPTION_KEY || '';
  const encryptionOk = /^[A-Za-z0-9+/]{43}=$/.test(key) && Buffer.from(key, 'base64').length === 32;
  const checks: DeploymentCheck[] = [
    {
      name: 'DATABASE_URL',
      required: true,
      ok: databaseOk,
      message: 'Use a hosted PostgreSQL/PostGIS connection with the migrated, restricted application role.',
    },
    {
      name: 'APP_ORIGIN',
      required: true,
      ok: originOk,
      message: 'Use the exact HTTPS site origin or verified Vercel deployment URLs, without a trailing slash or path.',
    },
    {
      name: 'APP_ENCRYPTION_KEY',
      required: true,
      ok: encryptionOk,
      message: 'Use base64 encoding of 32 random bytes; preserve the key for existing encrypted documents.',
    },
    {
      name: 'CRON_SECRET',
      required: false,
      ok: (env.CRON_SECRET?.length || 0) >= 32,
      message: 'Configure a random secret of at least 32 characters for the daily scheduled review.',
    },
    {
      name: 'TLS',
      required: false,
      ok:
        env.PGSSL === 'require' || /[?&]sslmode=(?:require|verify-ca|verify-full)(?:&|$)/.test(env.DATABASE_URL || ''),
      message: 'Use certificate-verified TLS for the hosted database.',
    },
  ];
  if (env.GROQ_API_KEY)
    checks.push({
      name: 'AI_BUDGETS',
      required: false,
      ok: ['AI_REQUEST_BUDGET_USD', 'AI_DAILY_BUDGET_USD', 'AI_MONTHLY_BUDGET_USD'].every(
        name => Number(env[name]) > 0 && Number.isFinite(Number(env[name])),
      ),
      message: 'Inference requires explicit per-question, daily and monthly budgets; evidence mode remains available.',
    });
  if (env.PROPERTY_PROVIDER_ENABLED === 'true') {
    let productionPolicy = false;
    try {
      const policy = JSON.parse(env.PROPERTY_PROVIDER_POLICY_JSON || 'null');
      productionPolicy = !!policy && policy.deploymentScope === 'production';
    } catch {}
    checks.push({
      name: 'PROPERTY_PROVIDER_POLICY',
      required: false,
      ok: productionPolicy,
      message:
        'Live data requires reviewed production rights and tenant grants. A local-development policy cannot authorize Vercel.',
    });
  }
  return { configured: checks.every(check => !check.required || check.ok), checks, databaseVerified: false as const };
}

export function workspaceIsAvailable(env: Environment = process.env): boolean {
  return (env.NODE_ENV !== 'production' && env.VERCEL !== '1') || checkDeployment(env).configured;
}
