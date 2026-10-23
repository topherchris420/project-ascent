'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download, Plus, Printer, Trash2 } from 'lucide-react';
import { ZodError } from 'zod';
import { downloadJson, openHtmlReport } from '@/lib/browser-export';
import {
  blankOffer,
  compareOfferLab,
  contingencyKeys,
  contingencyLabels,
  emptyOfferLab,
  financingLabels,
  financingTypes,
  MAX_OFFERS,
  OFFER_LAB_BOUNDARIES,
  offerLabRecord,
  offerLabSchema,
  type LabOffer,
  type LabSettings,
  type OfferComparison,
  type OfferLab,
  type ValueContext,
} from '@/lib/offer-lab';
import { offerComparisonHtml } from '@/lib/os-reports';
import { OfferTransfer } from './offer-transfer';
import { Kind, NumberField, OsPanel, readLocal, SelectField, TextField, writeLocal } from './shared';

export const offerLabKey = (propertyKey: string) => `ascent.offer-lab.v1:${propertyKey}`;
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const signed = (value: number) => `${value < 0 ? '−' : '+'}${usd(Math.abs(value))}`;
type Tri = 'included' | 'waived' | 'unknown';
const triOf = (included: boolean | null): Tri => (included === null ? 'unknown' : included ? 'included' : 'waived');

function OfferCard({
  offer,
  side,
  onChange,
  onRemove,
}: {
  offer: LabOffer;
  side: LabSettings['side'];
  onChange: (offer: LabOffer) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<LabOffer>) => onChange({ ...offer, ...patch });
  return (
    <details className="os-offer" open data-testid="offer-card">
      <summary>
        {offer.label}
        {offer.price !== null && <span> · {usd(offer.price)}</span>}
      </summary>
      <div className="os-grid">
        <TextField label="Name" value={offer.label} maxLength={60} onChange={label => set({ label })} />
        <SelectField
          label="These terms are"
          value={offer.basis}
          options={[
            { value: 'written-offer', label: 'Copied from a written offer' },
            { value: 'what-if', label: 'A what-if I am exploring' },
          ]}
          onChange={basis => set({ basis })}
        />
        <NumberField
          label={side === 'seller' ? 'Offered price ($)' : 'Offer price ($)'}
          value={offer.price}
          onChange={price => set({ price })}
        />
        <NumberField
          label="Escalation cap ($)"
          value={offer.escalationCap}
          onChange={escalationCap => set({ escalationCap })}
          hint="Leave blank if there is no escalation clause."
        />
        <NumberField
          label="Earnest money ($)"
          value={offer.earnestMoney}
          onChange={earnestMoney => set({ earnestMoney })}
        />
        <NumberField
          label="Earnest money due (days after acceptance)"
          value={offer.earnestDueDays}
          step="1"
          onChange={earnestDueDays => set({ earnestDueDays })}
        />
        <SelectField
          label="Financing"
          value={offer.financing}
          options={financingTypes.map(value => ({ value, label: financingLabels[value] }))}
          onChange={financing =>
            set({ financing, downPaymentPercent: financing === 'cash' ? null : offer.downPaymentPercent })
          }
        />
        {offer.financing !== 'cash' && (
          <>
            <NumberField
              label="Down payment (%)"
              value={offer.downPaymentPercent}
              onChange={downPaymentPercent => set({ downPaymentPercent })}
            />
            {side === 'buyer' && (
              <>
                <NumberField
                  label="Interest rate (%)"
                  value={offer.interestRate}
                  onChange={interestRate => set({ interestRate })}
                />
                <NumberField
                  label="Loan term (months)"
                  value={offer.loanTermMonths}
                  step="1"
                  onChange={loanTermMonths => set({ loanTermMonths })}
                />
              </>
            )}
          </>
        )}
        <NumberField
          label="Seller credit to the buyer ($)"
          value={offer.sellerCredit}
          onChange={sellerCredit => set({ sellerCredit })}
        />
        {side === 'seller' && (
          <NumberField
            label="Other costs the seller pays ($)"
            value={offer.sellerPaidCosts}
            onChange={sellerPaidCosts => set({ sellerPaidCosts })}
            hint="For example a home warranty or the buyer’s agent fee."
          />
        )}
        <NumberField
          label="Appraisal gap the buyer covers ($)"
          value={offer.appraisalGapCoverage}
          onChange={appraisalGapCoverage => set({ appraisalGapCoverage })}
        />
        <TextField
          label="Closing date"
          type="date"
          value={offer.closingDate ?? ''}
          onChange={value => set({ closingDate: value || null })}
        />
        <TextField
          label="Offer expires"
          type="date"
          value={offer.offerExpires ?? ''}
          onChange={value => set({ offerExpires: value || null })}
        />
        <NumberField
          label="Rent-back after closing (days)"
          value={offer.rentBackDays}
          step="1"
          onChange={rentBackDays => set({ rentBackDays })}
        />
      </div>
      <fieldset className="os-contingencies">
        <legend>Contingencies</legend>
        {contingencyKeys.map(key => {
          const term = offer.contingencies[key];
          return (
            <div key={key} className="os-contingency">
              <SelectField<Tri>
                label={`${contingencyLabels[key]} contingency`}
                value={triOf(term.included)}
                options={[
                  { value: 'unknown', label: 'Not stated' },
                  { value: 'included', label: 'Included' },
                  { value: 'waived', label: 'Waived' },
                ]}
                onChange={value =>
                  set({
                    contingencies: {
                      ...offer.contingencies,
                      [key]: {
                        included: value === 'unknown' ? null : value === 'included',
                        days: value === 'included' ? term.days : null,
                      },
                    },
                  })
                }
              />
              {term.included && (
                <NumberField
                  label="Days"
                  value={term.days}
                  step="1"
                  onChange={days => set({ contingencies: { ...offer.contingencies, [key]: { included: true, days } } })}
                />
              )}
            </div>
          );
        })}
      </fieldset>
      <label className="os-field">
        <span>Other terms, in words (not interpreted)</span>
        <textarea
          maxLength={1500}
          value={offer.otherTerms}
          onChange={event => set({ otherTerms: event.target.value })}
        />
      </label>
      <button type="button" className="text-button" onClick={onRemove}>
        <Trash2 size={14} aria-hidden="true" /> Remove {offer.label}
      </button>
    </details>
  );
}

function Comparison({ comparison }: { comparison: OfferComparison }) {
  const { analyses } = comparison;
  const keys = [...new Set(analyses.flatMap(analysis => analysis.figures.map(item => item.key)))];
  return (
    <>
      <ul className="os-explanation" data-testid="offer-explanation">
        {comparison.explanation.map(text => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <div className="table-wrap" role="region" aria-label="Offer comparison figures" tabIndex={0}>
        <table className="os-compare">
          <caption>Every figure says whether you entered it, assumed it or Ascent calculated it.</caption>
          <thead>
            <tr>
              <th scope="col">Figure</th>
              {analyses.map(analysis => (
                <th scope="col" key={analysis.offerId}>
                  {analysis.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key}>
                <th scope="row">{analyses.flatMap(a => a.figures).find(item => item.key === key)?.label}</th>
                {analyses.map(analysis => {
                  const item = analysis.figures.find(figure => figure.key === key);
                  return (
                    <td key={analysis.offerId} title={item?.formula}>
                      {item ? (
                        <>
                          {item.text} <Kind kind={item.kind} />
                          <small className="os-formula">{item.formula}</small>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Contingencies</th>
              {analyses.map(analysis => (
                <td key={analysis.offerId}>
                  {analysis.contingencies
                    .map(
                      item =>
                        `${item.label}: ${item.status}${item.status === 'included' && item.days !== null ? ` (${item.days} days)` : ''}`,
                    )
                    .join('; ')}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {comparison.differences.length > 0 && (
        <>
          <h3>Differences</h3>
          <ul>
            {comparison.differences.map(item => (
              <li key={item.offerId}>
                <strong>{item.label}</strong>
                {item.headlineDifference !== null && <> {signed(item.headlineDifference)}</>}
                {item.closingDaysDifference !== null && item.closingDaysDifference !== 0 && (
                  <>
                    ; closes {Math.abs(item.closingDaysDifference)} days{' '}
                    {item.closingDaysDifference < 0 ? 'earlier' : 'later'}
                  </>
                )}
                {item.termDifferences.length > 0 && (
                  <ul>
                    {item.termDifferences.map(text => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Deadlines</h3>
      <div className="os-deadlines">
        {analyses.map(analysis => (
          <div key={analysis.offerId}>
            <h4>{analysis.label}</h4>
            <ul>
              {analysis.deadlines.map(deadline => (
                <li key={deadline.key} data-basis={deadline.basis}>
                  <strong>{deadline.label}:</strong> {deadline.date ?? 'not entered'} <small>{deadline.note}</small>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <details>
        <summary>Sensitivity: what moves each figure</summary>
        {comparison.sensitivity.map(item => (
          <div key={item.offerId}>
            <h4>{item.label}</h4>
            <ul>
              {item.rows.map(row => (
                <li key={row.scenario}>
                  {row.scenario}: {row.value === null ? 'not calculable' : usd(row.value)}
                  {row.change !== null && <> ({signed(row.change)})</>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
      <h3>Compared with the estimate</h3>
      <p data-testid="offer-estimate">{comparison.estimate.text}</p>
      {comparison.estimate.rows.length > 0 && (
        <ul>
          {comparison.estimate.rows.map(row => (
            <li key={row.offerId}>
              {row.label}:{' '}
              {row.difference === null ? 'no price entered' : `${signed(row.difference)} against the estimate`}
            </li>
          ))}
        </ul>
      )}
      {analyses.some(analysis => analysis.notes.length) && (
        <>
          <h3>Things to know</h3>
          <ul>
            {analyses.flatMap(analysis =>
              analysis.notes.map(note => (
                <li key={`${analysis.offerId}-${note}`}>
                  <strong>{analysis.label}:</strong> {note}
                </li>
              )),
            )}
          </ul>
        </>
      )}
      {comparison.missing.length > 0 && (
        <details>
          <summary>Not entered ({comparison.missing.length})</summary>
          <ul>
            {comparison.missing.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function CompareOffers({
  propertyKey,
  address,
  value,
  defaults,
  today,
  onComparison,
}: {
  propertyKey: string;
  address: string;
  value: ValueContext;
  defaults: { commissionPercent: number; closingPercent: number; payoff: number } | undefined;
  today: string;
  onComparison: (lab: OfferLab | null, comparison: OfferComparison | null) => void;
}) {
  const [lab, setLab] = useState<OfferLab | null>(null);
  const [status, setStatus] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    const saved = readLocal(offerLabKey(propertyKey), raw => {
      const parsed = offerLabSchema.parse(JSON.parse(raw));
      if (parsed.propertyKey !== propertyKey) throw new Error('This comparison belongs to another home.');
      return parsed;
    });
    setStatus('');
    setConfirmClear(false);
    if (saved.error)
      setStatus(
        'A saved comparison on this device could not be read, so a new one was started. The old one was left as it was.',
      );
    setLab(saved.value ?? emptyOfferLab(propertyKey, today, 'seller', defaults));
    // Defaults seed only a new lab; later edits to the workbench do not overwrite entered terms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyKey]);
  const update = (next: OfferLab) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setLab(stamped);
    try {
      offerLabSchema.parse(stamped);
      setStatus(writeLocal(offerLabKey(propertyKey), stamped));
    } catch {
      setStatus('Some entries are not valid yet, so this version is not saved. Fix the fields listed below.');
    }
  };
  const result = useMemo(() => {
    if (!lab) return { comparison: null, issues: [] as string[] };
    try {
      return { comparison: compareOfferLab(lab, value), issues: [] as string[] };
    } catch (error) {
      return {
        comparison: null,
        issues:
          error instanceof ZodError
            ? error.issues.map(issue => `${String(issue.path.slice(-1)[0] ?? 'Entry')}: ${issue.message}`)
            : ['The comparison could not be calculated.'],
      };
    }
  }, [lab, value]);
  useEffect(() => onComparison(lab, result.comparison), [lab, result.comparison, onComparison]);
  if (!lab) return <p role="status">Opening your comparison…</p>;
  const settings = lab.settings;
  const setSettings = (patch: Partial<LabSettings>) => update({ ...lab, settings: { ...settings, ...patch } });
  const seller = settings.side === 'seller';
  return (
    <>
      <OsPanel
        eyebrow="OFFER LAB"
        title={seller ? 'Compare the offers you received.' : 'Compare offers you might make.'}
        id="os-offers"
      >
        <p>
          Enter only what is written in each offer and leave the rest blank. Ascent works out{' '}
          {seller ? 'what you would keep' : 'the cash you would need'} and the dates that follow from the terms. It does
          not score offers, predict whether they close or read their legal terms.
        </p>
        <div className="os-segmented" role="group" aria-label="I am">
          {(['seller', 'buyer'] as const).map(side => (
            <button
              key={side}
              type="button"
              className="button small"
              aria-pressed={settings.side === side}
              onClick={() => setSettings({ side })}
            >
              {side === 'seller' ? 'Selling' : 'Buying'}
            </button>
          ))}
        </div>
        <h3>Your assumptions</h3>
        <div className="os-grid">
          {seller ? (
            <>
              <NumberField
                label="Agent commission you pay (%)"
                value={settings.commissionPercent}
                onChange={commissionPercent => setSettings({ commissionPercent })}
              />
              <NumberField
                label="Your closing costs and transfer taxes (%)"
                value={settings.closingPercent}
                onChange={closingPercent => setSettings({ closingPercent })}
              />
              <NumberField
                label="Mortgage payoff ($)"
                value={settings.mortgagePayoff}
                onChange={mortgagePayoff => setSettings({ mortgagePayoff })}
                hint="A lender payoff statement is exact; a balance is an estimate."
              />
              <NumberField
                label="Monthly cost of owning until closing ($)"
                value={settings.monthlyCarryingCost}
                onChange={monthlyCarryingCost => setSettings({ monthlyCarryingCost })}
                hint="Mortgage, tax, insurance and utilities while you wait."
              />
            </>
          ) : (
            <>
              <NumberField
                label="Your closing costs (%)"
                value={settings.buyerClosingPercent}
                onChange={buyerClosingPercent => setSettings({ buyerClosingPercent })}
              />
              <NumberField
                label="Cash you have available ($)"
                value={settings.cashAvailable}
                onChange={cashAvailable => setSettings({ cashAvailable })}
              />
              <NumberField
                label="Monthly property tax ($)"
                value={settings.monthlyTax}
                onChange={monthlyTax => setSettings({ monthlyTax })}
              />
              <NumberField
                label="Monthly insurance ($)"
                value={settings.monthlyInsurance}
                onChange={monthlyInsurance => setSettings({ monthlyInsurance })}
              />
              <NumberField
                label="Monthly HOA or condo dues ($)"
                value={settings.monthlyHoa}
                onChange={monthlyHoa => setSettings({ monthlyHoa })}
              />
            </>
          )}
          <TextField
            label="Count from (today)"
            type="date"
            value={settings.asOf}
            onChange={asOf => asOf && setSettings({ asOf })}
          />
          <TextField
            label="Assumed acceptance date"
            type="date"
            value={settings.assumedAcceptance ?? ''}
            onChange={value => setSettings({ assumedAcceptance: value || null })}
          />
        </div>
        <h3>Offers</h3>
        {lab.offers.map((offer, index) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            side={settings.side}
            onChange={next => update({ ...lab, offers: lab.offers.map((item, i) => (i === index ? next : item)) })}
            onRemove={() =>
              update({
                ...lab,
                offers: lab.offers.filter((_, i) => i !== index),
                referenceOfferId: lab.referenceOfferId === offer.id ? null : lab.referenceOfferId,
              })
            }
          />
        ))}
        <div className="os-actions">
          <button
            type="button"
            className="button"
            disabled={lab.offers.length >= MAX_OFFERS}
            onClick={() => update({ ...lab, offers: [...lab.offers, blankOffer(lab.offers.length, settings.side)] })}
            data-testid="add-offer"
          >
            <Plus size={16} aria-hidden="true" /> Add {seller ? 'an offer' : 'an option'}
          </button>
          {lab.offers.length > 1 && (
            <SelectField
              label="Compare against"
              value={result.comparison?.referenceOfferId ?? lab.offers[0].id}
              options={lab.offers.map(offer => ({ value: offer.id, label: offer.label }))}
              onChange={referenceOfferId => update({ ...lab, referenceOfferId })}
            />
          )}
        </div>
        <p role="status" aria-live="polite" className="fine">
          {status || 'Saved on this device only.'}
        </p>
      </OsPanel>
      <OsPanel eyebrow="OFFER COMPARISON" title="The arithmetic, side by side." id="os-offer-comparison">
        {result.issues.length > 0 && (
          <div className="error-box" role="alert">
            <p>Some entries need attention before Ascent can calculate:</p>
            <ul>
              {result.issues.map(issue => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {result.comparison && lab.offers.length > 0 ? (
          <Comparison comparison={result.comparison} />
        ) : (
          !result.issues.length && <p>Add an offer to compare.</p>
        )}
        <div className="os-actions">
          <button
            type="button"
            className="button"
            disabled={!result.comparison || !lab.offers.length}
            onClick={() =>
              result.comparison && openHtmlReport(offerComparisonHtml(lab, result.comparison, address, new Date()))
            }
          >
            <Printer size={16} aria-hidden="true" /> Printable comparison brief
          </button>
          <button
            type="button"
            className="button"
            disabled={!result.comparison}
            onClick={() =>
              result.comparison &&
              downloadJson(offerLabRecord(lab, result.comparison, address), 'ascent-offer-comparison.json')
            }
          >
            <Download size={16} aria-hidden="true" /> Private export
          </button>
          {confirmClear ? (
            <>
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  update(emptyOfferLab(propertyKey, today, settings.side, defaults));
                  setConfirmClear(false);
                }}
              >
                Clear every offer
              </button>
              <button type="button" className="text-button" onClick={() => setConfirmClear(false)}>
                Keep them
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => setConfirmClear(true)}
              disabled={!lab.offers.length}
            >
              Clear…
            </button>
          )}
        </div>
        <OfferTransfer
          key={propertyKey}
          lab={lab}
          valid={!!result.comparison}
          address={address}
          onRestore={restored => {
            const checked = offerLabSchema.safeParse(restored);
            if (!checked.success || checked.data.propertyKey !== propertyKey)
              return 'This comparison could not be restored for this home.';
            const next = { ...checked.data, updatedAt: new Date().toISOString() };
            const failure = writeLocal(offerLabKey(propertyKey), next);
            if (failure)
              return 'Device storage is unavailable or full. Nothing was replaced; keep your export and try again.';
            setLab(next);
            setStatus('Restored and saved on this device.');
            setConfirmClear(false);
            return '';
          }}
        />
        <ul className="fine">
          {OFFER_LAB_BOUNDARIES.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </OsPanel>
    </>
  );
}
