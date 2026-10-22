'use client';
import type { ReactNode } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, CircleSlash } from 'lucide-react';
import type { BriefFigure, HomeDecisionBrief, Trace } from '@/lib/home-decision-brief';
import { date } from './format';
import '@/app/home-brief.css';

const traceKinds: Record<Trace['kind'], string> = {
  record: 'Record',
  assumption: 'Assumption',
  calculation: 'Calculation',
};
const shortRef = (ref: string) => (ref.length > 22 ? `${ref.slice(0, 19)}…` : ref);
/** "Monthly gross rent ($)" → "monthly gross rent" inside a sentence. */
const inline = (label: string) => label.replace(/\s*\([^)]*\)$/, '').replace(/^./, c => c.toLowerCase());
const verdictIcons = { supported: CircleCheck, limited: CircleAlert, declined: CircleSlash };
const affectsLabel = { value: 'Value', reliability: 'Reliability', finances: 'Finances' } as const;
const priorityLabel = { 1: 'First', 2: 'Soon', 3: 'If relevant' } as const;
export const briefQuestions = [
  ['brief-value', 'What does the evidence suggest about value?', 'Value'],
  ['brief-sales', 'Which sales support it?', 'Sales'],
  ['brief-reliability', 'How reliable and current is the evidence?', 'Reliability'],
  ['brief-missing', 'Which facts about your home are missing?', 'Missing facts'],
  ['brief-choices', 'What would each choice mean financially?', 'Choices'],
  ['brief-drivers', 'Which assumptions move each outcome most?', 'What moves it'],
  ['brief-next', 'What should you get before deciding?', 'Before deciding'],
] as const;

function Traces({ traces }: { traces: Trace[] }) {
  return (
    <ul className="brief-traces">
      {traces.map((trace, index) => (
        <li key={`${trace.kind}-${index}`} data-kind={trace.kind}>
          <span className="brief-trace-kind">{traceKinds[trace.kind]}</span>
          <span>
            {trace.text}
            {trace.ref && trace.kind !== 'record' ? (
              <>
                {' '}
                <code title={trace.ref}>{shortRef(trace.ref)}</code>
              </>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Figure({ figure, lead }: { figure: BriefFigure; lead?: boolean }) {
  return (
    <div className={`brief-figure${lead ? ' lead' : ''}`}>
      <span className="brief-figure-label">{figure.label}</span>
      <strong>{figure.text}</strong>
      <Traces traces={figure.traces} />
    </div>
  );
}

function Question({ index, children }: { index: number; children: ReactNode }) {
  const [id, title] = briefQuestions[index];
  return (
    <li id={id} className="brief-question">
      <h3>
        <span className="brief-number" aria-hidden="true">
          {index + 1}
        </span>
        {title}
      </h3>
      {children}
    </li>
  );
}

/** The homeowner's first destination after choosing a property: seven traced answers, no recommendation. */
export function HomeDecisionBriefPanel({ brief }: { brief: HomeDecisionBrief }) {
  const { value, comparables, reliability, financial, influences } = brief;
  const VerdictIcon = verdictIcons[value.verdict];
  const computed = financial.choices.filter(choice => choice.available);
  const pending = financial.choices.filter(choice => !choice.available);
  return (
    <section id="home-decision-brief" className="panel home-brief" aria-labelledby="home-brief-title">
      <div className="brief-heading">
        <div>
          <span className="eyebrow">START HERE · {brief.property.marketLabel.toUpperCase()}</span>
          <h2 id="home-brief-title">Your Home Decision Brief</h2>
        </div>
        <p className="brief-verdict" data-verdict={value.verdict}>
          <VerdictIcon size={18} aria-hidden="true" />
          <span>
            <span className="sr-only">Valuation status: </span>
            {value.label}
          </span>
        </p>
      </div>
      <p className="brief-lede">
        Seven questions, answered from public records and your own entries. Each figure says where it comes from: a{' '}
        <span className="brief-key" data-kind="record">
          Record
        </span>{' '}
        is a recorded or entered fact, an{' '}
        <span className="brief-key" data-kind="assumption">
          Assumption
        </span>{' '}
        is a setting you or a published study chose, and a{' '}
        <span className="brief-key" data-kind="calculation">
          Calculation
        </span>{' '}
        is arithmetic you can reproduce. Nothing here is a recommendation.
      </p>
      <nav className="brief-jump" aria-label="Brief questions">
        {briefQuestions.map(([id, , short], index) => (
          <a key={id} href={`#${id}`}>
            <span aria-hidden="true">{index + 1}</span>
            {short}
          </a>
        ))}
      </nav>
      <ol className="brief-questions">
        <Question index={0}>
          <p className="brief-answer">{value.answer}</p>
          {(value.estimate || value.range || value.calibrated) && (
            <div className="brief-figures">
              {value.estimate && <Figure figure={value.estimate} lead />}
              {value.calibrated && <Figure figure={value.calibrated} />}
              {value.range && <Figure figure={value.range} />}
            </div>
          )}
          {value.reasons.length > 0 && (
            <div className="brief-reasons">
              <h4>{value.verdict === 'declined' ? 'Why no value is stated' : 'Why this needs care'}</h4>
              <ul>
                {value.reasons.map(reason => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          {value.study && (
            <div className="brief-study">
              <p>{value.study.text}</p>
              <Traces traces={value.study.traces} />
            </div>
          )}
        </Question>
        <Question index={1}>
          <p className="brief-answer">{comparables.answer}</p>
          {comparables.leading.length > 0 && (
            <ol className="brief-sales">
              {comparables.leading.map(sale => (
                <li key={sale.id}>
                  <div className="brief-sale-head">
                    <strong>{sale.address}</strong>
                    <span>{sale.weightPercent}% of the weight</span>
                  </div>
                  <div className="brief-weight" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, sale.weightPercent)}%` }} />
                  </div>
                  <div className="brief-sale-figures">
                    {sale.soldPrice && <Figure figure={sale.soldPrice} />}
                    <Figure figure={sale.adjustedPrice} />
                  </div>
                  <p className="fine">
                    {sale.distanceMiles} miles away · closed {sale.ageDays} days before the data date
                    {sale.largestAdjustment ? ` · largest adjustment: ${sale.largestAdjustment}` : ''}
                    {sale.entered ? ' · entered by you, unverified' : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {comparables.excludedByYou.length > 0 && (
            <div className="brief-reasons">
              <h4>Sales you excluded</h4>
              <ul>
                {comparables.excludedByYou.map(item => (
                  <li key={item.address}>
                    {item.address}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {comparables.ownHistory && <p className="fine">{comparables.ownHistory}</p>}
          <a className="brief-link" href="#studio-evidence">
            Inspect every sale and its adjustments <ArrowRight size={14} aria-hidden="true" />
          </a>
        </Question>
        <Question index={2}>
          <p className="brief-answer">{reliability.answer}</p>
          {reliability.checks.length > 0 && (
            <ul className="brief-checks">
              {reliability.checks.map(check => (
                <li key={check.id} data-status={check.status}>
                  <span className="brief-check-status">
                    {check.status === 'pass' ? 'Met' : check.status === 'review' ? 'Not met' : 'Blocked'}
                  </span>
                  <span>
                    <strong>{check.label}</strong>
                    <small>{check.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {reliability.tierReference && <p className="fine">{reliability.tierReference}</p>}
          <details className="brief-details">
            <summary>Sources, licenses and collection dates</summary>
            <ul>
              {reliability.sources.map(source => (
                <li key={source.label}>
                  <strong>{source.label}</strong> · {source.kind === 'synthetic' ? 'fictional' : source.kind} · observed{' '}
                  {date(source.observedAt)}
                  <br />
                  <span className="fine">{source.license}</span>
                </li>
              ))}
            </ul>
            {(reliability.collected.sales || reliability.collected.parcels) && (
              <p className="fine">
                {reliability.collected.parcels
                  ? `Property records collected ${date(reliability.collected.parcels)}. `
                  : ''}
                {reliability.collected.sales ? `Sales collected ${date(reliability.collected.sales)}. ` : ''}
                Collection time is separate from the date a sale was recorded.
              </p>
            )}
          </details>
        </Question>
        <Question index={3}>
          <p className="brief-answer">
            The records behind this brief do not include the facts below. Ascent does not guess them, and none is filled
            in for you.
          </p>
          <ul className="brief-missing">
            {brief.missingFacts.map(item => (
              <li key={item.fact}>
                <strong>{item.fact}</strong>
                <span>{item.why}</span>
                <small>How to get it: {item.obtain}</small>
              </li>
            ))}
          </ul>
        </Question>
        <Question index={4}>
          <p className="brief-answer">{financial.answer}</p>
          {financial.saleNow && (
            <div className="brief-figures">
              <Figure figure={financial.saleNow.price} />
              <Figure figure={financial.saleNow.beforePayoff} />
              {financial.saleNow.afterPayoff && <Figure figure={financial.saleNow.afterPayoff} lead />}
            </div>
          )}
          {computed.length > 0 && (
            <ul className="brief-choices">
              {computed.map(choice => (
                <li key={choice.kind}>
                  <h4>{choice.label}</h4>
                  <dl>
                    {choice.figures.map(figure => (
                      <div key={figure.label}>
                        <dt>{figure.label}</dt>
                        <dd>{figure.text}</dd>
                        <dd className="brief-meaning">{figure.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
          {computed.length > 0 && financial.calculationHash && (
            <Traces
              traces={[
                { kind: 'assumption', text: 'Your entered costs, debt, rent, timeline and hypothetical changes' },
                {
                  kind: 'calculation',
                  text: `Homeowner finance engine over ${financial.horizonMonths} months; not ranked`,
                  ref: financial.calculationHash,
                },
              ]}
            />
          )}
          {pending.length > 0 && (
            <div className="brief-reasons">
              <h4>Choices that need more of your inputs</h4>
              <ul>
                {pending.map(choice => (
                  <li key={choice.kind}>
                    <strong>{choice.label}:</strong>{' '}
                    {choice.missing.length
                      ? `needs ${choice.missing.slice(0, 4).map(inline).join(', ')}${choice.missing.length > 4 ? ` and ${choice.missing.length - 4} more` : ''}.`
                      : 'needs its sale to fall within the comparison horizon.'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {financial.breakEvens.length > 0 && (
            <div className="brief-reasons">
              <h4>Break-even thresholds</h4>
              <ul>
                {financial.breakEvens.map(item => (
                  <li key={item.id}>
                    <strong>{item.label}:</strong> {item.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="brief-details">
            <summary>What these figures leave out</summary>
            <ul>
              {financial.exclusions.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
          <a className="brief-link" href="#homeowner-workbench">
            Add or edit your financial facts <ArrowRight size={14} aria-hidden="true" />
          </a>
        </Question>
        <Question index={5}>
          <p className="brief-answer">{influences.answer}</p>
          {(influences.valuation.length > 0 || influences.fragile.length > 0) && (
            <div className="brief-reasons">
              <h4>The estimate</h4>
              <ul>
                {influences.valuation.map(item => (
                  <li key={item.label}>{item.text}</li>
                ))}
                {influences.fragile.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {influences.financial.some(choice => choice.drivers.length) && (
            <div className="brief-reasons">
              <h4>Your financial choices</h4>
              <ul>
                {influences.financial
                  .filter(choice => choice.drivers.length)
                  .map(choice => (
                    <li key={choice.kind}>
                      <strong>{choice.label}:</strong> {choice.drivers.map(driver => driver.text).join(' ')}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {influences.settings.reference && (
            <div className="brief-reasons">
              <h4>Settings you changed</h4>
              {influences.settings.changes.length ? (
                <ul>
                  {influences.settings.changes.map(change => (
                    <li key={change.key}>
                      <strong>{change.label}:</strong> {change.current} instead of {change.reference}.
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None. Every setting matches {influences.settings.reference}.</p>
              )}
              {influences.settings.changes.length > 0 && (
                <p className="fine">Compared with {influences.settings.reference}. The recorded sales are unchanged.</p>
              )}
            </div>
          )}
          <p className="fine">
            Each assumption is changed by a disclosed step while everything else stays fixed. The steps are review
            checks, not forecasts or plausible ranges.
          </p>
          <a className="brief-link" href="#studio-assumptions">
            Challenge an assumption yourself <ArrowRight size={14} aria-hidden="true" />
          </a>
        </Question>
        <Question index={6}>
          <ol className="brief-next">
            {brief.nextSteps.map(step => (
              <li key={step.item}>
                <span className="brief-priority">{priorityLabel[step.priority]}</span>
                <span>
                  <strong>{step.item}</strong>
                  <small>{step.why}</small>
                  <span className="brief-tags">
                    {step.affects.map(item => (
                      <span key={item}>{affectsLabel[item]}</span>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Question>
      </ol>
      <div className="brief-limits">
        <h3>What this brief is not</h3>
        <ul>
          {brief.limits.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <details className="brief-details">
          <summary>References for reproducing this brief</summary>
          <dl className="brief-references">
            <div>
              <dt>Valuation</dt>
              <dd>
                {brief.references.valuationVersion ?? 'Not calculated'}{' '}
                {brief.references.valuationHash && <code>{brief.references.valuationHash}</code>}
              </dd>
            </div>
            <div>
              <dt>Finances</dt>
              <dd>
                {brief.references.financeVersion}{' '}
                {brief.references.financeHash ? <code>{brief.references.financeHash}</code> : 'inputs incomplete'}
              </dd>
            </div>
            <div>
              <dt>Published study</dt>
              <dd>
                {brief.references.studyReport ? <code>{brief.references.studyReport}</code> : 'None for this market'}
              </dd>
            </div>
            <div>
              <dt>Sales snapshot</dt>
              <dd>
                {brief.references.snapshot.salesSha256 ? (
                  <code>{brief.references.snapshot.salesSha256}</code>
                ) : (
                  'Bundled sample'
                )}
              </dd>
            </div>
            <div>
              <dt>Brief</dt>
              <dd>
                {brief.version} · {brief.policyVersion} · <code>{brief.checksum}</code>
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}
