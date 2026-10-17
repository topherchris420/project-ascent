import { transaction } from './db';
import { allowedAppOrigins } from './deployment';
import { engineIntegrity, valuationBenchmarks, valuationReleaseSwitch } from './valuation-safeguards';

export type HealthCheck = { id: string; status: 'pass' | 'warn' | 'fail'; detail: string; latencyMs?: number };
export type HealthReport = { status: 'ok' | 'degraded' | 'unavailable'; checkedAt: string; checks: HealthCheck[] };
type Environment = Record<string, string | undefined>;

/** Bound a dependency probe so a hung database cannot hang the health endpoint itself. */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`No response within ${ms} ms.`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Readiness for serving valuations. Reports states and digests only: no connection string, key,
 * tenant identifier or error text from a dependency is ever included.
 */
export async function operationalHealth(
  options: { env?: Environment; probeStorage?: () => Promise<unknown>; deadlineMs?: number } = {},
): Promise<HealthReport> {
  const env = options.env ?? process.env;
  const checks: HealthCheck[] = [];
  const integrity = engineIntegrity();
  checks.push({
    id: 'valuation-engine',
    status: integrity.passed ? 'pass' : 'fail',
    detail: integrity.passed
      ? `Engine self-test reproduced validated fingerprint ${integrity.fingerprint}.`
      : 'Engine self-test does not match the validated fingerprint; published accuracy does not describe this build.',
  });
  const release = valuationReleaseSwitch(env);
  checks.push({
    id: 'valuation-release',
    status: release.enabled ? 'pass' : 'warn',
    detail: release.enabled
      ? 'Valuation approval is enabled.'
      : 'Valuation approval is paused by the operator; calculation remains available.',
  });
  // The accuracy verdict is a disclosure, not an outage: the check fails only when the evidence is missing.
  const present = valuationBenchmarks.filter(item => /^sha256-[0-9a-f]{64}$/.test(item.reportDigest ?? ''));
  checks.push({
    id: 'validation-evidence',
    status: present.length === valuationBenchmarks.length ? 'pass' : 'warn',
    detail: present.length
      ? present
          .map(
            item =>
              `${item.market.label}: report ${item.reportDigest.slice(0, 19)}… met ${item.acceptance.filter(criterion => criterion.passed).length} of ${item.acceptance.length} pre-registered criteria`,
          )
          .join('; ') + '.'
      : 'No validation report is bundled with this build.',
  });
  const production = env.NODE_ENV === 'production';
  checks.push({
    id: 'origin',
    status: !production || allowedAppOrigins(env).length ? 'pass' : 'fail',
    detail:
      !production || allowedAppOrigins(env).length
        ? 'Trusted application origin is configured.'
        : 'No trusted HTTPS application origin is configured.',
  });
  const started = Date.now();
  try {
    await withDeadline(
      (options.probeStorage ?? (() => transaction(null, tx => tx.query('SELECT 1'))))(),
      options.deadlineMs ?? 2000,
    );
    checks.push({
      id: 'storage',
      status: 'pass',
      detail: 'Workspace storage answered a probe query.',
      latencyMs: Date.now() - started,
    });
  } catch {
    checks.push({
      id: 'storage',
      status: 'fail',
      detail: 'Workspace storage did not answer a probe query.',
      latencyMs: Date.now() - started,
    });
  }
  return {
    status: checks.some(check => check.status === 'fail')
      ? 'unavailable'
      : checks.some(check => check.status === 'warn')
        ? 'degraded'
        : 'ok',
    checkedAt: new Date().toISOString(),
    checks,
  };
}
