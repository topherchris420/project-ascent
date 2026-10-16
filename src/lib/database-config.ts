import type { PoolConfig } from 'pg';

/** Per-process limits, not an account-wide connection budget. Use a hosted transaction pooler on Vercel. */
export function databasePoolOptions(
  env: Record<string, string | undefined> = process.env,
): Pick<PoolConfig, 'max' | 'idleTimeoutMillis' | 'connectionTimeoutMillis' | 'allowExitOnIdle'> {
  const requested = Number(env.PG_POOL_MAX);
  const production = env.NODE_ENV === 'production' || env.VERCEL === '1';
  return {
    max: Number.isInteger(requested) && requested >= 1 && requested <= 20 ? requested : production ? 2 : 8,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    allowExitOnIdle: true,
  };
}
