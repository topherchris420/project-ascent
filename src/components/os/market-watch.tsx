'use client';
import { useState } from 'react';
import { Bell, BellOff, Download, LoaderCircle, Trash2 } from 'lucide-react';
import { downloadJson } from '@/lib/browser-export';
import type { Observation } from '@/lib/sources/observations';
import type { NearbySale } from '@/lib/sources/property-check';
import {
  addWatch,
  checkAllowed,
  exportWatchtower,
  markRead,
  removeWatch,
  updateWatch,
  WATCH_POLICY,
  watchKey,
  watchStatus,
  watchTopicLabels,
  watchTopics,
  type Watch,
  type WatchTopic,
  type Watchtower,
} from '@/lib/watchtower';
import { dateTime, OsPanel, shortDay } from './shared';

const usd = (value: unknown) =>
  typeof value === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
    : 'Not recorded';
const KIND_LABELS = {
  new: 'New record',
  changed: 'Changed record',
  removed: 'No longer listed',
  'source-unavailable': 'Source unavailable',
  'source-restored': 'Source answering',
} as const;

function PriceIndex({ observations }: { observations: Observation[] }) {
  const quarters = observations
    .filter(item => item.kind === 'price-index')
    .toSorted((a, b) => ((a.dates.effective ?? '') < (b.dates.effective ?? '') ? 1 : -1));
  const latest = quarters[0];
  const target = latest?.dates.effective
    ? `${Number(latest.dates.effective.slice(0, 4)) - 1}${latest.dates.effective.slice(4)}`
    : null;
  const yearEarlier = quarters.find(item => item.dates.effective === target);
  const latestValue = latest?.values.indexNsa;
  const earlierValue = yearEarlier?.values.indexNsa;
  if (!latest || typeof latestValue !== 'number') return null;
  return (
    <div className="os-index" data-testid="price-index">
      <h3>Regional price index</h3>
      <p>
        FHFA purchase-only index for {String(latest.values.area ?? 'the metropolitan area')}, quarter ending{' '}
        {shortDay(latest.dates.effective!)}: <strong>{latestValue.toFixed(2)}</strong> (not seasonally adjusted)
        {typeof earlierValue === 'number' && (
          <>
            , against {earlierValue.toFixed(2)} a year earlier:{' '}
            {(((latestValue - earlierValue) / earlierValue) * 100).toFixed(1)}% change
          </>
        )}
        .
      </p>
      <p className="fine">
        The index describes repeat sales across the metropolitan area, not this home, and it does not change your
        estimate.
      </p>
    </div>
  );
}

export function MarketWatch({
  home,
  watchtower,
  onChange,
  onCheck,
  checking,
  observations,
  nearby,
  now,
}: {
  home: { market: Watch['market']; parcelId: string; address: string };
  watchtower: Watchtower;
  onChange: (next: Watchtower) => void;
  onCheck: () => void;
  checking: boolean;
  observations: Observation[];
  nearby: { radiusMiles: number; after: string; sales: NearbySale[] } | null;
  now: Date;
}) {
  const key = watchKey(home.market, home.parcelId);
  const watch = watchtower.watches.find(item => item.key === key) ?? null;
  const [topics, setTopics] = useState<WatchTopic[]>(['own-records', 'nearby-sales', 'flood-zone']);
  const [radius, setRadius] = useState(0.5);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const events = watchtower.events.filter(event => event.watchKey === key).toReversed();
  const unread = events.filter(event => !event.read).length;
  const allowed = watch ? checkAllowed(watchtower, watch, now) : null;
  const status = watch ? watchStatus(watch, now) : null;
  const toggle = (topic: WatchTopic) =>
    setTopics(current => (current.includes(topic) ? current.filter(item => item !== topic) : [...current, topic]));
  const start = () => {
    try {
      setError('');
      onChange(addWatch(watchtower, home, topics, now, radius));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The watch could not be added.');
    }
  };
  return (
    <>
      <OsPanel
        eyebrow="PROPERTY WATCHTOWER"
        title={watch ? 'Watching this home.' : 'Watch the public records.'}
        id="os-watch"
      >
        <p>{WATCH_POLICY.schedule}</p>
        <p className="fine">
          Watches, check history and notifications stay in this browser. Only the public-record check leaves your
          device, and it carries the parcel identifier, never your name. Email alerts are not available: they need an
          account-based watch and a configured email provider, so notifications appear here only.
        </p>
        {!watch ? (
          <form
            className="os-form"
            onSubmit={event => {
              event.preventDefault();
              start();
            }}
          >
            <fieldset>
              <legend>What to watch</legend>
              {watchTopics.map(topic => (
                <label key={topic} className="os-check-row">
                  <input type="checkbox" checked={topics.includes(topic)} onChange={() => toggle(topic)} />
                  <span>
                    <strong>{watchTopicLabels[topic].label}</strong>
                    <span className="os-check-detail">{watchTopicLabels[topic].detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="os-field">
              <span>Nearby radius</span>
              <select value={radius} onChange={event => setRadius(Number(event.target.value))}>
                {[0.25, 0.5, 1, 2].map(value => (
                  <option key={value} value={value}>
                    {value} mile{value === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button primary" disabled={!topics.length} data-testid="start-watch">
              <Bell size={16} aria-hidden="true" /> Watch this home
            </button>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : (
          <>
            <dl className="os-values os-watch-status" data-testid="watch-status">
              <div>
                <dt>Status</dt>
                <dd>{status!.text}</dd>
              </div>
              <div>
                <dt>Last successful check</dt>
                <dd>{watch.lastSuccessfulCheckAt ? dateTime(watch.lastSuccessfulCheckAt) : 'None yet'}</dd>
              </div>
              <div>
                <dt>Next check</dt>
                <dd>
                  {watch.paused
                    ? 'Paused'
                    : status!.nextCheckAfter
                      ? `After ${dateTime(status!.nextCheckAfter)}, when you open Ascent`
                      : 'Due now'}
                </dd>
              </div>
              <div>
                <dt>Watching</dt>
                <dd>{watch.topics.map(topic => watchTopicLabels[topic].label).join(', ')}</dd>
              </div>
            </dl>
            <div className="os-actions">
              <button type="button" className="button" onClick={onCheck} disabled={checking || !allowed!.allowed}>
                {checking && <LoaderCircle size={16} className="spin" aria-hidden="true" />} Check now
              </button>
              <button
                type="button"
                className="button"
                onClick={() => onChange(updateWatch(watchtower, key, { paused: !watch.paused }))}
              >
                {watch.paused ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
                {watch.paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => downloadJson(exportWatchtower(watchtower, now), 'ascent-watchtower.json')}
              >
                <Download size={16} aria-hidden="true" /> Export
              </button>
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => {
                      onChange(removeWatch(watchtower, key));
                      setConfirmDelete(false);
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" /> Delete watch and history
                  </button>
                  <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className="text-button" onClick={() => setConfirmDelete(true)}>
                  Stop watching…
                </button>
              )}
            </div>
            {!allowed!.allowed && !watch.paused && <p className="fine">{allowed!.reason}</p>}
          </>
        )}
      </OsPanel>
      {watch && (
        <OsPanel
          eyebrow="NOTIFICATIONS"
          title={unread ? `${unread} new` : 'No new notifications.'}
          id="os-notifications"
        >
          {events.length ? (
            <>
              {unread > 0 && (
                <button type="button" className="text-button" onClick={() => onChange(markRead(watchtower, key))}>
                  Mark all as read
                </button>
              )}
              <ol className="os-notifications" data-testid="notifications">
                {events.map(event => (
                  <li key={event.id} data-read={event.read}>
                    <span className={`os-status os-${event.kind}`}>{KIND_LABELS[event.kind]}</span>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                    <small>
                      {event.recordDate ? `Record dated ${shortDay(event.recordDate)} · ` : ''}found{' '}
                      {dateTime(event.detectedAt)}
                    </small>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>
              {watch.baseline
                ? 'Nothing has changed since the first check. The first check records what each source lists; later checks report differences.'
                : 'The first check will record what each source lists now. Later checks report what changes.'}
            </p>
          )}
          {watch.checks.length > 0 && (
            <details>
              <summary>Check history ({watch.checks.length})</summary>
              <ol className="os-check-log">
                {watch.checks.toReversed().map(check => (
                  <li key={check.at}>
                    {dateTime(check.at)}: {check.records} records, {check.events} change(s) ·{' '}
                    {check.sources
                      .map(source => `${source.sourceId} ${source.status}${source.cached ? ' (cached)' : ''}`)
                      .join(', ')}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </OsPanel>
      )}
      <OsPanel eyebrow="MARKET WATCH" title="Recorded activity nearby." id="os-market">
        {nearby ? (
          nearby.sales.length ? (
            <div className="table-wrap">
              <table>
                <caption>
                  Qualified recorded sales within {nearby.radiusMiles} miles dated after {shortDay(nearby.after)}, the
                  newest sale in the bundled snapshot. They are not in your estimate.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Address</th>
                    <th scope="col">Distance</th>
                    <th scope="col">Sale dated</th>
                    <th scope="col">Recorded price</th>
                  </tr>
                </thead>
                <tbody>
                  {nearby.sales.map(sale => (
                    <tr key={sale.identity}>
                      <td>{sale.address}</td>
                      <td>{sale.distanceMiles} mi</td>
                      <td>{sale.observation.dates.transaction ? shortDay(sale.observation.dates.transaction) : '—'}</td>
                      <td>{usd(sale.observation.values.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No qualified sale within {nearby.radiusMiles} miles is recorded after {shortDay(nearby.after)} yet.
              Recording lags closing by weeks.
            </p>
          )
        ) : (
          <p>Check the public records to see recorded sales nearby that are newer than the bundled snapshot.</p>
        )}
        <PriceIndex observations={observations} />
        <p className="fine">
          These are recorded deed transfers, not listings. Ascent has no MLS agreement and never shows recorded sales as
          homes for sale.
        </p>
      </OsPanel>
    </>
  );
}
