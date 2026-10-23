import { escapeHtml as e } from './report-html';
import { contingencyLabels, financingLabels, type OfferComparison, type OfferLab } from './offer-lab';
import type { AgentPacket } from './agent-packet';
import type { OsBrief, OsItem } from './homeowner-os';

/** Printable, self-contained pages generated in the browser. Nothing is uploaded; the page holds what it shows. */
const page = (title: string, body: string, footer: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>
body{font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2d27;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:1px solid #d6ddd2;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #d6ddd2;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1f4ee}.note{font-size:13px;color:#4c5b52}.kind{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5f6d65}
@media print{body{margin:0}a{color:inherit}}
</style></head><body>${body}<p class="note">${e(footer)}</p></body></html>`;
const list = (items: string[]) => (items.length ? `<ul>${items.map(item => `<li>${e(item)}</li>`).join('')}</ul>` : '');
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export function offerComparisonHtml(lab: OfferLab, comparison: OfferComparison, address: string, printedAt: Date) {
  const { analyses } = comparison;
  const keys = [...new Set(analyses.flatMap(analysis => analysis.figures.map(item => item.key)))];
  const labelFor = (key: string) =>
    analyses.flatMap(analysis => analysis.figures).find(item => item.key === key)?.label ?? key;
  const header = `<tr><th scope="col">Term or figure</th>${analyses.map(a => `<th scope="col">${e(a.label)}<br><span class="kind">${a.basis === 'what-if' ? 'what-if' : 'written offer'}</span></th>`).join('')}</tr>`;
  const figureRows = keys
    .map(key => {
      const cells = analyses.map(analysis => {
        const item = analysis.figures.find(figure => figure.key === key);
        return item
          ? `<td>${e(item.text)}<br><span class="kind">${e(item.kind === 'calculation' ? 'calculated' : item.kind)}</span></td>`
          : '<td>—</td>';
      });
      return `<tr><th scope="row">${e(labelFor(key))}</th>${cells.join('')}</tr>`;
    })
    .join('');
  const termRows = [
    `<tr><th scope="row">Financing</th>${lab.offers.map(offer => `<td>${e(financingLabels[offer.financing])}</td>`).join('')}</tr>`,
    ...Object.entries(contingencyLabels).map(
      ([key, label]) =>
        `<tr><th scope="row">${e(label)} contingency</th>${analyses
          .map(analysis => {
            const term = analysis.contingencies.find(item => item.key === key)!;
            return `<td>${e(term.status)}${term.days !== null && term.status === 'included' ? `, ${term.days} days` : ''}</td>`;
          })
          .join('')}</tr>`,
    ),
  ].join('');
  const deadlines = analyses
    .map(
      analysis =>
        `<h3>${e(analysis.label)}</h3>${list(analysis.deadlines.map(item => `${item.label}: ${item.date ?? 'not entered'} (${item.note})`))}`,
    )
    .join('');
  const body = `<h1>Offer Comparison Brief</h1><p>${e(address)} · ${comparison.side === 'seller' ? 'Offers received' : 'Offers you might make'} · printed ${e(printedAt.toISOString().slice(0, 10))}</p>
<p class="note">Private: offer terms and your assumptions. Calculation ${e(comparison.calculationHash)}.</p>
<h2>What the arithmetic says</h2>${list(comparison.explanation)}
<h2>Side by side</h2><table><thead>${header}</thead><tbody>${figureRows}${termRows}</tbody></table>
<h2>Differences from ${e(analyses.find(item => item.offerId === comparison.referenceOfferId)?.label ?? 'the reference offer')}</h2>${list(
    comparison.differences.flatMap(item => [
      ...(item.headlineDifference !== null
        ? [`${item.label}: ${item.headlineDifference < 0 ? '−' : '+'}${usd(Math.abs(item.headlineDifference))}`]
        : []),
      ...item.termDifferences.map(text => `${item.label}: ${text}`),
    ]),
  )}
<h2>Deadlines</h2>${deadlines}
<h2>Sensitivity</h2>${comparison.sensitivity
    .map(
      item =>
        `<h3>${e(item.label)}</h3>${list(item.rows.map(row => `${row.scenario}: ${row.value === null ? 'not calculable' : usd(row.value)}${row.change !== null ? ` (${row.change < 0 ? '−' : '+'}${usd(Math.abs(row.change))})` : ''}`))}`,
    )
    .join('')}
<h2>Compared with the estimate</h2><p>${e(comparison.estimate.text)}</p>${list(comparison.estimate.rows.map(row => `${row.label}: ${row.difference === null ? 'no price entered' : `${row.difference < 0 ? '−' : '+'}${usd(Math.abs(row.difference))} against the estimate`}`))}
<h2>Not entered</h2>${comparison.missing.length ? list(comparison.missing) : '<p>Every term used here was entered.</p>'}
<h2>Notes</h2>${list(analyses.flatMap(analysis => analysis.notes.map(note => `${analysis.label}: ${note}`)))}
<h2>Limits</h2>${list([...comparison.boundaries])}`;
  return page(
    `Offer Comparison Brief · ${address}`,
    body,
    'Ascent · deterministic arithmetic · not advice, an appraisal or a legal review',
  );
}

export function osBriefHtml(os: OsBrief, printedAt: Date) {
  const items = (rows: OsItem[]) => list(rows.map(row => row.text));
  const body = `<h1>Home Decision Brief</h1><p>${e(os.property.address)} · ${e(os.property.marketLabel)} · printed ${e(printedAt.toISOString().slice(0, 10))}</p>
<p><strong>${e(os.value.label)}.</strong> ${e(os.value.answer)}</p>
<h2>What we know</h2>${items(os.know)}
<h2>How we know it</h2>${items(os.how)}
<h2>What is missing</h2>${items(os.missing)}
<h2>What to do next</h2>${items(os.next)}
<h2>Changes since your last saved version</h2>${items(os.changes)}
<h2>Permits and assessments</h2>${os.records.length ? items(os.records) : '<p>None in the records checked.</p>'}
<h2>Your finances</h2>${items(os.finance)}
<h2>Offers</h2>${items(os.offers)}
<h2>Milestones</h2>${items(os.milestones)}
<h2>Documents commonly needed now</h2>${list(os.documents.map(item => `${item.item}: ${item.present ? 'a file is in your room’s matching section' : 'not in your room'}`))}<p class="note">A common list, not a legal requirement or a complete one.</p>
<h2>Questions for a licensed professional</h2>${items(os.questions)}
<h2>Limits</h2>${list(os.limits)}`;
  return page(`Home Decision Brief · ${os.property.address}`, body, `Ascent · ${os.version} · checksum ${os.checksum}`);
}

export function agentPacketHtml(packet: AgentPacket) {
  const money = (value: number | null) => (value === null ? 'withheld or not recorded' : usd(value));
  const parts: string[] = [];
  if (packet.estimate)
    parts.push(
      `<h2>Estimate</h2><p><strong>${e(packet.estimate.label)}.</strong> ${e(packet.estimate.answer)}</p>${list(packet.estimate.reasons)}
<h3>Leading recorded sales</h3><table><thead><tr><th scope="col">Address</th><th scope="col">Recorded price</th><th scope="col">Adjusted</th><th scope="col">Weight</th><th scope="col">Distance</th></tr></thead><tbody>${packet.estimate.comparables
        .map(
          item =>
            `<tr><td>${e(item.address)}${item.enteredByHomeowner ? ' (entered by the homeowner)' : ''}</td><td>${e(money(item.soldPrice))}</td><td>${e(money(item.adjustedPrice))}</td><td>${item.weightPercent === null ? '—' : `${e(item.weightPercent)}%`}</td><td>${e(item.distanceMiles)} mi</td></tr>`,
        )
        .join('')}</tbody></table>
<h3>Sources</h3>${list(packet.estimate.sources.map(item => `${item.label}, ${item.license}, observed ${item.observedAt.slice(0, 10)}`))}
${packet.estimate.missingFacts.length ? `<h3>Facts the records do not hold</h3>${list(packet.estimate.missingFacts)}` : ''}`,
    );
  if (packet.records)
    parts.push(
      `<h2>Public-record timeline</h2><table><thead><tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">Source</th></tr></thead><tbody>${packet.records.events
        .map(
          item =>
            `<tr><td>${e(item.dateLabel)}: ${e(item.date ?? 'not recorded')}</td><td>${e(item.title)}${item.values.length ? `<br><span class="note">${e(item.values.map(value => `${value.label}: ${value.value}`).join(' · '))}</span>` : ''}${item.conflict ? `<br><strong>${e(item.conflict)}</strong>` : ''}</td><td>${e(item.sources.join(', '))}</td></tr>`,
        )
        .join('')}</tbody></table><h3>What the timeline cannot show</h3>${list(packet.records.gaps)}`,
    );
  if (packet.questions) parts.push(`<h2>Questions</h2>${list(packet.questions)}`);
  if (packet.offers)
    parts.push(
      `<h2>Offers</h2><p class="note">Private: offer terms the homeowner chose to include. Calculation ${e(packet.offers.comparison.calculationHash)}.</p>${list(packet.offers.comparison.explanation)}${list(packet.offers.comparison.analyses.map(item => `${item.label}: ${item.headline ? `${item.headline.label} ${item.headline.text}` : 'not calculable from the terms entered'}`))}`,
    );
  if (packet.finance)
    parts.push(`<h2>Finances</h2><p class="note">Private: included by the homeowner.</p>${list(packet.finance)}`);
  if (packet.transaction)
    parts.push(
      `<h2>Transaction</h2><p>Stage: ${e(packet.transaction.stage.replace('-', ' '))}</p>${list([
        ...packet.transaction.milestones.map(
          item => `Milestone: ${item.title} (${item.status}${item.due ? `, due ${item.due}` : ''})`,
        ),
        ...packet.transaction.deadlines.map(item => `Deadline: ${item.label}, ${item.date}`),
        ...packet.transaction.openTasks.map(item => `Open task: ${item.title}${item.due ? `, due ${item.due}` : ''}`),
        ...packet.transaction.inspection.map(item => `Inspection: ${item.item} (${item.severity}, ${item.status})`),
      ])}`,
    );
  const body = `<h1>Home packet for my agent</h1><p>${e(packet.property.address)} · ${e(packet.property.market)} · prepared ${e(packet.createdAt.slice(0, 10))}</p>
<p class="note">${e(packet.preparedBy)}</p>${parts.join('\n')}
<h2>Not included</h2>${list(packet.excluded)}<h2>Limits</h2>${list(packet.limits)}`;
  return page(
    `Home packet · ${packet.property.address}`,
    body,
    `Ascent · ${packet.version} · checksum ${packet.checksum}`,
  );
}
