import { useState } from 'react';
import { CheckCircle2, Clock3, Search } from 'lucide-react';
import type { Client, Workspace } from '@/lib/types';
import { evaluateSavedSearch } from '@/lib/client-intelligence';

type Props = {
  workspace: Workspace;
  client: Client;
  readonly: boolean;
  busy: boolean;
  onAction: (type: string, values: Record<string, unknown>) => Promise<unknown>;
  onProperty: (id: string) => void;
};
export function ClientIntelligencePanel({ workspace, client, readonly, busy, onAction, onProperty }: Props) {
  const [onlyPending, setOnlyPending] = useState(true);
  const tasks = (client.followUps || [])
    .filter(task => !onlyPending || task.status === 'pending')
    .toSorted((a, b) => a.dueAt.localeCompare(b.dueAt));
  const searches = workspace.savedSearches.filter(search => search.clientId === client.id);
  return (
    <div className="section-space">
      <section className="panel" aria-labelledby="client-followups-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FOLLOW THROUGH</span>
            <h2 id="client-followups-title">Client follow-ups</h2>
          </div>
          <label className="check-label">
            <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
            Pending only
          </label>
        </div>
        <p className="fine">
          Manually selected reminders, not contractual deadlines. No message or notification is sent automatically.
        </p>
        {tasks.map(task => (
          <div className="snapshot-row" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <small>
                {task.dueAt.slice(0, 10)} · {task.status}
                {task.status === 'pending' && task.dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10)
                  ? ' · Overdue'
                  : ''}
              </small>
            </div>
            <button
              className="button small"
              disabled={readonly || busy}
              onClick={() =>
                void onAction('setFollowUpStatus', {
                  clientId: client.id,
                  id: task.id,
                  status: task.status === 'pending' ? 'complete' : 'pending',
                })
              }
            >
              {task.status === 'pending' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{' '}
              {task.status === 'pending' ? 'Complete' : 'Reopen'}
            </button>
          </div>
        ))}
        {!tasks.length && <p className="body-note">No {onlyPending ? 'pending ' : ''}follow-ups recorded.</p>}
        <form
          onSubmit={async e => {
            e.preventDefault();
            const form = e.currentTarget,
              values = new FormData(form);
            if (
              await onAction('saveFollowUp', {
                clientId: client.id,
                title: String(values.get('followUpTitle')),
                dueAt: String(values.get('followUpDate')),
              })
            )
              form.reset();
          }}
        >
          <div className="form-grid">
            <label>
              Follow-up task
              <input
                name="followUpTitle"
                required
                maxLength={200}
                placeholder="Confirm the client’s current property priorities"
                disabled={readonly || busy}
              />
            </label>
            <label>
              Follow-up date
              <input name="followUpDate" type="date" required disabled={readonly || busy} />
            </label>
          </div>
          <button className="button" disabled={readonly || busy}>
            Save follow-up
          </button>
        </form>
      </section>
      <section className="panel section-space" aria-labelledby="client-matches-title">
        <span className="eyebrow">EVIDENCE BEFORE OUTREACH</span>
        <h2 id="client-matches-title">Matches from saved criteria</h2>
        <p className="fine">
          Checks currently authorized workspace inventory across its available markets. This does not refresh or
          continuously monitor RentCast/MLS listings. The provider research cache remains separate until complete
          listing records are admitted through the national fabric.
        </p>
        {searches.map(search => {
          const evaluation = evaluateSavedSearch(search, workspace.properties),
            matches = evaluation.filter(match => match.matched),
            missing = evaluation.filter(match => match.needsEvidence);
          return (
            <article key={search.id} className="section-space">
              <div className="panel-heading">
                <div>
                  <h3>{search.name}</h3>
                  <p>
                    {matches.length} matches · {missing.length} need missing evidence
                  </p>
                </div>
                <button
                  className="button small"
                  disabled={readonly || busy}
                  onClick={() => void onAction('reviewSavedSearch', { id: search.id })}
                >
                  <Search size={14} />
                  Review matches & create alerts
                </button>
              </div>
              <p className="fine">
                Query: {search.query || 'Any location'} · ceiling ${search.maxPrice.toLocaleString('en-US')} ·{' '}
                {search.criteria?.status || 'active'} · {search.criteria?.minBedrooms ?? 'Any'} bedrooms minimum ·{' '}
                {search.criteria?.minBathrooms ?? 'Any'} bathrooms minimum · {search.criteria?.minSqft ?? 'Any'} sqft
                minimum
              </p>
              {matches.map(match => {
                const property = workspace.properties.find(property => property.id === match.propertyId)!;
                return (
                  <div className="snapshot-row" key={match.propertyId}>
                    <div>
                      <button className="text-button" onClick={() => onProperty(property.id)}>
                        {property.address}, {property.city} {property.state}
                      </button>
                      <small>
                        {match.reasons.join(' ')} · Source {match.sourceId}
                      </small>
                    </div>
                    <button
                      className="button small"
                      disabled={readonly || busy}
                      onClick={() =>
                        void onAction('setClientProperty', {
                          clientId: client.id,
                          propertyId: property.id,
                          saved: !client.savedPropertyIds.includes(property.id),
                        })
                      }
                    >
                      {client.savedPropertyIds.includes(property.id) ? 'Remove saved home' : 'Save for client'}
                    </button>
                  </div>
                );
              })}
              {!matches.length && (
                <p className="body-note">
                  No complete records meet these criteria. Broaden an explicit criterion or add authorized evidence;
                  missing values are not guessed.
                </p>
              )}
              <details>
                <summary>Inspect exclusions and missing information</summary>
                {evaluation
                  .filter(match => !match.matched)
                  .map(match => (
                    <p className="fine" key={match.propertyId}>
                      <strong>
                        {workspace.properties.find(property => property.id === match.propertyId)?.address}
                      </strong>
                      : {[...match.failed, ...match.missing.map(field => `Missing ${field}`)].join(' ')}
                    </p>
                  ))}
              </details>
            </article>
          );
        })}
        {!searches.length && (
          <p className="body-note">
            Save a search while this client is selected to connect objective property criteria to the relationship.
          </p>
        )}
      </section>
    </div>
  );
}

export function SearchCriteriaFields() {
  return (
    <>
      <div className="form-grid">
        <label>
          Minimum bedrooms
          <input name="minBedrooms" type="number" min="0" max="50" step="1" />
        </label>
        <label>
          Minimum bathrooms
          <input name="minBathrooms" type="number" min="0" max="50" step="0.5" />
        </label>
        <label>
          Minimum living area (sqft)
          <input name="minSqft" type="number" min="1" max="1000000" />
        </label>
        <label>
          Listing status for search
          <select name="criteriaStatus" defaultValue="active">
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="sold">Recorded sales</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="all">All statuses</option>
          </select>
        </label>
        <label>
          State abbreviation
          <input name="criteriaState" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" placeholder="VA" />
        </label>
        <label>
          ZIP code
          <input name="criteriaZip" inputMode="numeric" minLength={5} maxLength={5} pattern="[0-9]{5}" />
        </label>
      </div>
      <p className="fine">
        Objective criteria only. Checks apply to authorized stored inventory; neither new provider calls nor client
        outreach happen automatically.
      </p>
    </>
  );
}
