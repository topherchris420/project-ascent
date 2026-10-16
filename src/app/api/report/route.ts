import { authorized, endpoint, json } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { find } from '@/lib/service';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
import { HttpError } from '@/lib/auth';
import { renderCmaReport } from '@/lib/report-html';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return endpoint(async () => {
    const user = await authorized(request);
    const url = new URL(request.url);
    const original = await getWorkspace(user.tenantId);
    const workspace = scopeWorkspaceForAccess(original, 'export');
    const requestedId = url.searchParams.get('cmaId') || '';
    if (
      original.cmas.some(record => record.id === requestedId) &&
      !workspace.cmas.some(record => record.id === requestedId)
    )
      throw new HttpError(
        403,
        'Current source permissions do not permit exporting this saved CMA or its frozen evidence.',
      );
    const record = find(workspace.cmas, requestedId, 'CMA');
    const property = record.result.inputSnapshot?.subject || find(workspace.properties, record.propertyId, 'Property');
    const reportIsSynthetic = record.result.sourceIds.some(
      id => workspace.sources.find(source => source.id === id)?.kind === 'synthetic',
    );
    if (url.searchParams.get('format') === 'json')
      return json({
        organization: workspace.settings.organization,
        mode: reportIsSynthetic ? 'demo' : 'licensed',
        property,
        cma: record,
        snapshotMode: record.result.inputSnapshot ? 'frozen-inputs' : 'legacy-current-records-review-required',
        sources: workspace.sources.filter(source => record.result.sourceIds.includes(source.id)),
      });
    const cma = record.result;
    const number = (key: string, max: number) => {
      const raw = url.searchParams.get(key);
      if (raw === null || raw.trim() === '') return undefined;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : undefined;
    };
    const verifiedHtml = renderCmaReport({
      record,
      property,
      organization: workspace.settings.organization,
      preparedBy: user.name,
      synthetic: reportIsSynthetic,
      sources: workspace.sources.filter(source => cma.sourceIds.includes(source.id)),
      candidates: cma.inputSnapshot?.candidates || workspace.properties,
      costs: {
        commissionPercent: number('commission', 25),
        closingPercent: number('closing', 25),
        concessions: number('concessions', 100_000_000),
      },
      payoff: number('payoff', 1_000_000_000) ?? 0,
      presentation: url.searchParams.get('view') === 'presentation',
      generatedAt: new Date().toISOString(),
    });
    return new Response(verifiedHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    });
  });
}
