import {
  calculateStudio,
  defaultDemoState,
  demoCosts,
  demoStudioSchema,
  sampleEvidence,
  studioCandidates,
  studioSources,
  studioSubject,
} from '@/lib/demo-studio';
import { SAMPLE_AS_OF } from '@/lib/pricing-sample';
import { renderCmaReport } from '@/lib/report-html';
import { sparseStudyEvidence, sparseStudySchema } from '@/lib/study-states';
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
    // The comprehension study's prepared state with two sales is a separate fictional home.
    const sparse = url.searchParams.get('study') === 'abstention';
    const evidence = sparse ? sparseStudyEvidence : sampleEvidence;
    const state = (sparse ? sparseStudySchema : demoStudioSchema).parse(raw ? JSON.parse(raw) : defaultDemoState);
    const result = calculateStudio(evidence, state);
    const record = {
      id: sparse ? 'public-fictional-study-sparse' : 'public-fictional-sample',
      propertyId: evidence.subject.id,
      name: `${sparse ? 'Quarry Lane' : 'Linden Court'} · practice pricing decision`,
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
          sources: studioSources(evidence, state),
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
        property: studioSubject(evidence, state),
        candidates: studioCandidates(evidence, state),
        organization: 'Account-free practice studio',
        preparedBy: 'Practice user',
        synthetic: true,
        sources: studioSources(evidence, state),
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
