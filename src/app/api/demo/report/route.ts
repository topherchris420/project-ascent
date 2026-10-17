import {
  calculateDemo,
  defaultDemoState,
  demoCandidates,
  demoCosts,
  demoSources,
  demoStudioSchema,
  demoSubject,
} from '@/lib/demo-studio';
import { sampleSubject, SAMPLE_AS_OF } from '@/lib/pricing-sample';
import { renderCmaReport } from '@/lib/report-html';
export const runtime = 'nodejs';

/**
 * Public, stateless fixture route. It cannot load an account, provider, database or supplied property.
 * Its only non-fixture inputs are bounded practice entries, which stay labeled as unverified user input.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('state');
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    if (raw && raw.length > 6000) throw new Error('Oversized input');
    const state = demoStudioSchema.parse(raw ? JSON.parse(raw) : defaultDemoState);
    const result = calculateDemo(state);
    const record = {
      id: 'public-fictional-sample',
      propertyId: sampleSubject.id,
      name: 'Linden Court · practice pricing decision',
      createdAt: SAMPLE_AS_OF,
      result,
      reviewNotes: state.exclusions.map(e => ({ propertyId: e.id, reason: e.reason })),
    };
    if (url.searchParams.get('format') === 'json')
      return Response.json(
        {
          format: 'ascent-practice-decision-1',
          mode: 'fictional-demonstration',
          record,
          sources: demoSources(state),
          scenario: { ...state, listPrice: state.listPrice ?? result.estimate },
          reproduction:
            'Recalculate record.result.inputSnapshot with the archived assumptions and asOf using the stated Ascent engine version. Check calculationHash.',
          limits:
            'Fictional properties; no account, provider request, appraisal or forecast. The checksum is not cryptographic proof.',
        },
        { headers: { ...headers, 'Content-Disposition': 'attachment; filename="ascent-practice-decision.json"' } },
      );
    return new Response(
      renderCmaReport({
        record,
        property: demoSubject(state),
        candidates: demoCandidates(state),
        organization: 'Account-free practice studio',
        preparedBy: 'Practice user',
        synthetic: true,
        sources: demoSources(state),
        costs: demoCosts(state),
        payoff: state.payoff,
        selectedListPrice: state.listPrice ?? result.estimate,
        presentation: false,
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: {
          ...headers,
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          'This practice decision cannot be calculated. Return to the studio, restore a sale or reset the assumptions, then try again.',
      },
      { status: 400, headers },
    );
  }
}
