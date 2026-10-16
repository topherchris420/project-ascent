'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Globe2,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { Actor, Workspace } from '@/lib/types';
import type { LicenseVerification, PlatformState, PlanId, MonthlyUsage, BillingState } from '@/lib/platform-types';
import type { FabricState, RegionConfig, RegionCoverage, SourceAccess } from '@/lib/fabric-types';
type Props = {
  workspace: Workspace;
  user: Actor;
  onWorkspace: (ws: Workspace) => void;
  onRegion?: (id: string) => void;
};
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Unable to complete this request.');
  return json;
}
const day = (s?: string) =>
  s
    ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : 'Not recorded';
function Note({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      {error}
    </div>
  ) : null;
}
function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  );
}
export function AccessView({ workspace, user, onWorkspace }: Props) {
  const [verification, setVerification] = useState<LicenseVerification>(
      workspace.platform?.verification || { status: 'unsubmitted' },
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sources, setSources] = useState<{ state: string; label: string; url: string }[]>([]);
  useEffect(() => {
    api<{ verification: LicenseVerification; sources: typeof sources }>('/api/verification')
      .then(d => {
        setVerification(d.verification);
        setSources(d.sources);
      })
      .catch(e => setError(e.message));
  }, []);
  return (
    <>
      <PageHead eyebrow="PROGRESSIVE ACCESS" title="Start now. Grow into more.">
        Explore immediately. Verify when you need professional access. Keep every decision along the way.
      </PageHead>
      <Note error={error} />
      <div className="access-levels">
        <article className="panel access-step current">
          <span className="step-number">01</span>
          <Sparkles size={24} />
          <h2>Explorer</h2>
          <span className="badge green">Available immediately · Free forever</span>
          <p>
            Research synthetic records, build CMAs, compare offers, manage demo transactions, and explore a grounded
            assistant.
          </p>
          <strong>
            <CheckCircle2 size={15} />
            Your workspace is already open.
          </strong>
        </article>
        <article className={`panel access-step ${verification.status === 'verified' ? 'current' : ''}`}>
          <span className="step-number">02</span>
          <ShieldCheck size={24} />
          <h2>Verified Professional</h2>
          <span className="badge">Credential status: {verification.status}</span>
          <p>
            Credential review enables professional eligibility. Licensed sources still require a separate provider
            agreement and jurisdiction entitlement.
          </p>
          <strong>No new account. No lost work.</strong>
        </article>
        <article className="panel access-step">
          <span className="step-number">03</span>
          <Users size={24} />
          <h2>Brokerage</h2>
          <span className="badge">Shared continuity</span>
          <p>
            Invite colleagues, administer roles, and preserve common client and transaction histories within an
            authorized team.
          </p>
          <strong>Subscription and data rights stay independent.</strong>
        </article>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h2>Request professional verification</h2>
          <p className="body-note">
            You can continue using all explorer workflows while this request is reviewed. No verification service is
            connected; a trusted reviewer checks official records asynchronously.
          </p>
          <form
            onSubmit={async e => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              setBusy(true);
              setError('');
              try {
                const d = await api<{ verification: LicenseVerification }>('/api/verification', f);
                setVerification(d.verification);
                const w = await api<{ workspace: Workspace }>('/api/workspace');
                onWorkspace(w.workspace);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Legal name on license
              <input name="legalName" defaultValue={verification.legalName || user.name} minLength={2} required />
            </label>
            <div className="form-grid">
              <label>
                Licensing jurisdiction
                <select name="state" defaultValue={verification.state || 'VA'}>
                  {[
                    'AL',
                    'AK',
                    'AZ',
                    'AR',
                    'CA',
                    'CO',
                    'CT',
                    'DE',
                    'DC',
                    'FL',
                    'GA',
                    'HI',
                    'ID',
                    'IL',
                    'IN',
                    'IA',
                    'KS',
                    'KY',
                    'LA',
                    'ME',
                    'MD',
                    'MA',
                    'MI',
                    'MN',
                    'MS',
                    'MO',
                    'MT',
                    'NE',
                    'NV',
                    'NH',
                    'NJ',
                    'NM',
                    'NY',
                    'NC',
                    'ND',
                    'OH',
                    'OK',
                    'OR',
                    'PA',
                    'RI',
                    'SC',
                    'SD',
                    'TN',
                    'TX',
                    'UT',
                    'VT',
                    'VA',
                    'WA',
                    'WV',
                    'WI',
                    'WY',
                    'PR',
                    'GU',
                    'VI',
                    'AS',
                    'MP',
                  ].map(s => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                License number
                <input name="licenseNumber" defaultValue={verification.licenseNumber} maxLength={80} required />
              </label>
            </div>
            <button className="button primary" disabled={busy || user.role !== 'owner'}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}Submit for asynchronous
              review
            </button>
          </form>
          <p className="fine">
            Submitting a number does not verify it. Subscription payments never approve a license or grant MLS rights.
          </p>
        </section>
        <section className="panel">
          <h2>Your access record</h2>
          <div className="integration-row">
            <span>Credential review</span>
            <strong>{verification.status}</strong>
          </div>
          <div className="integration-row">
            <span>Submitted</span>
            <strong>{day(verification.submittedAt)}</strong>
          </div>
          <div className="integration-row">
            <span>Review expires</span>
            <strong>{day(verification.expiresAt)}</strong>
          </div>
          <div className="integration-row">
            <span>Licensed provider grants</span>
            <strong>
              {workspace.platform?.providerGrants.filter(g => !g.revokedAt && Date.parse(g.expiresAt) > Date.now())
                .length || 0}
            </strong>
          </div>
          {verification.reason && <p className="body-note">{verification.reason}</p>}
          <h4>Authoritative lookup sources</h4>
          {sources.map(s => (
            <a className="external-source" key={s.state} href={s.url} target="_blank" rel="noreferrer">
              {s.label}
              <ArrowUpRight size={13} />
            </a>
          ))}
          <p className="fine">
            ARELLO offers a contractual verification service for participating jurisdictions. State portals do not imply
            a public automation API. No automated validation is claimed.
          </p>
        </section>
      </div>
    </>
  );
}

type BillingInfo = {
  plans: {
    id: PlanId;
    name: string;
    description: string;
    features: string[];
    priceLabel: string;
    checkoutConfigured: boolean;
    modelCallsPerMonth: number;
    seats: number;
  }[];
  subscription: BillingState;
  usage: MonthlyUsage;
  costs: Record<string, unknown>;
  accessLevel: string;
  platform: PlatformState;
  entitlements: { plan: PlanId; seats: number; aiRequestsPerMonth: number; fabricQueriesPerMonth: number };
};
export function BillingView({ workspace, user, onWorkspace }: Props) {
  const [info, setInfo] = useState<BillingInfo | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<BillingInfo>('/api/billing')
      .then(setInfo)
      .catch(e => setError(e.message));
  }, []);
  async function manage(action: 'checkout' | 'portal', planId?: PlanId) {
    setBusy(true);
    setError('');
    try {
      const data = await api<{ url: string }>('/api/billing', { action, planId });
      const u = new URL(data.url);
      if (u.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(u.hostname))
        throw new Error('Payment provider returned an unsupported destination.');
      window.location.assign(u.href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead eyebrow="ADOPTION-FIRST PRICING" title="Value first. A plan when you need it.">
        Core exploration stays useful and free. Paid capacity and collaboration grow with your work.
      </PageHead>
      <Note error={error} />
      <div className="billing-status">
        <span>
          <span className="status-dot" />
          Your plan: <strong>{info?.entitlements.plan || workspace.platform?.plan || 'free'}</strong> ·{' '}
          {info?.subscription.status || 'free'}
        </span>
        {info?.subscription.customerId && (
          <button
            className="button small"
            disabled={busy || user.role !== 'owner'}
            onClick={() => void manage('portal')}
          >
            <CreditCard size={14} />
            Manage subscription
          </button>
        )}
        <p>Final paid prices are not set. Checkout activates only when approved Stripe Price IDs are configured.</p>
      </div>
      <div className="plan-grid">
        {info?.plans.map(p => (
          <article className={`panel plan-card ${p.id === 'free' ? 'free-plan' : ''}`} key={p.id}>
            <span className="eyebrow">
              {p.id === 'free' ? 'A PERMANENT STARTING POINT' : 'MORE CAPACITY, MORE CONTINUITY'}
            </span>
            <h2>{p.name}</h2>
            <strong className="plan-price">{p.priceLabel}</strong>
            <p>{p.description}</p>
            <ul>
              {(p.features || []).map(f => (
                <li key={f}>
                  <Check size={14} />
                  {f}
                </li>
              ))}
              <li>
                <Check size={14} />
                {p.seats} {p.seats === 1 ? 'seat' : 'seats'}
              </li>
              <li>
                <Check size={14} />
                {p.modelCallsPerMonth} AI-assisted questions / month
              </li>
            </ul>
            {p.id === info.entitlements.plan ? (
              <span className="button full current-plan">
                <CheckCircle2 size={16} />
                Your current plan
              </span>
            ) : p.id === 'free' ? (
              <p className="fine">Cancel through subscription management to return to free. Your workspace remains.</p>
            ) : (
              <button
                className="button full"
                disabled={busy || !p.checkoutConfigured || user.role !== 'owner'}
                onClick={() => void manage('checkout', p.id)}
              >
                {p.checkoutConfigured ? 'Choose plan' : 'Pricing configuration pending'}
                <ArrowRight size={14} />
              </button>
            )}
          </article>
        ))}
      </div>
      {!info && !error && (
        <p className="body-note">
          <LoaderCircle size={16} className="spin" />
          Loading configurable plans…
        </p>
      )}
      <div className="settings-grid">
        <section className="panel">
          <h2>Your metered usage</h2>
          <div className="integration-row">
            <span>Usage period</span>
            <strong>{info?.usage.period || 'Current month'}</strong>
          </div>
          <div className="integration-row">
            <span>AI-assisted questions</span>
            <strong>{info?.usage.aiRequests || 0}</strong>
          </div>
          <div className="integration-row">
            <span>Fabric queries</span>
            <strong>{info?.usage.fabricQueries || 0}</strong>
          </div>
          <div className="integration-row">
            <span>Recorded input / output tokens</span>
            <strong>
              {info?.usage.inputTokens || 0} / {info?.usage.outputTokens || 0}
            </strong>
          </div>
          <div className="integration-row">
            <span>Configured variable cost estimate</span>
            <strong>${(info?.usage.estimatedCostUsd || 0).toFixed(4)}</strong>
          </div>
          <p className="fine">
            Estimates depend on configured cost rates and recorded units. They are not provider invoices and exclude
            unconfigured fixed, licensing, support, and acquisition costs.
          </p>
        </section>
        <section className="panel">
          <h2>A sustainable model, measured</h2>
          <p className="body-note">
            Basic deterministic CMAs and synthetic research remain unlimited. Paid plans support more model capacity,
            seats, and integration usage. License rights are reviewed separately.
          </p>
          <h4>Cost configuration in effect</h4>
          <pre className="cost-config" tabIndex={0}>
            {JSON.stringify(info?.costs || { status: 'Loading cost assumptions' }, null, 2)}
          </pre>
          <button
            className="text-button"
            onClick={async () => {
              const data = await api<BillingInfo>('/api/billing');
              setInfo(data);
              const w = await api<{ workspace: Workspace }>('/api/workspace');
              onWorkspace(w.workspace);
            }}
          >
            Refresh subscription & usage
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </>
  );
}

type TeamInfo = {
  members: { id: string; name: string; email: string; role: string }[];
  invites: { id: string; email: string; role: string; expiresAt?: string; expires_at?: string }[];
  seatLimit: number;
  inviteUrl?: string;
  token?: string;
};
export function TeamView({ workspace, user, onWorkspace }: Props) {
  const [team, setTeam] = useState<TeamInfo | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState('');
  const refresh = () => api<TeamInfo>('/api/team').then(setTeam);
  useEffect(() => {
    refresh().catch(e => setError(e.message));
  }, []);
  async function change(body: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await api<TeamInfo>('/api/team', body);
      if (d.inviteUrl) setInvite(d.inviteUrl);
      await refresh();
      const w = await api<{ workspace: Workspace }>('/api/workspace');
      onWorkspace(w.workspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead eyebrow="BROKERAGE CONTINUITY" title="A shared workspace. Clear responsibilities.">
        Give each colleague the access their work requires. Preserve the same source and decision history.
      </PageHead>
      <Note error={error} />
      <section className="panel">
        <div className="panel-heading">
          <h2>{workspace.settings.organization}</h2>
          <span className="badge">
            {team?.members.length || 1} / {team?.seatLimit || 1} seats
          </span>
        </div>
        {team?.members.map(m => (
          <div className="member-row" key={m.id}>
            <span className="initials">{m.name[0]}</span>
            <div>
              <strong>{m.name}</strong>
              <small>{m.email}</small>
            </div>
            {m.id === user.id ? (
              <span className="badge green">{m.role} · you</span>
            ) : (
              <label className="member-role">
                <span className="sr-only">Role for {m.name}</span>
                <select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  disabled={user.role !== 'owner' || busy}
                  onChange={e => void change({ action: 'setRole', userId: m.id, role: e.target.value })}
                >
                  <option value="agent">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
            )}
          </div>
        ))}
      </section>
      <div className="settings-grid section-space">
        <section className="panel">
          <h2>Invite a colleague</h2>
          <p className="body-note">
            An invitation reserves a seat and carries a one-time, expiring token. Share the invitation yourself. No
            email is sent.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              void change({ action: 'invite', ...f });
            }}
          >
            <label>
              Work email
              <input name="email" type="email" required />
            </label>
            <label>
              Workspace role
              <select name="role">
                <option value="agent">Agent · create and review work</option>
                <option value="viewer">Viewer · inspect and export</option>
              </select>
            </label>
            <button className="button primary" disabled={busy || user.role !== 'owner'}>
              <Plus size={16} />
              Create invitation
            </button>
          </form>
          {invite && (
            <div className="invite-result" role="status">
              <strong>Invitation ready to share</strong>
              <input aria-label="Invitation link" readOnly value={invite} />
              <button className="button small" onClick={() => void navigator.clipboard.writeText(invite)}>
                <Copy size={13} />
                Copy link
              </button>
            </div>
          )}
          <p className="fine">
            Existing accounts are never silently moved into another tenant. Free has one seat; team capacity depends on
            your configured subscription.
          </p>
        </section>
        <section className="panel">
          <h2>Pending invitations</h2>
          {team?.invites.map(i => (
            <div className="integration-row" key={i.id}>
              <span>
                {i.email}
                <br />
                <small>Expires {day(i.expiresAt || i.expires_at)}</small>
              </span>
              <span className="badge">{i.role}</span>
            </div>
          ))}
          {!team?.invites.length && <p className="body-note">No pending invitations.</p>}
          <h4>Permissions you can explain</h4>
          <p className="body-note">
            Owners administer billing, retention, and membership. Agents can create and approve workflow decisions.
            Viewers inspect authorized records. Data permissions are enforced separately from team role and plan.
          </p>
        </section>
      </div>
    </>
  );
}

export type FabricInfo = {
  workspace: Workspace;
  fabric: FabricState;
  regions: RegionConfig[];
  coverage: RegionCoverage[];
  access: SourceAccess[];
  selectedRegion: RegionConfig;
};
export function FabricView({ workspace, user, onWorkspace, onRegion }: Props) {
  const [info, setInfo] = useState<FabricInfo | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<FabricInfo>('/api/fabric')
      .then(d => {
        setInfo(d);
        onWorkspace(d.workspace);
      })
      .catch(e => setError(e.message));
  }, []);
  async function action(body: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await api<FabricInfo>('/api/fabric', body);
      setInfo(d);
      onWorkspace(d.workspace);
      if (d.fabric.selectedRegionId) onRegion?.(d.fabric.selectedRegionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fabric = info?.fabric || workspace.fabric;
  return (
    <>
      <PageHead eyebrow="NATIONAL PROPERTY INTELLIGENCE FABRIC" title="One engine. More places to understand.">
        Add jurisdictions through source mapping and regional configuration. Data rights never become a geographic
        assumption.
      </PageHead>
      <Note error={error} />
      <div className="coverage-grid">
        {info?.regions.map(r => {
          const c = info.coverage.find(c => c.regionId === r.id);
          return (
            <article className="panel coverage-card" key={r.id}>
              <Globe2 size={28} />
              <span className="badge peach">Synthetic reference market</span>
              <h2>{r.name}</h2>
              <p>{r.description}</p>
              <div className="coverage-stats">
                <div>
                  <strong>{c?.records || 0}</strong>
                  <span>canonical records</span>
                </div>
                <div>
                  <strong>{c?.projectable || 0}</strong>
                  <span>research-ready</span>
                </div>
                <div>
                  <strong>{c?.closedSales || 0}</strong>
                  <span>closed-sale records</span>
                </div>
              </div>
              <div className="capability-chips">
                <span className={`badge ${c?.capabilities.propertyResearch ? 'green' : ''}`}>
                  Property research {c?.capabilities.propertyResearch ? '✓' : 'unavailable'}
                </span>
                <span className={`badge ${c?.capabilities.cma ? 'green' : ''}`}>
                  CMA {c?.capabilities.cma ? '✓' : 'insufficient data'}
                </span>
                <span className="badge">
                  Licensed feed: {c?.capabilities.licensedFeed ? 'authorized' : 'not connected'}
                </span>
              </div>
              <ul className="caution-list">
                {c?.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <div className="coverage-actions">
                <button
                  className="button primary"
                  disabled={busy || user.role === 'viewer'}
                  onClick={() => void action({ action: 'selectRegion', regionId: r.id })}
                >
                  {fabric?.selectedRegionId === r.id ? <CheckCircle2 size={15} /> : <ArrowRight size={15} />}Use this
                  market
                </button>
                <button
                  className="button"
                  disabled={busy || user.role === 'viewer'}
                  onClick={() => void action({ action: 'syncDemo', regionId: r.id })}
                >
                  Run demo sync
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">COVERAGE IS EVIDENCE</span>
            <h2>Source freshness & permitted use</h2>
          </div>
          <span className="badge">No nationwide MLS access implied</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source / adapter</th>
                <th>Coverage</th>
                <th>Rights</th>
                <th>Freshness / access</th>
              </tr>
            </thead>
            <tbody>
              {fabric?.sources.map(s => {
                const a = info?.access.find(a => a.sourceId === s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.label}</strong>
                      <small>
                        {s.kind} · {s.adapter} · {s.providerId}
                      </small>
                    </td>
                    <td>{s.regionIds.join(', ')}</td>
                    <td>
                      {s.license.allowedUses.join(', ')}
                      <small>
                        Export {s.license.exportAllowed ? 'permitted' : 'restricted'} · Retention{' '}
                        {s.license.retentionDays} days
                      </small>
                    </td>
                    <td>
                      <span className={`badge ${a?.allowed ? 'green' : 'peach'}`}>
                        {a?.allowed ? 'Available' : 'Restricted'}
                      </span>
                      <small>
                        {a?.freshness.status || 'Unknown freshness'} · {day(s.observedAt)}
                      </small>
                      {a?.reasons.map((r, i) => (
                        <small key={i}>{r}</small>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="fabric-bottom">
        <section className="panel">
          <div className="panel-heading">
            <h2>Ingestion reliability</h2>
            <span className="badge">{fabric?.runs.length || 0} runs</span>
          </div>
          {fabric?.runs
            .slice(-8)
            .reverse()
            .map(r => (
              <div className="ingest-row" key={r.id}>
                <span className={`badge ${r.status === 'success' ? 'green' : 'peach'}`}>{r.status}</span>
                <div>
                  <strong>
                    {r.regionId} · {r.sourceId}
                  </strong>
                  <small>
                    {r.received} received · {r.inserted} inserted · {r.updated} updated · {r.unchanged} unchanged ·{' '}
                    {r.quarantined} quarantined
                  </small>
                  {r.errors.map((e, i) => (
                    <small key={i}>{e}</small>
                  ))}
                </div>
                <small>{day(r.finishedAt)}</small>
              </div>
            ))}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Quality, with the gaps visible</h2>
            <span className="badge">{fabric?.quarantine.length || 0} quarantined</span>
          </div>
          {fabric?.records
            .filter(r => r.missingFields.length > 0)
            .slice(0, 5)
            .map(r => (
              <div className="quality-row" key={r.id}>
                <strong>{r.address || r.id}</strong>
                <span className="badge">Completeness {r.quality.score}%</span>
                <p>Missing: {r.missingFields.join(', ')}</p>
              </div>
            ))}
          <p className="fine">
            Quality is a transparent completeness heuristic, not verified accuracy. Ambiguous identities are
            quarantined. Missing facts never become fabricated zeros for valuation.
          </p>
        </section>
      </div>
    </>
  );
}

export function InviteAccept({ token, onAccepted }: { token: string; onAccepted: () => Promise<void> }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="opening">
      <section className="panel invite-accept">
        <span className="eyebrow">BROKERAGE INVITATION</span>
        <h1>Keep the work connected.</h1>
        <p>
          Create an account for the email this invitation was issued to. Your team’s records remain inside its private
          workspace.
        </p>
        <Note error={error} />
        <form
          onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('/api/team/accept', { token, ...Object.fromEntries(new FormData(e.currentTarget)) });
              await onAccepted();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Your name
            <input name="name" required minLength={2} autoComplete="name" />
          </label>
          <label>
            Create password
            <input name="password" type="password" required minLength={12} autoComplete="new-password" />
          </label>
          <button className="button primary full" disabled={busy}>
            Accept workspace invitation
            <ArrowRight size={16} />
          </button>
        </form>
        <a href="/" className="text-button">
          Return to sign in
        </a>
      </section>
    </main>
  );
}

type ApiKeyRecord = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};
export function IntegrationKeysView({ workspace, user }: Props) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]),
    [token, setToken] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const enterprise =
    workspace.platform?.plan === 'enterprise' && ['active', 'trialing'].includes(workspace.platform.billing.status);
  useEffect(() => {
    if (user.role !== 'owner') return;
    api<{ keys: ApiKeyRecord[] }>('/api/integrations/keys')
      .then(d => setKeys(d.keys))
      .catch(e => setError(e.message));
  }, [user.role]);
  async function change(body: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await api<{ keys?: ApiKeyRecord[]; token?: string }>('/api/integrations/keys', body);
      if (d.token) setToken(d.token);
      const latest = await api<{ keys: ApiKeyRecord[] }>('/api/integrations/keys');
      setKeys(latest.keys);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel integration-keys section-space">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ENTERPRISE API ACCESS</span>
          <h2>Connect your workflow, with a narrow key.</h2>
        </div>
        <span className="badge">Read-only · source rights enforced</span>
      </div>
      <div className="keys-body">
        <Note error={error} />
        <p className="body-note">
          Enterprise capacity supports scoped property and CMA exports. Each request rechecks the subscription, member
          role, token scope, and source export rights. Keys are shown once and stored only as hashes.
        </p>
        {user.role === 'owner' ? (
          <form
            className="key-form"
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void change({
                action: 'create',
                name: f.get('name'),
                scopes: f.getAll('scopes'),
                expiresInDays: Number(f.get('expiresInDays')),
              });
            }}
          >
            <label>
              Integration name
              <input name="name" required minLength={2} maxLength={100} placeholder="Brokerage reporting service" />
            </label>
            <label>
              Expires in (days)
              <input name="expiresInDays" type="number" min="1" max="90" defaultValue={30} required />
            </label>
            <fieldset>
              <legend>Allowed read scopes</legend>
              <label>
                <input type="checkbox" name="scopes" value="properties:read" defaultChecked />
                Property exports
              </label>
              <label>
                <input type="checkbox" name="scopes" value="cmas:read" />
                CMA exports
              </label>
            </fieldset>
            <button className="button primary" disabled={busy || !enterprise}>
              <Plus size={15} />
              Create API key
            </button>
          </form>
        ) : (
          <p className="fine">Only the organization owner administers integration credentials.</p>
        )}
        {!enterprise && (
          <p className="fine">
            Your current plan keeps all basic workflows available. Creating an integration key requires an active
            enterprise entitlement.
          </p>
        )}
        {token && (
          <div className="invite-result" role="status">
            <strong>Copy this token now. It will not be shown again.</strong>
            <input aria-label="New API token" readOnly value={token} autoComplete="off" />
            <button className="button small" onClick={() => void navigator.clipboard.writeText(token)}>
              <Copy size={13} />
              Copy token
            </button>
            <button className="text-button" onClick={() => setToken('')}>
              Hide token
            </button>
          </div>
        )}
        {keys.map(key => (
          <div className="member-row" key={key.id}>
            <div>
              <strong>{key.name}</strong>
              <small>
                {key.scopes.join(', ')} · Expires {day(key.expiresAt)}
              </small>
            </div>
            {key.revokedAt ? (
              <span className="badge">Revoked</span>
            ) : (
              <button
                className="button small"
                disabled={busy || user.role !== 'owner'}
                onClick={() => void change({ action: 'revoke', id: key.id })}
              >
                Revoke key
              </button>
            )}
          </div>
        ))}
        <p className="fine">
          Use <code>Authorization: Bearer &lt;token&gt;</code> with <code>GET /api/v1/properties</code> or{' '}
          <code>GET /api/v1/cmas</code>. No write scope or action execution is exposed.
        </p>
      </div>
    </section>
  );
}
