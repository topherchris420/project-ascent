'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { CmaResult, Source } from '@/lib/types';
import { money } from './format';

export function PricingQuestions({
  result,
  previous,
  sources,
}: {
  result: CmaResult;
  previous?: CmaResult;
  sources: Source[];
}) {
  const [question, setQuestion] = useState('weight');
  const top = [...result.comps].sort((a, b) => b.weight - a.weight)[0];
  const sale = result.inputSnapshot?.candidates.find(p => p.id === top?.propertyId);
  const fictional = result.sourceIds.some(id => sources.find(s => s.id === id)?.kind === 'synthetic');
  const answers: Record<string, { label: string; type: string; text: string; refs: string[] }> = {
    weight: {
      label: 'Why does this sale carry the most weight?',
      type: 'Deterministic calculation',
      text: top
        ? `${sale?.address || top.propertyId} carries ${(top.weight * 100).toFixed(1)}% of this estimate. Its ${top.distanceMiles.toFixed(2)}-mile distance, ${Math.round(top.ageDays)}-day sale age and living-area similarity enter the inverse-weight formula shown in the comparable inspector. Weight indicates model influence, not verified sale quality.`
        : 'No eligible sale is available.',
      refs: [top?.propertyId || '', result.calculationHash],
    },
    changed: {
      label: 'What changed in this decision?',
      type: 'Deterministic comparison',
      text: previous
        ? `The current estimate is ${money(result.estimate)}, compared with ${money(previous.estimate)} in the frozen comparison. The difference is ${money(result.estimate - previous.estimate)}. The arithmetic panel separates adjusted-value effects from weight and eligibility effects. This is not proof of a market move.`
        : 'No previous authorized calculation is selected. Preserve a decision, then compare it with new evidence.',
      refs: [previous?.calculationHash || '', result.calculationHash],
    },
    missing: {
      label: 'What would help narrow the uncertainty?',
      type: 'Evidence limits and analyst review',
      text: 'Verify condition and renovations, sale concessions, source freshness and comparable relevance. Obtain additional authorized closed sales and complete competing inventory. More evidence may widen or narrow the range; this model cannot promise which. Permits, title, lot features and unobserved condition are not priced by the calculation.',
      refs: [...result.sourceIds, result.calculationHash],
    },
    draft: {
      label: 'Draft the seller explanation',
      type: 'Editable communication draft',
      text: `The current evidence supports a weighted estimate of ${money(result.estimate)}, with adjusted sales spanning ${money(result.low)}–${money(result.high)}. We used ${result.comps.length} closed sales under stated adjustment assumptions. The range is observed evidence, not a confidence interval or a promised outcome. ${fictional ? 'These are fictional practice records and must not be used for a real transaction.' : 'Source facts and condition still require professional verification.'} I suggest reviewing the three asking-price positions and the unverified factors together.`,
      refs: [result.calculationHash, ...result.sourceIds],
    },
  };
  const a = answers[question];
  return (
    <section className="panel pricing-questions" aria-label="Ask Ascent about this calculation">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ASK ASCENT · CURRENT CALCULATION</span>
          <h2>Get the explanation while it’s in front of you.</h2>
        </div>
        <Sparkles size={20} aria-hidden="true" />
      </div>
      <p className="fine">
        Evidence mode · answers update with the draft on screen · no external model or client information sent
      </p>
      <div className="pricing-question-options" role="group" aria-label="Pricing questions">
        {Object.entries(answers).map(([id, answer]) => (
          <button className="button small" key={id} aria-pressed={question === id} onClick={() => setQuestion(id)}>
            {answer.label}
          </button>
        ))}
      </div>
      <div className="pricing-answer" aria-live="polite">
        <strong>{a.type}</strong>
        <p>{a.text}</p>
        <details>
          <summary>Check the calculation references</summary>
          <ul>
            {a.refs.filter(Boolean).map((r, i) => (
              <li key={`${r}-${i}`}>
                <a
                  href={
                    r === previous?.calculationHash && r !== result.calculationHash
                      ? `#decision-delta-${r}`
                      : `#pricing-evidence-${result.calculationHash}`
                  }
                >
                  <code>{r}</code>
                </a>
                {r === result.calculationHash
                  ? ' · current draft calculation'
                  : r === previous?.calculationHash
                    ? ' · comparison calculation'
                    : ` · ${sources.find(s => s.id === r)?.label || result.inputSnapshot?.candidates.find(p => p.id === r)?.address || 'archived input'}`}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
