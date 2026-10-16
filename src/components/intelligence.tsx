'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  FlaskConical,
  GraduationCap,
  HelpCircle,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import type { Actor, Workspace } from '@/lib/types';
import type {
  DomainRule,
  DomainEvaluation,
  RuleProposal,
  FairHousingInspection,
  Explainability,
  OfferRisk,
} from '@/lib/domain-types';
import type { AcademyTask, TrustTicket, TrustFeedback } from '@/lib/trust-types';
import { analyzeOfferRisks } from '@/lib/offer-risk';
import { effectiveDomainRules } from '@/lib/domain';
type Navigate = 'cma' | 'offers' | 'reports' | 'clients' | 'transactions' | 'domain';
type Props = {
  workspace: Workspace;
  user: Actor;
  onWorkspace: (ws: Workspace) => void;
  propertyId?: string;
  onNavigate?: (page: Navigate) => void;
};
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const json = await response.json().catch(() => ({ error: 'Unexpected server response.' }));
  if (!response.ok) throw new Error(json.error || 'This request could not be completed.');
  return json as T;
}
async function updateWorkspace(set: (ws: Workspace) => void) {
  set((await api<{ workspace: Workspace }>('/api/workspace')).workspace);
}
const date = (s?: string) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Not recorded';
function Head({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
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
function ErrorNote({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="error-box">
      {error}
    </div>
  ) : null;
}
function Explanation({ data }: { data: Explainability }) {
  return (
    <div className="explanation-grid">
      <section>
        <h4>What is known</h4>
        <ul>
          {data.known.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>What was calculated</h4>
        {data.computed.map((c, i) => (
          <p key={i}>
            <strong>
              {c.label}:{' '}
              {typeof c.value === 'number' ? c.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : c.value}
            </strong>
            <small>{c.formula}</small>
          </p>
        ))}
      </section>
      <section>
        <h4>Assumptions</h4>
        <ul>
          {data.assumptions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section>
        <h4>What remains unknown</h4>
        <ul>
          {data.unknowns.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      <section className="professional-decision">
        <ShieldCheck size={18} />
        <div>
          <h4>Your professional decision</h4>
          {data.professionalDecision.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function DomainView({ workspace, user, onWorkspace, propertyId }: Props) {
  type Snapshot = {
    rules: DomainRule[];
    proposals: RuleProposal[];
    evaluations: DomainEvaluation[];
    limitations: string[];
    factCatalog: Record<string, { type: string; meaning: string }>;
  };
  const [info, setInfo] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [safety, setSafety] = useState<FairHousingInspection | null>(null),
    [evaluation, setEvaluation] = useState<DomainEvaluation | null>(null);
  const refresh = () => api<Snapshot>('/api/domain').then(setInfo);
  useEffect(() => {
    refresh().catch(e => setError(e.message));
  }, []);
  async function post(body: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await api<{
        assessment?: FairHousingInspection;
        evaluation?: DomainEvaluation;
        result?: { assessment?: FairHousingInspection; evaluation?: DomainEvaluation };
      }>('/api/domain', body);
      const value = d.result || d;
      if (value.assessment) setSafety(value.assessment);
      if (value.evaluation) setEvaluation(value.evaluation);
      await refresh();
      await updateWorkspace(onWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = evaluation || info?.evaluations[0];
  return (
    <>
      <Head eyebrow="DOMAIN INTELLIGENCE" title="Make professional judgment inspectable.">
        Versioned practices, explicit evidence, contextual safeguards, and independent review.
      </Head>
      <ErrorNote error={error} />
      <div className="intelligence-notice">
        <ShieldCheck size={19} />
        <p>
          Built-in rules are unreviewed analyst practices. They are not jurisdictional law, verified contract terms, or
          calibrated risk predictions. Qualified review remains essential.
        </p>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FIVE PARTS OF AN EXPLANATION</span>
            <h2>Review the current pricing decision</h2>
          </div>
          <button
            className="button primary"
            disabled={busy || user.role === 'viewer'}
            onClick={() => void post({ action: 'evaluate', context: 'cma', propertyId })}
          >
            <FlaskConical size={16} />
            Evaluate current CMA
          </button>
        </div>
        {current ? (
          <>
            <div className="evaluation-heading">
              <span className="badge">
                {current.regionId} · {current.context}
              </span>
              <small>
                {date(current.at)} · {current.findings.filter(f => f.state === 'triggered').length} review signals
              </small>
            </div>
            <Explanation data={current.explainability} />
            {current.findings
              .filter(f => f.state !== 'not-triggered')
              .map((f, i) => (
                <div className="rule-finding" key={i}>
                  <span className={`badge ${f.state === 'triggered' ? 'peach' : ''}`}>{f.state}</span>
                  <div>
                    <strong>{f.title}</strong>
                    <p>{f.explanation}</p>
                    <small>
                      {f.ruleId} · v{f.ruleVersion} · {f.approvalStatus} · {f.classification}
                    </small>
                  </div>
                </div>
              ))}
          </>
        ) : (
          <p className="panel-body-note">
            Run a review to separate facts, calculations, assumptions, unknowns, and the decision that remains yours.
          </p>
        )}
      </section>
      <div className="settings-grid section-space">
        <section className="panel">
          <h2>Contextual Fair Housing review</h2>
          <p className="body-note">
            Review a search, client message, or advertisement before using it. The policy checks purpose, protected
            traits, proxies, steering, and accommodation context. It cannot guarantee compliance.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({ action: 'checkSafety', text: f.get('text'), surface: f.get('surface') });
            }}
          >
            <label>
              Intended use
              <select name="surface">
                <option value="advertising">Housing advertisement</option>
                <option value="client-communication">Client communication</option>
                <option value="search">Property search</option>
                <option value="client-preferences">Client preferences</option>
              </select>
            </label>
            <label>
              Text to review
              <textarea
                name="text"
                required
                maxLength={4000}
                placeholder="Describe property features and objective needs. Do not enter private client information."
              />
            </label>
            <button className="button" disabled={busy || user.role === 'viewer'}>
              <ShieldCheck size={16} />
              Inspect context
            </button>
          </form>
          {safety && (
            <div className={`safety-result ${safety.decision}`} role="status">
              <span className="badge">
                {safety.decision === 'allow'
                  ? 'No issue detected'
                  : safety.decision === 'review'
                    ? 'Hold for qualified review'
                    : 'Do not use this content'}
              </span>
              <p>{safety.explanation}</p>
              {safety.findings.map((f, i) => (
                <p key={i}>
                  <strong>{f.layer}: </strong>
                  {f.reason}
                </p>
              ))}
              <small>Policy {safety.policyVersion} · No legal certification implied.</small>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Propose a professional practice</h2>
          <p className="body-note">
            Proposals enter a private review queue. They cannot change authoritative logic until test cases and
            independent qualifications are validated.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                fact = String(f.get('fact')),
                kind = info?.factCatalog[fact]?.type,
                value =
                  kind === 'number'
                    ? Number(f.get('value'))
                    : kind === 'boolean'
                      ? String(f.get('value')).toLowerCase() === 'true'
                      : String(f.get('value'));
              void post({
                action: 'proposePractice',
                title: f.get('title'),
                jurisdiction: f.get('jurisdiction'),
                fact,
                operator: f.get('operator'),
                value,
                evidenceUrl: f.get('evidenceUrl'),
                exceptions: [],
              });
            }}
          >
            <label>
              Practice title
              <input name="title" required minLength={3} maxLength={150} />
            </label>
            <label>
              Jurisdiction
              <select name="jurisdiction">
                <option value="dmv">Washington area · DMV</option>
                <option value="austin">Austin · Texas</option>
              </select>
            </label>
            <label>
              Evidence fact
              <select name="fact">
                {Object.entries(info?.factCatalog || {}).map(([key, v]) => (
                  <option key={key} value={key}>
                    {v.meaning}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Condition
                <select name="operator">
                  <option value="gt">Greater than</option>
                  <option value="lt">Less than</option>
                  <option value="eq">Equals</option>
                </select>
              </label>
              <label>
                Value
                <input name="value" required placeholder="Number, true/false, or recorded value" />
              </label>
            </div>
            <label>
              Supporting evidence URL
              <input
                name="evidenceUrl"
                type="url"
                required
                placeholder="https://authoritative-or-professional-source…"
              />
            </label>
            <button className="button" disabled={busy || user.role === 'viewer'}>
              <Plus size={16} />
              Submit a pending practice
            </button>
          </form>
        </section>
      </div>
      <section className="panel section-space">
        <div className="panel-heading">
          <h2>Knowledge registry</h2>
          <span className="badge">
            {info?.rules.length || 0} practices · {info?.proposals.length || 0} proposals
          </span>
        </div>
        {info?.proposals.map(p => (
          <div className="rule-finding" key={p.id}>
            <span className={`badge ${p.status === 'approved' ? 'green' : 'peach'}`}>{p.status}</span>
            <div>
              <strong>{p.rule.title}</strong>
              <p>{p.rule.explanation}</p>
              <small>
                v{p.rule.version} · {p.testResult.total} test cases ·{' '}
                {p.testResult.passed ? 'Tests passed' : 'Validation required'} · Review is independent of submission.
              </small>
            </div>
          </div>
        ))}
        {info?.rules.map(r => (
          <details className="rule-record" key={`${r.id}-${r.version}`}>
            <summary>
              <span>{r.title}</span>
              <span className="badge">
                {r.classification} · {r.approval.status} · v{r.version}
              </span>
            </summary>
            <p>{r.explanation}</p>
            <small>
              Applies: {r.regionIds.join(', ')} · Effective {date(r.effectiveFrom)}
              {r.effectiveTo ? ` through ${date(r.effectiveTo)}` : ''}
            </small>
            <h4>Evidence and exceptions</h4>
            {r.evidence.map(e => (
              <p key={e.id}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {e.label}
                    <ArrowUpRight size={12} />
                  </a>
                ) : (
                  e.label
                )}
              </p>
            ))}
            <p>
              {r.exceptions.length
                ? r.exceptions.map(e => e.label).join('; ')
                : 'No encoded exceptions; unknown contractual or jurisdictional exceptions require review.'}
            </p>
            <p>
              <strong>Professional decision: </strong>
              {r.professionalDecision}
            </p>
          </details>
        ))}
        <ul className="caution-list">
          {info?.limitations.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function OfferDomainPanel({ workspace, propertyId }: { workspace: Workspace; propertyId?: string }) {
  const [perspective, setPerspective] = useState<'seller' | 'buyer'>('seller');
  const offers = workspace.offers.filter(o => o.propertyId === propertyId),
    risks = analyzeOfferRisks(offers, {
      perspective,
      regionId: workspace.fabric?.selectedRegionId || 'austin',
      asOf: workspace.mode === 'demo' ? workspace.asOf : new Date().toISOString(),
      rules: effectiveDomainRules(workspace.domain),
    });
  return (
    <section className="panel section-space">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">INTERACTING TERMS, WITHOUT A UNIVERSAL SCORE</span>
          <h2>Offer risk & professional tradeoffs</h2>
        </div>
        <label>
          <span className="sr-only">Represented party</span>
          <select
            aria-label="Represented party"
            value={perspective}
            onChange={e => setPerspective(e.target.value as 'seller' | 'buyer')}
          >
            <option value="seller">Seller perspective</option>
            <option value="buyer">Buyer perspective</option>
          </select>
        </label>
      </div>
      {risks.map((risk: OfferRisk) => (
        <details className="rule-record" key={risk.offerId}>
          <summary>
            <span>{offers.find(o => o.id === risk.offerId)?.buyer}</span>
            <span className="badge peach">
              {risk.findings.filter(f => f.state === 'triggered').length} review signals
            </span>
          </summary>
          {risk.findings
            .filter(f => f.state === 'triggered')
            .map(f => (
              <div className="rule-finding" key={f.ruleId}>
                <div>
                  <strong>{f.title}</strong>
                  <p>{f.explanation}</p>
                  <small>
                    {f.approvalStatus} {f.classification} · v{f.ruleVersion}
                  </small>
                </div>
              </div>
            ))}
          <Explanation data={risk.explainability} />
        </details>
      ))}
      <p className="panel-body-note">
        Contingency descriptions are recorded terms, not verified legal extraction. Missing protection is treated as
        unknown. No closing probability, deposit forfeiture, or automated winner is inferred.
      </p>
    </section>
  );
}

export function AcademyView({ workspace, user, onWorkspace, onNavigate }: Props) {
  type Snapshot = {
    academy: AcademyTask[];
    tickets: TrustTicket[];
    feedback: TrustFeedback[];
    service: { externalExperts: boolean; trainingScheduling: boolean; note?: string };
  };
  const [info, setInfo] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [breakdown, setBreakdown] = useState<{
      comps: { propertyId: string; adjustedPrice: number }[];
      excluded: { propertyId: string; reason: string }[];
      warnings: string[];
    } | null>(null);
  const refresh = () => api<Snapshot>('/api/trust').then(setInfo);
  useEffect(() => {
    refresh().catch(e => setError(e.message));
  }, []);
  async function post(body: unknown) {
    setBusy(true);
    setError('');
    try {
      const d = await api<{ result?: { result?: typeof breakdown }; comps?: never }>('/api/trust', body);
      const value = (d.result?.result || d.result) as typeof breakdown;
      if (value && 'comps' in value) setBreakdown(value);
      await refresh();
      await updateWorkspace(onWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const newest =
    workspace.cmas.filter(c => !['cma-01', 'cma-history-01'].includes(c.id)).at(-1) || workspace.cmas.at(-1);
  function taskAction(t: AcademyTask) {
    if (t.nextAction === 'inspectCma' && newest) {
      void post({ action: 'inspectCma', cmaId: newest.id });
      return;
    }
    if (t.nextAction === 'report' && newest) {
      window.open(`/api/trust/report?cmaId=${encodeURIComponent(newest.id)}`, '_blank', 'noopener,noreferrer');
      setTimeout(() => void refresh(), 1000);
      return;
    }
    onNavigate?.(t.nextAction.includes('offer') ? 'offers' : 'cma');
  }
  return (
    <>
      <Head eyebrow="PROFESSIONAL TRUST & ACADEMY" title="Learn by doing the work.">
        Practical tasks, visible evidence, and human review requests without invented expertise or guarantees.
      </Head>
      <ErrorNote error={error} />
      <div className="academy-progress">
        <GraduationCap size={23} />
        <div>
          <strong>
            {info?.academy.filter(t => t.complete).length || 0} of {info?.academy.length || 5} practical tasks evidenced
          </strong>
          <p>
            Progress comes from real saved work and recorded actions. Bundled sample records do not complete your
            training.
          </p>
        </div>
        <button className="button small" onClick={() => void refresh()}>
          Refresh progress
        </button>
      </div>
      <div className="academy-grid">
        {info?.academy.map((t, i) => (
          <article className="panel academy-task" key={t.id}>
            <span className="task-order">
              {t.complete ? <CheckCircle2 size={24} /> : String(i + 1).padStart(2, '0')}
            </span>
            <span className={`badge ${t.complete ? 'green' : ''}`}>
              {t.complete ? 'Evidence recorded' : 'Ready to practice'}
            </span>
            <h2>{t.title}</h2>
            <p>{t.description}</p>
            {t.evidenceIds.length > 0 && <small>Evidence: {t.evidenceIds.slice(0, 2).join(', ')}</small>}
            <button className="button" disabled={busy} onClick={() => taskAction(t)}>
              {t.complete ? 'Inspect the workflow' : 'Open the working task'}
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {breakdown && (
        <section className="panel section-space">
          <div className="panel-heading">
            <h2>Your saved evidence breakdown</h2>
            <span className="badge">
              {breakdown.comps.length} admitted · {breakdown.excluded.length} excluded
            </span>
          </div>
          {breakdown.excluded.map((c, i) => (
            <div className="rule-finding" key={i}>
              <div>
                <strong>{workspace.properties.find(p => p.id === c.propertyId)?.address || c.propertyId}</strong>
                <p>{c.reason}</p>
              </div>
            </div>
          ))}
          <ul className="caution-list">
            {breakdown.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="settings-grid section-space">
        <section className="panel">
          <h2>Ask for help, with context</h2>
          <p className="body-note">
            Requests are saved privately. No expert roster, training slot, response time, or external delivery is
            implied.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({
                action: 'requestSupport',
                title: f.get('title'),
                category: f.get('category'),
                message: f.get('message') || undefined,
                context: {},
              });
            }}
          >
            <label>
              What is getting in the way?
              <input name="title" required maxLength={150} />
            </label>
            <label>
              Category
              <select name="category">
                <option value="workflow">Workflow</option>
                <option value="data">Data evidence</option>
                <option value="account">Account</option>
                <option value="migration">Migration</option>
              </select>
            </label>
            <label>
              Details (optional)
              <textarea
                name="message"
                maxLength={2000}
                placeholder="Keep private client details out of support text. Link the existing workflow instead."
              />
            </label>
            <button className="button primary" disabled={busy || user.role === 'viewer'}>
              <HelpCircle size={16} />
              Open a support request
            </button>
          </form>
          <div className="review-actions">
            <button
              className="button"
              disabled={busy || !newest || user.role === 'viewer'}
              onClick={() =>
                void post({
                  action: 'requestReview',
                  context: { cmaId: newest?.id },
                  question: 'Please independently review the frozen evidence, assumptions, and uncertainty.',
                })
              }
            >
              Request professional CMA review
            </button>
            <button
              className="text-button"
              disabled={busy || user.role === 'viewer'}
              onClick={() => void post({ action: 'requestTraining', topic: 'pricing' })}
            >
              Request brokerage training
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>Was the work useful?</h2>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({
                action: 'feedback',
                target: f.get('target'),
                usefulness: Number(f.get('usefulness')),
                reasonCode: f.get('reasonCode'),
                context: {},
              });
            }}
          >
            <label>
              Workflow
              <select name="target">
                <option value="academy">Academy</option>
                <option value="assistant">Assistant</option>
                <option value="report">Client report</option>
                <option value="support">Support</option>
              </select>
            </label>
            <label>
              Usefulness
              <select name="usefulness">
                <option value="5">5 · Very useful</option>
                <option value="4">4 · Useful</option>
                <option value="3">3 · Mixed</option>
                <option value="2">2 · Limited</option>
                <option value="1">1 · Not useful</option>
              </select>
            </label>
            <label>
              Why?
              <select name="reasonCode">
                <option value="clear">Clear</option>
                <option value="actionable">Actionable</option>
                <option value="missing-evidence">Missing evidence</option>
                <option value="confusing">Confusing</option>
                <option value="not-relevant">Not relevant</option>
              </select>
            </label>
            <button className="button" disabled={busy || user.role === 'viewer'}>
              Record structured feedback
            </button>
          </form>
          <p className="fine">
            No customer names, addresses, or message contents are needed to evaluate usefulness. Expert agreement and
            sustained retention remain unmeasured.
          </p>
        </section>
      </div>
      <section className="panel section-space">
        <div className="panel-heading">
          <h2>Requests with visible status</h2>
          <span className="badge">{info?.tickets.length || 0} requests</span>
        </div>
        {info?.tickets.map(t => (
          <div className="ticket-row" key={t.id}>
            <div>
              <span className={`badge ${t.status === 'resolved' ? 'green' : 'peach'}`}>{t.status}</span>
              <strong>{t.title}</strong>
              <small>
                {t.kind} · {date(t.createdAt)}
              </small>
              {t.message && <p>{t.message}</p>}
              {t.response && <p className="ticket-response">{t.response}</p>}
              {t.professionalReview && <small>Professional review: {t.professionalReview.status}</small>}
            </div>
            {t.status !== 'resolved' && (
              <button
                className="button small"
                disabled={busy || user.role === 'viewer'}
                onClick={() => void post({ action: 'resolveTicket', id: t.id })}
              >
                Close request
              </button>
            )}
          </div>
        ))}
        {!info?.tickets.length && (
          <p className="panel-body-note">
            No open requests. Human assistance is not configured; requests remain visible for the operator or brokerage
            to arrange.
          </p>
        )}
      </section>
    </>
  );
}

type Preview = {
  id: string;
  kind: string;
  rows: {
    row: number;
    status: string;
    targetId?: string;
    proposed: Record<string, unknown>;
    conflictFields?: string[];
    message?: string;
  }[];
  summary: Record<string, number>;
  baseHash: string;
  expiresAt: string;
};
type Commit = { id: string; kind?: string; at?: string; createdAt?: string; status?: string; previewId?: string };
type MigrationInfo = { previews: Preview[]; commits: Commit[]; documentRefs: unknown[]; policy: unknown };
export function PortabilityView({ workspace, user, onWorkspace }: Props) {
  const [info, setInfo] = useState<MigrationInfo | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [decisions, setDecisions] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [comparison, setComparison] = useState<unknown>(null);
  const refresh = () => api<MigrationInfo>('/api/migration').then(setInfo);
  useEffect(() => {
    refresh().catch(e => setError(e.message));
  }, []);
  async function post(body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const d = await api<{
          preview?: Preview;
          commit?: Commit;
          result?: { preview?: Preview; commit?: Commit; comparison?: unknown };
          comparison?: unknown;
          rolledBack?: unknown;
          preserved?: unknown;
        }>('/api/migration', body),
        value = d.result || d;
      if (value.preview) {
        setPreview(value.preview);
        setDecisions({});
      } else if ('comparison' in value) setComparison(value.comparison);
      else if ((body as { action: string }).action === 'compare') setComparison(value);
      else {
        setMessage(
          (body as { action: string }).action === 'rollback'
            ? 'Rollback evaluated. Later manual changes are preserved.'
            : 'Import committed with audit history.',
        );
        setPreview(null);
      }
      await refresh();
      await updateWorkspace(onWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Head eyebrow="PROFESSIONAL PORTABILITY" title="Try the next chapter without losing the story.">
        Preview authorized records, resolve conflicts, confirm the move, and preserve later work when rolling back.
      </Head>
      <ErrorNote error={error} />
      {message && (
        <div className="intelligence-notice" role="status">
          <CheckCircle2 size={18} />
          <p>{message}</p>
        </div>
      )}
      <div className="settings-grid">
        <section className="panel">
          <h2>Preview an authorized CSV import</h2>
          <p className="body-note">
            Import only data you have rights to transfer. MLS property records are not accepted here. Documents stay in
            the existing private vault; document imports link already uploaded IDs.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                rawMapping = String(f.get('mapping') || '').trim();
              try {
                void post({
                  action: 'preview',
                  kind: f.get('kind'),
                  csv: f.get('csv'),
                  sourceName: f.get('sourceName'),
                  mapping: rawMapping ? JSON.parse(rawMapping) : undefined,
                  attestation: { authorized: f.get('authorized') === 'on', noMls: f.get('noMls') === 'on' },
                });
              } catch {
                setError('Field mapping must be a JSON object mapping target fields to CSV headers.');
              }
            }}
          >
            <label>
              Record type
              <select name="kind">
                <option value="contacts">Contacts & preferences</option>
                <option value="preferences">Preferences for existing contacts</option>
                <option value="searches">Saved searches</option>
                <option value="milestones">Transaction milestones</option>
                <option value="notes">Relationship notes</option>
                <option value="documentRefs">Private document references</option>
              </select>
            </label>
            <label>
              Source name
              <input name="sourceName" required maxLength={150} placeholder="My authorized brokerage CSV export" />
            </label>
            <label>
              CSV content
              <textarea
                name="csv"
                required
                className="csv-input"
                defaultValue={
                  'name,email,stage,budget,preferences\nSample Import,sample@example.invalid,active,750000,"Three bedrooms, flexible closing"'
                }
                maxLength={200000}
              />
            </label>
            <details className="mapping-details">
              <summary>Map different source headers</summary>
              <label>
                Target field to source header (JSON)
                <textarea name="mapping" placeholder={'{"name":"Full Name","email":"Email Address"}'} />
              </label>
              <p className="fine">
                Matching target headers need no mapping. This maps available exports; it does not assume compatibility
                with any vendor.
              </p>
            </details>
            <label className="check-label">
              <input type="checkbox" name="authorized" required />I am authorized to transfer these records.
            </label>
            <label className="check-label">
              <input type="checkbox" name="noMls" required />
              This import contains no restricted MLS-derived property data.
            </label>
            <button className="button primary" disabled={busy || user.role === 'viewer'}>
              <Upload size={16} />
              Validate & preview
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Parallel adoption, with easy portability</h2>
          <p className="body-note">
            Your current tool can remain in place while you try Ascent with sample or authorized records. No source
            platform is contacted and nothing is deleted from another service.
          </p>
          <div className="portability-steps">
            <p>
              <strong>1. Preview.</strong> See exactly which fields would be created, skipped, or changed.
            </p>
            <p>
              <strong>2. Resolve.</strong> Choose how to handle each conflict. A changed target invalidates the old
              preview.
            </p>
            <p>
              <strong>3. Confirm.</strong> Consent applies to this exact preview and dataset hash.
            </p>
            <p>
              <strong>4. Evaluate.</strong> Use the same frozen evidence for comparable pricing scenarios.
            </p>
            <p>
              <strong>5. Leave freely.</strong> Export standard records or roll back eligible import changes.
            </p>
          </div>
          <a className="button full" href="/api/migration/export?format=json">
            <Download size={16} />
            Download authorized workspace JSON
          </a>
          <a className="button full section-space" href="/api/migration/export?format=csv">
            <Download size={16} />
            Download portable contact CSV
          </a>
          <p className="fine">
            Exports omit credentials and respect current source rights. CSV protects spreadsheet formula cells. Private
            file bytes remain available through authenticated vault downloads.
          </p>
        </section>
      </div>
      {preview && (
        <section className="panel section-space">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">EXPLICIT CONFIRMATION</span>
              <h2>Review this exact import</h2>
            </div>
            <span className="badge">Expires {date(preview.expiresAt)}</span>
          </div>
          <div className="preview-summary">
            {Object.entries(preview.summary).map(([key, value]) => (
              <span key={key}>
                <strong>{value}</strong>
                {key}
              </span>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Row / status</th>
                  <th>Proposed fields</th>
                  <th>Validation / conflict</th>
                  <th>Your decision</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(row => (
                  <tr key={row.row}>
                    <td>
                      Row {row.row}
                      <small>{row.status}</small>
                    </td>
                    <td>
                      {Object.entries(row.proposed || {}).map(([key, val]) => (
                        <p key={key}>
                          <strong>{key}: </strong>
                          {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                        </p>
                      ))}
                    </td>
                    <td>{row.message || row.conflictFields?.join(', ') || 'Validated'}</td>
                    <td>
                      {row.status === 'conflict' ? (
                        <select
                          aria-label={`Decision for row ${row.row}`}
                          value={decisions[row.row] || ''}
                          onChange={e => setDecisions(s => ({ ...s, [row.row]: e.target.value }))}
                        >
                          <option value="">Choose explicitly…</option>
                          <option value="skip">Keep existing record</option>
                          <option value="update">Apply previewed changes</option>
                        </select>
                      ) : (
                        <span className="badge">{row.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="preview-confirm">
            <p>
              Confirm only after reviewing every proposed field. Later manual changes are protected during rollback.
            </p>
            <button
              className="button primary"
              disabled={
                busy ||
                user.role === 'viewer' ||
                preview.rows.some(row => row.status === 'conflict' && !decisions[row.row])
              }
              onClick={() =>
                void post({
                  action: 'commit',
                  previewId: preview.id,
                  baseHash: preview.baseHash,
                  consent: true,
                  decisions,
                })
              }
            >
              <Check size={16} />
              Confirm this import
            </button>
          </div>
        </section>
      )}
      <div className="settings-grid section-space">
        <section className="panel">
          <h2>Import history & safe rollback</h2>
          {info?.commits.map(c => (
            <div className="ticket-row" key={c.id}>
              <div>
                <strong>{c.kind || 'Authorized import'}</strong>
                <small>
                  {c.id} · {date(c.at || c.createdAt)} · {c.status || 'committed'}
                </small>
              </div>
              <button
                className="button small"
                disabled={busy || user.role === 'viewer' || c.status === 'rolled-back'}
                onClick={() => void post({ action: 'rollback', commitId: c.id })}
              >
                Evaluate rollback
              </button>
            </div>
          ))}
          {!info?.commits.length && (
            <p className="body-note">
              No imports committed. A preview makes no changes to your contacts or transactions.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Compare the same evidence</h2>
          <p className="body-note">
            This evaluates two declared time-trend assumptions on the same archived CMA dataset. It does not compare
            against Homesolo or claim which forecast is more accurate.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({
                action: 'compare',
                cmaId: f.get('cmaId'),
                baselineAssumptions: { monthlyTrend: Number(f.get('baseline')) },
                candidateAssumptions: { monthlyTrend: Number(f.get('candidate')) },
              });
            }}
          >
            <label>
              Frozen CMA
              <select name="cmaId" required>
                {workspace.cmas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Baseline monthly trend
                <input name="baseline" type="number" step="0.001" min="-0.1" max="0.1" defaultValue={0} required />
              </label>
              <label>
                Candidate monthly trend
                <input name="candidate" type="number" step="0.001" min="-0.1" max="0.1" defaultValue={0.002} required />
              </label>
            </div>
            <button className="button" disabled={busy || !workspace.cmas.length}>
              Compare identical input data
            </button>
          </form>
          {comparison !== null && (
            <pre tabIndex={0} className="comparison-result">
              {JSON.stringify(comparison, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </>
  );
}

type ProductInfo = {
  consent: boolean;
  metrics: {
    feature: string;
    opens: number;
    completedTasks: number;
    timingCount: number;
    totalDurationMs: number;
    errors: Record<string, number>;
  }[];
  flags: { id: string; enabled: boolean; treatmentPercent: number; assignment: string }[];
  priorities: {
    feature: string;
    impact: number;
    confidence: number;
    differentiation: number;
    effort: number;
    score: number;
  }[];
  usage?: { estimatedCostUsd: number };
  note: string;
};
export function ImprovementView({ user, onWorkspace }: Props) {
  const [info, setInfo] = useState<ProductInfo | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const refresh = () => api<ProductInfo>('/api/product').then(setInfo);
  useEffect(() => {
    refresh().catch(e => setError(e.message));
  }, []);
  async function post(body: unknown) {
    setBusy(true);
    setError('');
    try {
      await api('/api/product', body);
      await refresh();
      await updateWorkspace(onWorkspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Head eyebrow="EVIDENCE-DRIVEN IMPROVEMENT" title="Build what the work proves useful.">
        Observe friction, state a hypothesis, evaluate a bounded change, then retain or revert with evidence.
      </Head>
      <ErrorNote error={error} />
      <div className="billing-status">
        <span>
          <ShieldCheck size={16} />
          Privacy-conscious instrumentation: <strong>{info?.consent ? 'Opted in' : 'Off by default'}</strong>
        </span>
        <button
          className="button small"
          disabled={busy || user.role !== 'owner'}
          onClick={() => void post({ action: 'consent', enabled: !info?.consent })}
        >
          {info?.consent ? 'Turn aggregate metrics off' : 'Opt in to aggregate workflow metrics'}
        </button>
        <p>
          No names, addresses, document text, prompts, or communication contents belong in these metrics. An opt-in does
          not establish retention or user value.
        </p>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Observed workflow signals</h2>
          <span className="badge">{info?.metrics.length || 0} feature aggregates</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Opens</th>
                <th>Validated completions</th>
                <th>Timed observations</th>
                <th>Mean recorded duration</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {info?.metrics.map(m => (
                <tr key={m.feature}>
                  <td>{m.feature}</td>
                  <td>{m.opens}</td>
                  <td>{m.completedTasks}</td>
                  <td>{m.timingCount}</td>
                  <td>
                    {m.timingCount ? `${(m.totalDurationMs / m.timingCount / 1000).toFixed(2)} s` : 'Not measured'}
                  </td>
                  <td>{Object.values(m.errors).reduce((a, b) => a + b, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!info?.metrics.length && (
          <p className="panel-body-note">
            No opted-in observations yet. Seed activity, invented time savings, and empty denominators are not results.
          </p>
        )}
      </section>
      <div className="settings-grid section-space">
        <section className="panel">
          <h2>Make prioritization assumptions explicit</h2>
          <p className="body-note">
            Priority = impact × confidence × differentiation ÷ effort. This expresses a judgment; it is not an objective
            ranking or proof of customer impact.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void post({
                action: 'priority',
                feature: f.get('feature'),
                impact: Number(f.get('impact')),
                confidence: Number(f.get('confidence')),
                differentiation: Number(f.get('differentiation')),
                effort: Number(f.get('effort')),
              });
            }}
          >
            <label>
              Workflow
              <select name="feature">
                {[
                  'cma',
                  'clients',
                  'offers',
                  'transactions',
                  'reports',
                  'academy',
                  'migration',
                  'assistant',
                  'fabric',
                ].map(f => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                Expected impact (0–5)
                <input name="impact" type="number" min="0" max="5" step="0.1" defaultValue={3} required />
              </label>
              <label>
                Confidence (0–1)
                <input name="confidence" type="number" min="0" max="1" step="0.1" defaultValue={0.5} required />
              </label>
              <label>
                Differentiation (0–5)
                <input name="differentiation" type="number" min="0" max="5" step="0.1" defaultValue={3} required />
              </label>
              <label>
                Effort (1–10)
                <input name="effort" type="number" min="1" max="10" step="0.1" defaultValue={3} required />
              </label>
            </div>
            <button className="button" disabled={busy || user.role !== 'owner'}>
              Record a prioritization hypothesis
            </button>
          </form>
          {info?.priorities.map((p, i) => (
            <div className="integration-row" key={`${p.feature}-${i}`}>
              <span>{p.feature}</span>
              <strong>{p.score.toFixed(2)} · assumptions only</strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Controlled, reversible variations</h2>
          <p className="body-note">
            Stable tenant assignment supports a bounded rollout. A treatment assignment is not evidence an experiment
            succeeded.
          </p>
          {info?.flags.map(f => (
            <div className="experiment-row" key={f.id}>
              <div>
                <strong>{f.id}</strong>
                <small>
                  Assignment: {f.assignment} · {f.treatmentPercent}% treatment
                </small>
              </div>
              <button
                className="button small"
                disabled={busy || user.role !== 'owner'}
                onClick={() => void post({ action: 'flag', id: f.id, enabled: !f.enabled, treatmentPercent: 50 })}
              >
                {f.enabled ? 'Disable variation' : 'Enable 50% rollout'}
              </button>
            </div>
          ))}
          <div className="intelligence-notice">
            <FlaskConical size={19} />
            <p>
              Pre-register a metric, minimum observation period, exclusions, sample threshold, and guardrails before
              reading results. Human training success, expert agreement, causal time savings, and sustained voluntary
              retention remain unmeasured.
            </p>
          </div>
          <p className="fine">{info?.note}</p>
        </section>
      </div>
    </>
  );
}

type AiInfo = {
  provider: string;
  configured: boolean;
  models: { fast: string; reasoning: string };
  capabilities: unknown;
  privacy: unknown;
  budget: unknown;
  usage: unknown;
  limits: unknown;
};
type AiMetrics = {
  period?: string;
  totals?: Record<string, number>;
  recentEvents?: {
    id: string;
    at: string;
    provider: string;
    model: string;
    task: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    estimatedUsd: number;
    attempts: number;
    retries: number;
    cacheHit: boolean;
    status: string;
    reason: string;
  }[];
  notes?: string[];
};
export function InferenceView() {
  const [info, setInfo] = useState<AiInfo | null>(null),
    [metrics, setMetrics] = useState<AiMetrics | null>(null),
    [error, setError] = useState('');
  async function refresh() {
    try {
      const [s, m] = await Promise.all([api<AiInfo>('/api/ai/status'), api<AiMetrics>('/api/ai/metrics')]);
      setInfo(s);
      setMetrics(m);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <>
      <Head eyebrow="GROQ-FIRST INFERENCE" title="Fast thinking. Accountable economics.">
        Task routing, deterministic calculations, bounded model use, and observable costs.
      </Head>
      <ErrorNote error={error} />
      <div className="access-levels">
        <article className="panel access-step">
          <Sparkles size={25} />
          <h2>Everyday assistance</h2>
          <span className="badge green">GPT-OSS 20B · configurable</span>
          <p>Property summaries, communications, lightweight classification, and structured extraction.</p>
          <code>{info?.models.fast || 'openai/gpt-oss-20b'}</code>
        </article>
        <article className="panel access-step">
          <FlaskConical size={25} />
          <h2>Competing assumptions</h2>
          <span className="badge">GPT-OSS 120B · configurable</span>
          <p>Complex explanations and comparative reasoning over application-controlled, authorized evidence.</p>
          <code>{info?.models.reasoning || 'openai/gpt-oss-120b'}</code>
        </article>
        <article className="panel access-step">
          <ShieldCheck size={25} />
          <h2>Authoritative calculations</h2>
          <span className="badge green">Deterministic application code</span>
          <p>
            Valuations, fees, entitlements, versioned rules, and entered-date mathematics remain outside model judgment.
          </p>
          <strong>No model can approve or execute a transaction.</strong>
        </article>
      </div>
      <div className="billing-status">
        <span>
          Preferred provider: <strong>{info?.provider || 'groq'}</strong> ·{' '}
          {info?.configured ? 'Configured' : 'Evidence mode · no provider configured'}
        </span>
        <button className="button small" onClick={() => void refresh()}>
          Refresh telemetry
        </button>
        <p>
          No live Groq/secondary-provider speed, cost, or quality advantage is claimed without an executed, equivalent
          evaluation.
        </p>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <h2>Privacy & budget policy</h2>
          <h4>Privacy controls</h4>
          <pre tabIndex={0} className="cost-config">
            {JSON.stringify(info?.privacy || { status: 'Loading' }, null, 2)}
          </pre>
          <h4>Daily / monthly spend controls</h4>
          <pre tabIndex={0} className="cost-config">
            {JSON.stringify(info?.budget || { status: 'Loading' }, null, 2)}
          </pre>
          <p className="fine">
            Zero Data Retention must be enabled and permitted in the provider account. An application flag is an
            operator assertion, not verification of Groq settings. Licensed-source model sharing stays blocked.
          </p>
        </section>
        <section className="panel">
          <h2>Observed usage & reliability</h2>
          <pre tabIndex={0} className="cost-config">
            {JSON.stringify(metrics?.totals || { status: 'No provider observations' }, null, 2)}
          </pre>
          <h4>Capability and output limits</h4>
          <pre tabIndex={0} className="cost-config">
            {JSON.stringify(info?.limits || info?.capabilities || {}, null, 2)}
          </pre>
          <p className="fine">
            Token-based estimates are not provider invoices. Mock evaluations test protocol and safety; live inference
            quality requires configured credentials and professional review.
          </p>
        </section>
      </div>
      <section className="panel section-space">
        <div className="panel-heading">
          <h2>Routing & request ledger</h2>
          <span className="badge">Prompts and customer text excluded</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Route / model</th>
                <th>Latency</th>
                <th>Input / output tokens</th>
                <th>Estimated cost</th>
                <th>Retries / cache</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.recentEvents?.map(e => (
                <tr key={e.id}>
                  <td>
                    <strong>
                      {e.provider} · {e.task}
                    </strong>
                    <small>{e.model}</small>
                  </td>
                  <td>{e.latencyMs.toFixed(0)} ms</td>
                  <td>
                    {e.inputTokens} / {e.outputTokens}
                  </td>
                  <td>${e.estimatedUsd.toFixed(6)}</td>
                  <td>
                    {e.retries} retries · {e.cacheHit ? 'cache hit' : 'uncached'}
                  </td>
                  <td>
                    {e.status}
                    <small>{e.reason}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!metrics?.recentEvents?.length && (
          <p className="panel-body-note">
            No measured provider calls in this workspace. Configure a server-side key and an approved budget policy to
            collect real observations.
          </p>
        )}
      </section>
    </>
  );
}
