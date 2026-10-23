'use client';
import { useRef, useState } from 'react';
import { CalendarDays, Upload } from 'lucide-react';
import { downloadText } from '@/lib/browser-export';
import { analyzeOffer, offerScheduleIssues, type OfferLab } from '@/lib/offer-lab';
import { MAX_OFFER_IMPORT_BYTES, offerCalendar, parseOfferImport } from '@/lib/offer-transfer';
import { SelectField } from './shared';

export function OfferTransfer({
  lab,
  valid,
  address,
  onRestore,
}: {
  lab: OfferLab;
  valid: boolean;
  address: string;
  /** Return an error if persistence fails; the current comparison must survive. */
  onRestore: (lab: OfferLab) => string;
}) {
  const [preview, setPreview] = useState<ReturnType<typeof parseOfferImport> | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const offer = lab.offers.find(item => item.id === selected) ?? lab.offers[0];
  const issues = valid && offer ? offerScheduleIssues(offer, lab.settings) : [];
  const dates = valid && offer ? analyzeOffer(offer, lab.settings).deadlines.filter(item => item.date) : [];
  return (
    <div className="os-transfer">
      <h3>Continue on another device</h3>
      <p className="fine">
        Use Private export above, then restore that file while viewing this same home on another device. Files contain
        unencrypted offer terms, finances and notes. Keep them private. Restoring happens in this browser; no file is
        uploaded. It replaces this home’s comparison only, after you review it.
      </p>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Choose private offer export"
        hidden
        onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          const current = ++request.current;
          setPreview(null);
          setError('');
          setMessage('');
          if (!file) return;
          try {
            if (file.size > MAX_OFFER_IMPORT_BYTES)
              throw new Error('Choose an Ascent offer export smaller than 512 KB.');
            const parsed = parseOfferImport(await file.text(), lab.propertyKey);
            if (current === request.current) setPreview(parsed);
          } catch (cause) {
            if (current === request.current)
              setError(cause instanceof Error ? cause.message : 'This file could not be read.');
          }
        }}
      />
      <button type="button" className="button" onClick={() => input.current?.click()}>
        <Upload size={16} aria-hidden="true" /> Restore private export
      </button>
      {preview && (
        <section role="region" aria-label="Review offer restore" className="os-restore-preview">
          <h4>Review before replacing</h4>
          <p>
            <strong>{address}</strong> · {preview.lab.settings.side === 'seller' ? 'Selling' : 'Buying'} ·{' '}
            {preview.lab.offers.length} {preview.lab.offers.length === 1 ? 'offer' : 'offers'}
          </p>
          <p className="fine">
            Exported {preview.exportedAt.slice(0, 10)}. Count-from date: {preview.lab.settings.asOf}. Assumed
            acceptance: {preview.lab.settings.assumedAcceptance ?? 'not entered'}.
          </p>
          <ul>
            {preview.lab.offers.map(item => (
              <li key={item.id}>
                {item.label} · {item.basis === 'what-if' ? 'what-if' : 'written offer'}
              </li>
            ))}
          </ul>
          <p>
            This will replace your current {lab.offers.length} {lab.offers.length === 1 ? 'offer' : 'offers'} and
            assumptions for this home. Export them first if you want to keep them. Ascent recalculates the restored
            terms using current property evidence; a withheld estimate stays withheld. Review the restored dates before
            using them.
          </p>
          <div className="os-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                const failure = onRestore(preview.lab);
                setError(failure);
                if (!failure) {
                  setPreview(null);
                  setMessage('Comparison restored and saved on this device. Review the dates and assumptions.');
                }
              }}
            >
              Replace this comparison
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                ++request.current;
                setPreview(null);
                setError('');
              }}
            >
              Cancel restore
            </button>
          </div>
        </section>
      )}
      <h3>Take one offer’s dates to your calendar</h3>
      <p className="fine">
        Download all-day review markers for the selected offer. Confirm contract dates, times and day-count rules with
        your agent. Missing dates stay out of the file. The file includes the offer’s name and property identifier, but
        no prices, finances or notes. Calendar copies do not update when you edit Ascent; importing again may create
        duplicates.
      </p>
      {lab.offers.length > 0 && (
        <SelectField
          label="Offer for calendar"
          value={offer?.id ?? ''}
          options={lab.offers.map(item => ({ value: item.id, label: item.label }))}
          onChange={setSelected}
        />
      )}
      {issues.length > 0 && (
        <div role="status">
          <p>Resolve these dates before downloading:</p>
          <ul>
            {issues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        className="button"
        disabled={!valid || !dates.length || issues.length > 0}
        onClick={() => {
          try {
            downloadText(offerCalendar(lab, offer!.id), 'ascent-offer-dates.ics', 'text/calendar;charset=utf-8');
            setError('');
            setMessage('Calendar file downloaded. Import it into your calendar and review the dates.');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Calendar download failed.');
          }
        }}
      >
        <CalendarDays size={16} aria-hidden="true" /> Download {dates.length} calendar{' '}
        {dates.length === 1 ? 'date' : 'dates'}
      </button>
      {!dates.length && (
        <p className="fine">
          Enter a closing or expiration date, or an assumed acceptance date with relative deadlines, to download dates.
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
