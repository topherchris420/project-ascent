import { DC_CONDITION_MAX, DC_PARCEL_PATTERN } from '@/lib/dc-studio';
import { condoBenchmark, condoDefaultState, CONDO_ACCURACY_NOTICE } from '@/lib/dc-condo-studio';
import {
  calculateStudio,
  studioCandidates,
  studioCosts,
  studioSources,
  studioStateSchema,
  studioSubject,
} from '@/lib/demo-studio';
import { condoValuationInputs } from '@/lib/providers/dc-condo-public-records';
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
    const inputs = DC_PARCEL_PATTERN.test(parcel) ? condoValuationInputs(parcel) : null;
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
      false,
      false,
    );
    const state = schema.parse(raw ? JSON.parse(raw) : condoDefaultState());
    const result = calculateStudio(evidence, state);
    const sources = studioSources(evidence, state);
    const gate = assessValuationRelease(result, { sources, release: valuationReleaseSwitch() });
    // The condo holdout failed acceptance. A DC address must not borrow single-family calibration.
    const release = {
      ...gate,
      calibratedInterval: null,
      reference: null,
      checks: gate.checks.map(c => (c.id === 'measured-accuracy' ? { ...c, detail: CONDO_ACCURACY_NOTICE } : c)),
    };
    const record = {
      id: `dc-condo-${parcel}`,
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
          mode: 'dc-condo-public-records',
          record,
          sources,
          snapshot: inputs.snapshot,
          scenario: { ...state, listPrice: state.listPrice ?? result.estimate },
          reproduction:
            'Recalculate record.result.inputSnapshot with the archived assumptions and asOf using the stated Ascent engine version. Check calculationHash.',
          propertyType: 'condominium',
          validation: {
            accepted: condoBenchmark.accepted,
            measured: true,
            reportDigest: condoBenchmark.reportDigest,
            benchmark: condoBenchmark,
            calibratedInterval: null,
          },
          condoLimits: CONDO_ACCURACY_NOTICE,
          limits:
            'District public records (CC BY 4.0) joined and filtered by Ascent; not MLS data, not an appraisal and not a forecast. Concessions are not recorded and recent sales may not be recorded yet. The checksum is not cryptographic proof.',
        },
        {
          headers: {
            ...headers,
            'Content-Disposition': `attachment; filename="ascent-dc-condo-${parcel}-decision.json"`,
          },
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
        evidenceNotice: CONDO_ACCURACY_NOTICE,
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
