import {
  MD_GRADE_MAX,
  MD_PARCEL_PATTERN,
  marylandDefaultState,
  marylandRevisedBenchmark as marylandBenchmark,
  marylandVerdict,
} from '@/lib/maryland-studio';
import {
  calculateStudio,
  studioCandidates,
  studioCosts,
  studioSources,
  studioStateSchema,
  studioSubject,
} from '@/lib/demo-studio';
import { marylandValuationInputs } from '@/lib/providers/maryland-public-records';
import { renderCmaReport } from '@/lib/report-html';
import { assessValuationRelease, valuationReleaseSwitch } from '@/lib/valuation-safeguards';
export const runtime = 'nodejs';

/**
 * Public, stateless report for a Maryland public-record analysis. The subject and sales are rebuilt on the server
 * from the bundled snapshot; the request only supplies bounded scenario choices and labeled practice entries.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parcel = url.searchParams.get('parcel') ?? '';
  const raw = url.searchParams.get('state');
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const inputs = MD_PARCEL_PATTERN.test(parcel) ? marylandValuationInputs(parcel) : null;
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
      MD_GRADE_MAX,
      true,
    );
    const state = schema.parse(raw ? JSON.parse(raw) : marylandDefaultState());
    const result = calculateStudio(evidence, state);
    const sources = studioSources(evidence, state);
    const gate = assessValuationRelease(result, {
      sources,
      benchmark: marylandBenchmark,
      release: valuationReleaseSwitch(),
    });
    // Maryland publishes the calibration's measured coverage but displays only the raw comp envelope.
    const release = {
      ...gate,
      calibratedInterval: null,
      decision: !marylandBenchmark.accepted && gate.decision !== 'withhold' ? ('review' as const) : gate.decision,
      summary: !marylandBenchmark.accepted ? `${marylandVerdict()} Qualified review required.` : gate.summary,
      checks: gate.checks.map(check =>
        check.id === 'measured-accuracy'
          ? {
              ...check,
              status: marylandBenchmark.accepted ? ('context' as const) : ('review' as const),
              detail: `${marylandVerdict()} Historical pooled holdout: ${(marylandBenchmark.primary.mdape * 100).toFixed(1)}% median error. This draft displays an uncalibrated comparable envelope, not the test's calibrated interval.`,
            }
          : check,
      ),
    };
    const record = {
      id: `md-${parcel}`,
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
          mode: 'maryland-public-records',
          record,
          sources,
          snapshot: inputs.snapshot,
          scenario: { ...state, listPrice: state.listPrice ?? result.estimate },
          reproduction:
            'Recalculate record.result.inputSnapshot with the archived assumptions and asOf using the stated Ascent engine version. Check calculationHash.',
          missingFeatures: ['bedrooms', 'bathrooms'],
          ratingKind: 'quality-grade',
          validation: {
            reportDigest: marylandBenchmark.reportDigest,
            accepted: marylandBenchmark.accepted,
            criteriaMet: marylandBenchmark.acceptance.filter(c => c.passed).length,
          },
          limits:
            'Maryland SDAT/MDP public-domain data; Montgomery and Prince George’s only. Room counts unavailable: internal beds/baths=0 are neutral sentinels, never observed zero rooms; both rates fixed to zero. Engine condition slot is quality grade, not interior condition. Latest three transfers per current parcel; older history incomplete. Not MLS data, an appraisal or a forecast. Concessions are not recorded and recent sales may not be recorded yet. The checksum is not cryptographic proof.',
        },
        {
          headers: {
            ...headers,
            'Content-Disposition': `attachment; filename="ascent-maryland-${parcel}-decision.json"`,
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
        sources,
        costs: studioCosts(state),
        payoff: state.payoff,
        selectedListPrice: state.listPrice ?? result.estimate,
        evidenceNotice: `${marylandVerdict()} Median error ${(marylandBenchmark.primary.mdape * 100).toFixed(1)}% on ${marylandBenchmark.holdout.sales} held-out sales (${marylandBenchmark.holdout.from} to ${marylandBenchmark.holdout.to}). Bedrooms and bathrooms unavailable. Prices use size, construction quality grade, location and sale timing only; the range is an uncalibrated comparable envelope. Latest three transfers per current parcel; older history incomplete. Report ${marylandBenchmark.reportDigest}.`,
        conditionScale: {
          max: MD_GRADE_MAX,
          note:
            state.subjectCondition !== undefined && state.subjectCondition !== inputs.subject.condition
              ? 'your quality grade; the recorded SDAT grade differs'
              : 'SDAT construction quality grade, not interior condition',
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
