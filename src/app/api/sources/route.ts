import { ASCENT_POLICY, SOURCE_REGISTRY_VERSION, sourceCoverage } from '@/lib/sources/registry';
export const runtime = 'nodejs';

/** The public-source permission registry: what Ascent may read, what is disabled and what each source needs. */
export async function GET() {
  return Response.json(
    { version: SOURCE_REGISTRY_VERSION, policy: ASCENT_POLICY, sources: sourceCoverage() },
    { headers: { 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } },
  );
}
