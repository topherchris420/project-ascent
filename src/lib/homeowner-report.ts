import { escapeHtml as e } from './report-html';
import { evidencePassport, type HomeSnapshot } from './homeowner-passport';
import { decisionLabels, financeLabels, type FinanceKey } from './homeowner-finance';

const usd = (n: number | null) =>
  n === null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
/** Local report only. The same export permission filter feeds HTML and JSON. No private source or document path. */
export function renderHomeownerReport(snapshot: HomeSnapshot, includePrivate = false) {
  const passport = evidencePassport(snapshot, includePrivate),
    subject = passport.property,
    result = passport.valuation?.result;
  const candidates = new Map(result?.inputSnapshot?.candidates.map(p => [p.id, p]));
  const financial = passport.finance;
  const reference = passport.accuracyReference;
  const brief = passport.brief;
  const declined = brief?.executiveSummary.verdict === 'declined';
  const section = (title: string, body: string) => `<section><h2>${e(title)}</h2>${body}</section>`;
  const list = (items: string[], tag = 'ul') =>
    items.length ? `<${tag}>${items.map(item => `<li>${e(item)}</li>`).join('')}</${tag}>` : '';
  const summary = brief
    ? section(
        'Executive summary',
        `<p><strong>${e(brief.executiveSummary.label)}.</strong> ${e(brief.executiveSummary.value)}</p>${list(brief.executiveSummary.reasons)}<p>${e(brief.executiveSummary.comparables)}</p><p>${e(brief.executiveSummary.reliability)}</p>${[
          brief.uncertainty.observedRange,
          brief.uncertainty.calibratedRange,
        ]
          .filter(item => item !== null)
          .map(item => `<p>${e(item!.text)}</p>`)
          .join(
            '',
          )}${brief.executiveSummary.choices ? `<p>${e(brief.executiveSummary.choices)}</p>` : ''}<h3>What to obtain before deciding</h3>${list(
          brief.nextSteps.map(step => `${step.item} ${step.why}`),
          'ol',
        )}${brief.missingFacts.length ? `<h3>Facts the records do not contain</h3>${list(brief.missingFacts.map(fact => `${fact.fact}: ${fact.why}`))}` : ''}<p>Home Decision Brief ${e(brief.version)} · verdict policy ${e(brief.policy)}${brief.checksum ? ` · ${e(brief.checksum)}` : ''}. Scenarios are arithmetic under stated assumptions, not predictions, and choices are not ranked.</p>`,
      )
    : '';
  const choicesMade = brief
    ? `<h3>Sales excluded and settings changed</h3>${
        brief.comparables.excludedByHomeowner.length
          ? list(
              brief.comparables.excludedByHomeowner.map(
                item => `${item.address}: ${item.reason ?? 'reason withheld from this public report'}`,
              ),
            )
          : '<p>No sale was excluded by the homeowner.</p>'
      }<p>${e(brief.comparables.ruledOutByRules)} nearby recorded sales fell outside the distance, date or size limits.</p>${
        brief.settings.reference
          ? brief.settings.changes.length
            ? `<p>Settings that differ from ${e(brief.settings.reference)}:</p>${list(brief.settings.changes.map(change => `${change.label}: ${change.current} instead of ${change.reference}`))}`
            : `<p>Every setting matches ${e(brief.settings.reference)}.</p>`
          : ''
      }`
    : '';
  const property = section(
    'What the records contain',
    `<p>${e(subject.address)}, ${e(subject.city)}, ${e(subject.state)} ${e(subject.zip)}</p><p>${e(subject.sqft)} sq ft · ${subject.roomCountsUnavailable ? 'Bedrooms and bathrooms unavailable' : `${e(subject.beds)} recorded bedrooms · ${e(subject.baths)} recorded bathrooms`}${subject.yearBuilt ? ` · built ${e(subject.yearBuilt)}` : ''}.</p><p>Recorded characteristics are not an inspection. Mortgage, tax and insurance figures are not verified by these records.</p>`,
  );
  const valuation = section(
    'Valuation evidence',
    result
      ? `${declined ? `<p class="number">Not stated</p><p>The evidence does not support a value. The arithmetic of ${result.comps.length} recorded sale${result.comps.length === 1 ? '' : 's'} gives ${e(usd(result.estimate))}; it is a working figure for professional review, not a supported price.</p>` : `<p class="number">${e(usd(result.estimate))}</p>`}<p>Modeled estimate from ${result.comps.length} comparable sales. Observed adjusted-sale range: ${e(usd(result.low))}–${e(usd(result.high))}. This envelope is not a confidence interval or a guaranteed sale price.</p><p>Engine ${e(result.version)} · ${e(result.calculationHash)}. Saved-input replay ${passport.valuation!.replay.reproduced ? 'matches the frozen checksum' : 'does not match the frozen checksum; review the saved version'}.</p><table><caption>Recorded prices and model adjustments</caption><thead><tr><th>Sale</th><th>Recorded price</th><th>Sale date</th><th>Adjusted price</th><th>Weight</th></tr></thead><tbody>${result.comps
          .map(c => {
            const p = candidates.get(c.propertyId);
            return `<tr><th scope="row">${e(p?.address ?? c.propertyId)}</th><td>${e(usd(p?.soldPrice ?? null))}</td><td>${e(p?.soldAt?.slice(0, 10) ?? 'Unavailable')}</td><td>${e(usd(c.adjustedPrice))}</td><td>${e((c.weight * 100).toFixed(1))}%</td></tr>`;
          })
          .join('')}</tbody></table><p>Valuation assumptions: ${Object.entries(result.assumptions)
          .map(([key, value]) => `${e(key)} = ${e(value)}`)
          .join('; ')}.</p>${choicesMade}`
      : `<p>${e(passport.valuationOmission ?? 'No supported valuation can be reproduced from these inputs. Review missing evidence.')}</p>`,
  );
  const accuracy = reference
    ? section(
        'Published accuracy reference',
        `<p><strong>${e(reference.label)}: ${reference.accepted ? 'met' : 'did not meet'} its published acceptance criteria (${reference.criteriaMet} of 9 met).</strong></p><p>${e(reference.medianAbsolutePercentError.toFixed(2))}% median absolute percentage error across ${e(reference.holdoutSales)} held-out sales, ${e(reference.holdoutFrom)}–${e(reference.holdoutTo)}.</p>${reference.missedCriteria.length ? `<p>Missed criteria: ${e(reference.missedCriteria.join('; '))}.</p>` : ''}<p>${e(reference.boundary)}</p><p>${reference.matchesStudySettings ? 'The saved decision uses the study settings.' : 'The saved decision differs from the study settings or evidence choices; it cannot inherit measured accuracy.'}</p><p>Study digest ${e(reference.reportDigest)}. <a href="https://project-ascent-theta.vercel.app/accuracy">Review all published experiments</a>.</p>`,
      )
    : '';
  const choices = financial
    ? section(
        'Your financial choices',
        `<p>Private homeowner assumptions · ${financial.inputs.horizonMonths} month comparison. ${e(financial.version)} · ${e(financial.calculationHash)}. ${passport.financeReplayMatches ? 'Matches saved financial calculation.' : 'Financial replay differs from the saved version; retain the original JSON.'}</p><table><thead><tr><th>Choice</th><th>At closing</th><th>Initial monthly cash flow</th><th>End equity</th><th>Net position</th><th>Cash required</th></tr></thead><tbody>${financial.results.map(r => `<tr><th scope="row">${e(decisionLabels[r.kind])}</th><td>${e(usd(r.netProceeds))}</td><td>${e(usd(r.monthlyCashFlow))}</td><td>${e(usd(r.terminalEquity))}</td><td>${e(usd(r.netPosition))}</td><td>${e(usd(r.cashRequired))}</td></tr>${!r.available ? `<tr><td colspan="6">Inputs needed for ${e(decisionLabels[r.kind])}: ${e(r.missing.map(k => financeLabels[k]).join('; '))}. Sale timing must fit inside the comparison horizon.</td></tr>` : ''}`).join('')}</tbody></table><ul>${financial.limits.map(l => `<li>${e(l)}</li>`).join('')}</ul><h3>Financial assumptions used for this calculation</h3><table><thead><tr><th>Input</th><th>Entered value</th></tr></thead><tbody>${Object.entries(
          financial.inputs,
        )
          .map(
            ([key, value]) =>
              `<tr><th scope="row">${e(financeLabels[key as FinanceKey])}</th><td>${e(value === null ? 'Unknown' : value)}</td></tr>`,
          )
          .join('')}</tbody></table>`,
      )
    : '';
  const notes = includePrivate
    ? section(
        'Homeowner improvements and disputed evidence',
        `<p>Homeowner supplied; these notes do not automatically change the valuation.</p><ul>${snapshot.notes.improvements.map(i => `<li>${e(i.year)} · ${e(i.description)} · ${e(usd(i.cost))}</li>`).join('') || '<li>No improvement history provided.</li>'}</ul><p>${e(snapshot.notes.disputedEvidence || 'No disputed-evidence notes provided.')}</p>`,
      )
    : '';
  const sources = section(
    'Sources, freshness and missing information',
    `<ul>${passport.sources.map(s => `<li><strong>${e(s.label)}</strong> · ${e(s.id)} · collection ${e(s.observedAt)}<p>${e(s.license)}</p></li>`).join('')}</ul><p>These are static recorded snapshots, not live inventory. Recording delays, current assessor characteristics and unrecorded renovations limit analysis. No verified complete permit, hazard or title history is supplied.</p><ul>${passport.missingEvidence.map(s => `<li>${e(s)}</li>`).join('')}</ul>`,
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${e(subject.address)} · Ascent Evidence Passport</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#243d34;max-width:1050px;margin:40px auto;padding:0 24px}h1{font-size:32px;line-height:1.2}h2{font-size:22px}h3{font-size:17px}section{border-top:1px solid #ccd9cc;margin-top:28px;padding-top:12px}header{border-top:5px solid #2b6656}.privacy{padding:12px;background:#eef3e9}.number{font-size:30px;font-weight:650}table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}th,td{border-bottom:1px solid #d9e4d9;text-align:left;padding:8px;vertical-align:top;overflow-wrap:anywhere}caption{text-align:left;font-weight:600;padding:8px}thead{background:#f0f4ee}p,li{overflow-wrap:anywhere}@media print{body{margin:0;max-width:none;font-size:10pt;padding:0}thead{display:table-header-group}tr{break-inside:avoid}.print-help{display:none}h2,h3{break-after:avoid}table{font-size:8pt}@page{margin:15mm}}</style></head><body><header><p>ASCENT · PROPERTY EVIDENCE PASSPORT</p><h1>${e(subject.address)}</h1><p class="privacy">${e(passport.privacy)}</p><p>${passport.sources.some(s => s.kind === 'synthetic') ? 'FICTIONAL PRACTICE RECORDS · ' : ''}Analysis evidence: ${e(passport.analysisAt)}. Decision saved: ${e(passport.savedAt)}.</p><p>Decision aid, not an appraisal, loan quote or financial forecast.</p><p class="print-help">Use your browser’s Print command to print this report or save a PDF. Review the privacy label before sharing.</p></header>${summary}${property}${valuation}${accuracy}${choices}${notes}${sources}<footer><p>${e(passport.sharing)}</p><p>Snapshot ${e(passport.snapshotId)}. Keep the JSON passport for the complete reproducible inputs, monthly calculations and provenance. Checksums do not establish cryptographic authenticity.</p></footer></body></html>`;
}
