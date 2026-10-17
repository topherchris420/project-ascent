import { json } from '@/lib/api';
import { operationalHealth, type HealthReport } from '@/lib/operations';
export const runtime = 'nodejs';

// Unauthenticated probes are answered from a short per-instance cache so they cannot load the database.
let cached: { at: number; report: HealthReport } | undefined;
export async function GET() {
  if (!cached || Date.now() - cached.at > 10_000) cached = { at: Date.now(), report: await operationalHealth() };
  return json(cached.report, cached.report.status === 'unavailable' ? 503 : 200);
}
