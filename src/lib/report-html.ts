import { simulatePricing } from './analytics';
import { explainPricing, type PricingPosition } from './pricing-narrative';
import type { CmaRecord, Property, Scenario, Source, ValuationProperty } from './types';

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const e = escapeHtml;
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const longDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const assumptionLabels: Record<string, [string, (value: number) => string]> = {
  sqftRate: ['Living area', value => `${usd(value)} per sq ft of difference`],
  bedroomValue: ['Bedroom', value => `${usd(value)} each`],
  bathroomValue: ['Bathroom', value => `${usd(value)} each`],
  conditionValue: [
    'Condition',
    value => (value ? `${usd(value)} per rating point` : 'Not adjusted (condition unverified)'),
  ],
  monthlyTrend: ['Market trend', value => `${(value * 100).toFixed(2)}% per month`],
  maxDistanceMiles: ['Search radius', value => `${value} miles`],
  maxAgeDays: ['Sale recency', value => `${value} days`],
  maxSizeRatio: ['Size similarity', value => `within ${value}× of the subject`],
};

export type ReportInput = {
  record: CmaRecord;
  property: ValuationProperty;
  organization: string;
  preparedBy: string;
  synthetic: boolean;
  sources: Source[];
  candidates: ValuationProperty[];
  costs: Partial<Scenario['costAssumptions']>;
  payoff: number;
  presentation: boolean;
  generatedAt: string;
};

/** Self-contained, script-free client report. Every figure comes from the frozen calculation. */
export function renderCmaReport(input: ReportInput): string {
  const { record, property, candidates } = input;
  const cma = record.result;
  const lookup = (id: string) => candidates.find(item => item.id === id) as Property | undefined;
  const narrative = explainPricing(cma, cma.strategies.moderate, candidates as Property[], lookup);
  // Omitted costs fall back to the scenario defaults; an explicit undefined would override them.
  const costs = Object.fromEntries(Object.entries(input.costs).filter(([, value]) => value !== undefined));
  const net = simulatePricing(cma, cma.strategies.moderate, costs);
  const positions: PricingPosition[] = ['conservative', 'moderate', 'aggressive'];
  const span = Math.max(1, cma.high - cma.low);
  const pad = span * 0.25;
  const axisLow = cma.low - pad;
  const axisSpan = span + pad * 2;
  const at = (value: number) => `${(((value - axisLow) / axisSpan) * 100).toFixed(2)}%`;
  const dots = cma.comps
    .map(comp => {
      const sale = lookup(comp.propertyId);
      return `<span class="dot" style="left:${at(comp.adjustedPrice)}" title="${e(sale?.address)} · ${usd(comp.adjustedPrice)}"></span>`;
    })
    .join('');
  const compRows = [...cma.comps]
    .sort((a, b) => b.weight - a.weight)
    .map(comp => {
      const sale = lookup(comp.propertyId);
      const waterfall = comp.adjustments
        .filter(adjustment => adjustment.amount !== 0)
        .map(
          adjustment =>
            `<tr><td>${e(adjustment.factor)}</td><td class="num ${adjustment.amount < 0 ? 'neg' : 'pos'}">${adjustment.amount < 0 ? '−' : '+'}${usd(Math.abs(adjustment.amount))}</td><td class="why">${e(adjustment.explanation)}</td></tr>`,
        )
        .join('');
      return `<article class="comp">
  <header><div><h3>${e(sale?.address ?? comp.propertyId)}</h3><p>Sold ${sale?.soldAt ? e(longDate(sale.soldAt)) : 'date missing'} · ${comp.distanceMiles.toFixed(2)} mi · ${sale ? `${sale.beds} bd · ${sale.baths} ba · ${sale.sqft.toLocaleString('en-US')} sq ft` : ''}</p></div><div class="weight">${(comp.weight * 100).toFixed(1)}%<small>weight</small></div></header>
  <table class="waterfall"><tbody>
    <tr class="base"><td>Sale price</td><td class="num">${sale?.soldPrice !== undefined ? usd(sale.soldPrice) : 'Closing price missing'}</td><td></td></tr>
    ${waterfall || '<tr><td colspan="3" class="why">No adjustments: matches the subject on every modeled feature.</td></tr>'}
    <tr class="total"><td>Adjusted value</td><td class="num">${usd(comp.adjustedPrice)}</td><td class="why">${comp.warnings.map(e).join(' ')}</td></tr>
  </tbody></table>
</article>`;
    })
    .join('');
  const excludedSales = cma.excluded.filter(item => lookup(item.propertyId)?.status === 'sold');
  const excluded = excludedSales.length
    ? `<section class="block"><h2>Sales considered and set aside</h2><table class="plain"><thead><tr><th scope="col">Property</th><th scope="col">Reason</th></tr></thead><tbody>${excludedSales
        .map(
          item =>
            `<tr><td>${e(lookup(item.propertyId)?.address ?? item.propertyId)}</td><td>${e(item.reason)}</td></tr>`,
        )
        .join('')}</tbody></table></section>`
    : '';
  const assumptions = Object.entries(cma.assumptions)
    .map(([key, value]) => {
      const [label, format] = assumptionLabels[key] ?? [key, (v: number) => String(v)];
      return `<div><dt>${e(label)}</dt><dd>${e(format(Number(value)))}</dd></div>`;
    })
    .join('');
  const status = record.approvedAt
    ? `<span class="status ok">Reviewed ${e(longDate(record.approvedAt))}</span>`
    : '<span class="status draft">Draft · professional review required</span>';
  const watermark = input.synthetic
    ? '<p class="notice"><strong>FICTIONAL DEMONSTRATION DATA</strong> — This report contains synthetic properties and sales. It must not be relied on for a real transaction.</p>'
    : '';
  const legacy = cma.inputSnapshot
    ? '<p class="fine">Subject and comparable facts are frozen with this calculation. Export permission is evaluated against current source rights.</p>'
    : '<p class="notice">LEGACY RECORD — frozen raw inputs are unavailable. Subject and sale facts use current records and require review; this legacy report is not a fully reproducible historical export.</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(record.name)} · Ascent</title>
<style>
:root{--ink:#1f3a31;--muted:#5a6b60;--green:#2b5543;--pale:#eef3e9;--line:#dfe6dc;--peach:#c9784f}
*{box-sizing:border-box}body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:var(--ink);background:#f7f8f3}
main{max-width:980px;margin:0 auto;padding:40px 28px 60px}
h1,h2,h3,p{margin:0}h1{font-size:34px;line-height:1.15;letter-spacing:-.8px;font-weight:650}h2{font-size:20px;letter-spacing:-.3px;margin-bottom:14px}h3{font-size:15px}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-bottom:18px;border-bottom:2px solid var(--green);margin-bottom:28px}
.brand{font-weight:800;letter-spacing:3px;font-size:13px;color:var(--green)}.brand span{color:var(--muted);font-weight:600;letter-spacing:1px}
.status{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px}.status.ok{background:#e5f0df;color:#2f6b3f}.status.draft{background:#fbefe5;color:#865532}
.facts{color:var(--muted);margin-top:8px}.meta{color:var(--muted);font-size:12px;margin-top:6px}
.notice{background:#fff4d2;border:1px solid #e6cc79;padding:12px 16px;border-radius:10px;margin:18px 0;font-size:13px}
.block{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px 26px;margin-top:22px;break-inside:avoid}
.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:26px;align-items:center}
.estimate small{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700}.estimate strong{display:block;font-size:44px;letter-spacing:-1.5px;line-height:1.1;margin:6px 0}
.positions{display:grid;gap:10px}.position{border:1px solid var(--line);border-radius:12px;padding:12px 14px}.position.moderate{border-color:var(--green);box-shadow:0 0 0 1px var(--green);background:#f6faf3}
.position b{display:block;text-transform:capitalize;color:var(--green);font-size:13px}.position span{font-size:13px;color:#3f5446}
.range{position:relative;height:56px;margin:22px 4px 6px}.range .track{position:absolute;left:0;right:0;top:26px;height:6px;border-radius:9px;background:#e7ece2}
.range .band{position:absolute;top:24px;height:10px;border-radius:9px;background:#c9d8bf}.range .dot{position:absolute;top:22px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;border:3px solid var(--green)}
.range .est{position:absolute;top:8px;width:2px;height:42px;background:var(--peach)}.range .est i{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font:700 11px/1 sans-serif;font-style:normal;color:var(--peach);white-space:nowrap}
.range-labels{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
.read h2{margin-bottom:6px}.read .headline{font-size:18px;font-weight:600;margin-bottom:12px}.read ul{margin:0;padding-left:18px;display:grid;gap:6px;color:#3f5446}
.net{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}.net td{padding:9px 4px;border-bottom:1px solid var(--line)}.net td:last-child{text-align:right}.net tr.total td{font-weight:700;border-bottom:0;font-size:17px}
.comp{border-top:1px solid var(--line);padding:16px 0}.comp:first-of-type{border-top:0;padding-top:0}.comp header{display:flex;justify-content:space-between;gap:14px}.comp header p{color:var(--muted);font-size:12px}
.weight{text-align:right;font-weight:700;font-size:18px}.weight small{display:block;font-size:11px;color:var(--muted);font-weight:500}
.waterfall,.plain{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}.waterfall td,.plain td,.plain th{padding:7px 8px;border-bottom:1px solid #eef1ea;vertical-align:top;text-align:left}
.waterfall .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600;width:130px}.neg{color:#9a3420}.pos{color:#2f6b3f}.why{color:var(--muted);font-size:12px}
.waterfall tr.base td{font-weight:600}.waterfall tr.total td{border-top:2px solid var(--green);font-weight:700;border-bottom:0}
dl{display:grid;grid-template-columns:repeat(2,1fr);gap:10px 24px;margin:0}dt{font-size:12px;color:var(--muted)}dd{margin:0;font-weight:600}
.hash{overflow-wrap:anywhere;font:12px ui-monospace,monospace;color:var(--muted)}.fine{font-size:12px;color:var(--muted)}
.source{padding:10px 0;border-top:1px solid #eef1ea;font-size:13px}.source:first-of-type{border-top:0}
footer{margin-top:28px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
.print-hint{background:var(--pale);border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:20px}
body.presentation main{max-width:none;padding:0}body.presentation .print-hint,body.presentation footer{display:none}
body.presentation .slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:6vh 8vw;scroll-snap-align:start;border:0;border-radius:0;margin:0;background:#fff}
body.presentation .slide:nth-child(even){background:#f4f7f0}body.presentation{scroll-snap-type:y mandatory;font-size:18px}body.presentation h1{font-size:52px}body.presentation h2{font-size:30px}
body.presentation .estimate strong{font-size:64px}body.presentation .read .headline{font-size:26px}
@media (max-width:720px){.hero{grid-template-columns:1fr}dl{grid-template-columns:1fr}h1{font-size:28px}}
@media print{body{background:#fff;font-size:11.5px}main{padding:0}.print-hint{display:none}.block{border:0;padding:12px 0;border-top:1px solid var(--line);border-radius:0}h1{font-size:26px}.estimate strong{font-size:32px}@page{size:A4;margin:14mm}.comp{break-inside:avoid}body.presentation .slide{min-height:auto;page-break-after:always}}
</style></head><body class="${input.presentation ? 'presentation' : 'report'}"><main>
<p class="print-hint">Use your browser’s Print → Save as PDF for a client copy.${input.presentation ? '' : ' Add <code>&amp;view=presentation</code> to the address for a full-screen listing presentation.'}</p>
<section class="slide"><div class="top"><div class="brand">ASCENT <span>/ ${e(input.organization)}</span></div>${status}</div>
<h1>${e(property.address)}</h1>
<p class="facts">${e(property.city)}, ${e(property.state)} ${e(property.zip)} · ${property.beds} beds · ${property.baths} baths · ${property.sqft.toLocaleString('en-US')} sq ft${property.yearBuilt ? ` · built ${e(property.yearBuilt)}` : ''}</p>
<p class="meta">${e(record.name)} · Evidence as of ${e(longDate(cma.asOf))} · Prepared by ${e(input.preparedBy)} · Generated ${e(longDate(input.generatedAt))}</p>
${watermark}
<div class="block hero"><div class="estimate"><small>Comparable-supported estimate</small><strong>${usd(cma.estimate)}</strong><p class="fine">Adjusted range ${usd(cma.low)} – ${usd(cma.high)} from ${cma.comps.length} closed sale${cma.comps.length === 1 ? '' : 's'}.</p>
<div class="range" aria-hidden="true"><span class="track"></span><span class="band" style="left:${at(cma.low)};width:${(((cma.high - cma.low) / axisSpan) * 100).toFixed(2)}%"></span>${dots}<span class="est" style="left:${at(cma.estimate)}"><i>Estimate</i></span></div>
<div class="range-labels"><span>${usd(cma.low)}</span><span>${usd(cma.high)}</span></div></div>
<div class="positions">${positions.map(key => `<div class="position ${key}"><b>${key}</b><span>${e(narrative.tradeoffs[key])}</span></div>`).join('')}</div></div></section>
<section class="block read slide"><h2>How the evidence reads</h2><p class="headline">${e(narrative.headline)}</p><ul>${narrative.points.map(point => `<li>${e(point)}</li>`).join('')}</ul></section>
<section class="block slide"><h2>Seller net at the moderate position</h2><table class="net"><tbody>
<tr><td>List price</td><td>${usd(net.listPrice)}</td></tr>
<tr><td>Commission (${net.costAssumptions.commissionPercent}%, negotiable)</td><td>−${usd((net.listPrice * net.costAssumptions.commissionPercent) / 100)}</td></tr>
<tr><td>Other closing costs (${net.costAssumptions.closingPercent}%)</td><td>−${usd((net.listPrice * net.costAssumptions.closingPercent) / 100)}</td></tr>
${net.costAssumptions.concessions ? `<tr><td>Seller concessions</td><td>−${usd(net.costAssumptions.concessions)}</td></tr>` : ''}
${input.payoff ? `<tr><td>Mortgage payoff (entered)</td><td>−${usd(input.payoff)}</td></tr>` : ''}
<tr class="total"><td>Illustrative proceeds</td><td>${usd(net.estimatedNet - input.payoff)}</td></tr></tbody></table>
<p class="fine">Assumes a sale at list price. Before taxes, liens, repairs and prorations. Fees are editable assumptions, not a prescribed commission.</p></section>
<section class="block slide"><h2>Comparable sales, adjustment by adjustment</h2>${compRows}</section>
${excluded}
<section class="block"><h2>Assumptions and reproducibility</h2>${legacy}<dl>${assumptions}</dl>
<p class="fine" style="margin-top:14px">Algorithm ${e(cma.version)} · Weights favor closer, more recent, more similar sales.</p><p class="hash">Calculation hash: ${e(cma.calculationHash)}</p></section>
<section class="block"><h2>Limits of this analysis</h2><ul class="fine">${[
    ...cma.warnings,
    ...(record.providerContext?.normalizationWarnings || []),
    ...(record.providerContext?.incomplete || []).map(
      entry => `Excluded incomplete provider record ${entry.id}: ${entry.missingFields.join(', ')}`,
    ),
  ]
    .map(warning => `<li>${e(warning)}</li>`)
    .join('')}</ul></section>
<section class="block"><h2>Evidence provenance and permitted use</h2>${input.sources
    .map(
      source =>
        `<div class="source"><strong>${e(source.label)}</strong> (${e(source.kind)})<br><span class="fine">Observed ${e(source.observedAt)} · ${e(source.license)}</span></div>`,
    )
    .join('')}</section>
<footer>Prepared by ${e(input.preparedBy)} with Ascent. This is a pricing analysis, not an appraisal. Verify condition, concessions, current licensed records and contractual facts. No communication has been sent.</footer>
</main></body></html>`;
}
