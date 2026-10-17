import { DC_CONDITION_MAX, DC_PARCEL_PATTERN, dcDefaultState } from '@/lib/dc-studio';
import {
  calculateStudio,
  studioCandidates,
  studioCosts,
  studioSources,
  studioStateSchema,
  studioSubject,
  studioUnmodified,
} from '@/lib/demo-studio';
import { dcValuationInputs } from '@/lib/providers/dc-public-records';
import { renderCmaReport } from '@/lib/report-html';
import { assessValuationRelease, valuationReleaseSwitch } from '@/lib/valuation-safeguards';
export const runtime = 'nodejs';

/**
 * Public, stateless report for a District public-record analysis. The subject and sales are rebuilt on the server
 * from the bundled snapshot; the request only supplies bounded scenario choices and labeled practice entries.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parcel = url.searchParams.get('parcel') ?? '';
  const raw = url.searchParams.get('state');
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const inputs = DC_PARCEL_PATTERN.test(parcel) ? dcValuationInputs(parcel) : null;
    if (!inputs) throw new Error('Unknown parcel');
    if (raw && raw.length > 6000) throw new Error('Oversized input');
    const evidence = {
      subject: inputs.subject,
      candidates: inputs.candidates,
      sources: inputs.sources,
      asOf: inputs.asOf,
    };
    const schema = studioStateSchema(
      inputs.candidates.map(p => p.id),
      DC_CONDITION_MAX,
    );
    const state = schema.parse(raw ? JSON.parse(raw) : dcDefaultState());
    const result = calculateStudio(evidence, state);
    const sources = studioSources(evidence, state);
    const gate = assessValuationRelease(result, { sources, release: valuationReleaseSwitch() });
    // The calibration describes the unmodified validated analysis; any exclusion, entry or re-rating leaves it.
    const release = studioUnmodified(state) ? gate : { ...gate, calibratedInterval: null };
    const record = {
      id: `dc-${parcel}`,
      propertyId: inputs.subject.id,
      name: `${inputs.subject.address} · public-record pricing draft`,
      createdAt: inputs.asOf,
      result,
      release,
      reviewNotes: state.exclusions.map(e => ({ propertyId: e.id, reason: e.reason })),
    };
    if (url.searchParams.get('format') === 'json')
      return Response.json(
        {
          format: 'ascent-public-record-decision-1',
          mode: 'dc-public-records',
          record,
          sources,
          snapshot: inputs.snapshot,
          scenario: { ...state, listPrice: state.listPrice ?? result.estimate },
          reproduction:
            'Recalculate record.result.inputSnapshot with the archived assumptions and asOf using the stated Ascent engine version. Check calculationHash.',
          limits:
            'District public records (CC BY 4.0) joined and filtered by Ascent; not MLS data, not an appraisal and not a forecast. Concessions are not recorded and recent sales may not be recorded yet. The checksum is not cryptographic proof.',
        },
        {
          headers: { ...headers, 'Content-Disposition': `attachment; filename="ascent-dc-${parcel}-decision.json"` },
        },
      );
    return new Response(
      renderCmaReport({
        record,
        property: studioSubject(evidence, state),
        candidates: studioCandidates(evidence, state),
        organization: 'Account-free Ascent studio',
        preparedBy: 'Ascent user (not a reviewed professional analysis)',
        synthetic: false,
        sources,
        costs: studioCosts(state),
        payoff: state.payoff,
        selectedListPrice: state.listPrice ?? result.estimate,
        conditionScale: {
          max: DC_CONDITION_MAX,
          note:
            state.subjectCondition !== undefined && state.subjectCondition !== inputs.subject.condition
              ? 'your rating; the District assessor grade differs'
              : 'District assessor grade',
        },
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
          'This analysis cannot be calculated. Return to the studio, restore a sale or reset the assumptions, then try again.',
      },
      { status: 400, headers },
    );
  }
}
