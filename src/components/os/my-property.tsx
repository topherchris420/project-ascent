'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import type { EvidenceTimeline, TimelineEvent } from '@/lib/evidence-timeline';
import type { HomeDecisionBrief } from '@/lib/home-decision-brief';
import { HomeDecisionBriefPanel } from '../home-decision-brief';
import { dateTime, OsPanel, shortDay } from './shared';

const CATEGORY_LABELS: Record<TimelineEvent['category'], string> = {
  transfer: 'Sales',
  permit: 'Permits',
  assessment: 'Assessments',
  tax: 'Tax',
  risk: 'Flood',
  construction: 'Construction',
  source: 'Snapshot',
};
const eventDate = (event: TimelineEvent) =>
  !event.date ? 'Date not recorded' : event.precision === 'year' ? event.date : shortDay(event.date);

function TimelineItem({ event }: { event: TimelineEvent }) {
  return (
    <li className={`os-event os-event-${event.category}`} data-testid="timeline-event">
      <div className="os-event-date">
        <span>{event.dateLabel}</span>
        <strong>{eventDate(event)}</strong>
      </div>
      <div>
        <h4>
          {event.title}
          {event.newSinceSnapshot && <span className="os-badge">Newer than the snapshot</span>}
        </h4>
        {event.conflict && (
          <p className="os-conflict" role="note">
            <CircleAlert size={15} aria-hidden="true" /> {event.conflict}
          </p>
        )}
        <p>{event.detail}</p>
        {event.values.length > 0 && (
          <dl className="os-values">
            {event.values.map(item => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {event.sources.length > 0 && (
          <ul className="os-sources" aria-label="Where this comes from">
            {event.sources.map(source => (
              <li key={`${source.origin}-${source.sourceId}`}>
                <strong>{source.origin === 'live' ? 'Live check' : 'Bundled'}</strong> · {source.label}
                {source.recorded && <> · deed dated {shortDay(source.recorded)}</>}
                {source.published && <> · source published {shortDay(source.published)}</>}
                <> · Ascent looked {shortDay(source.observed)}</>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function MyProperty({
  brief,
  timeline,
  checking,
  checkError,
  onCheck,
  studioHref,
}: {
  brief: HomeDecisionBrief;
  timeline: EvidenceTimeline;
  checking: boolean;
  checkError: string;
  onCheck: () => void;
  studioHref: string;
}) {
  const [filter, setFilter] = useState<TimelineEvent['category'] | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const events = timeline.events.filter(event => filter === 'all' || event.category === filter);
  const shown = expanded ? events : events.slice(0, 8);
  const categories = [...new Set(timeline.events.map(event => event.category))];
  return (
    <>
      <HomeDecisionBriefPanel brief={brief} />
      <OsPanel eyebrow="PROPERTY EVIDENCE TIMELINE" title="What the public records say happened here." id="os-timeline">
        <p>
          Each event keeps its own date apart from when it was recorded, when the source published it and when Ascent
          looked. Records found by a live check are shown and watched; they never change the estimate.
        </p>
        <div className="os-check">
          <button type="button" className="button" onClick={onCheck} disabled={checking} data-testid="check-records">
            {checking ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            {checking ? 'Checking the public sources…' : 'Check public records now'}
          </button>
          <span role="status" aria-live="polite">
            {timeline.live ? `Checked ${dateTime(timeline.live.checkedAt)}.` : 'Showing the bundled snapshot only.'}
          </span>
        </div>
        {checkError && (
          <p className="error-box" role="alert">
            {checkError} The bundled records below are unchanged; nothing was assumed in their place.
          </p>
        )}
        {timeline.sources.length > 0 && (
          <ul className="os-source-status" aria-label="Sources checked">
            {timeline.sources.map(source => (
              <li key={source.sourceId} data-status={source.status}>
                <strong>{source.label}</strong> <span className="os-status">{source.status}</span> {source.detail}
              </li>
            ))}
          </ul>
        )}
        <details className="os-gaps" open={!timeline.live}>
          <summary>What this timeline cannot show ({timeline.gaps.length})</summary>
          <ul>
            {timeline.gaps.map(gap => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </details>
        <div className="os-filters" role="group" aria-label="Show events">
          {(['all', ...categories] as const).map(category => (
            <button
              key={category}
              type="button"
              className="button small"
              aria-pressed={filter === category}
              onClick={() => setFilter(category)}
            >
              {category === 'all' ? `All (${timeline.events.length})` : CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
        <ol className="os-timeline">
          {shown.map(event => (
            <TimelineItem key={event.id} event={event} />
          ))}
        </ol>
        {events.length > shown.length && (
          <button type="button" className="text-button" onClick={() => setExpanded(true)}>
            Show all {events.length} events
          </button>
        )}
        <p className="fine">
          <Link href={studioHref}>Open the full pricing studio</Link> to review every comparable sale, change settings
          and print the professional report.
        </p>
      </OsPanel>
    </>
  );
}
