'use client';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, LoaderCircle, MessageCircleQuestion, Printer } from 'lucide-react';
import { openHtmlReport } from '@/lib/browser-export';
import { condoDefaultState } from '@/lib/dc-condo-studio';
import { DC_CONDITION_MAX, dcDefaultState } from '@/lib/dc-studio';
import { decisionDrivers } from '@/lib/decision-drivers';
import { calculateStudio, studioStateSchema, type StudioEvidence, type StudioState } from '@/lib/demo-studio';
import { buildEvidenceTimeline, type LiveCheck } from '@/lib/evidence-timeline';
import { buildHomeDecisionBrief } from '@/lib/home-decision-brief';
import { MISSING_EVIDENCE } from '@/lib/home-markets';
import type { OsMarket } from '@/lib/home-routes';
import type { FinanceInputs } from '@/lib/homeowner-finance';
import { buildOsBrief, osAnswers, osQuestions, valueContext, type OsInput, type OsQuestion } from '@/lib/homeowner-os';
import { HOME_STORAGE_KEY, parseProfiles, propertyHref, studioStorageKey } from '@/lib/homeowner-passport';
import { marylandDefaultState, MD_GRADE_MAX } from '@/lib/maryland-studio';
import type { OfferComparison, OfferLab } from '@/lib/offer-lab';
import { osBriefHtml } from '@/lib/os-reports';
import type { PropertyFacts } from '@/lib/property-facts';
import type { Observation } from '@/lib/sources/observations';
import type { NearbySale, SourceCheck } from '@/lib/sources/property-check';
import type { CmaAssumptions, Source, ValuationProperty } from '@/lib/types';
import {
  applyCheck,
  checkAllowed,
  parseWatchtower,
  WATCHTOWER_STORAGE_KEY,
  watchKey,
  watchStatus,
  type Watchtower,
} from '@/lib/watchtower';
import { HomeownerWorkbench } from './homeowner-workbench';
import { useAccount } from './os/account';
import { CompareOffers } from './os/compare-offers';
import { MarketWatch } from './os/market-watch';
import { MyProperty } from './os/my-property';
import { readLocal, requestJson, writeLocal } from './os/shared';
import { ShareWithAgent } from './os/share-agent';
import { roomSummary, TransactionRoom, useOwnedRoom } from './os/transaction-room';
import '@/app/pricing-studio.css';
import '@/app/homeowner-os.css';

const MARKETS: Record<OsMarket, { label: string; defaultState: () => StudioState; conditionMax: number }> = {
  dc: { label: 'Washington, DC', defaultState: dcDefaultState, conditionMax: DC_CONDITION_MAX },
  'dc-condos': { label: 'Washington, DC condominium', defaultState: condoDefaultState, conditionMax: DC_CONDITION_MAX },
  maryland: {
    label: 'Montgomery and Prince George’s, Maryland',
    defaultState: marylandDefaultState,
    conditionMax: MD_GRADE_MAX,
  },
};
export const osTabs = ['property', 'market', 'offers', 'decisions', 'room', 'share'] as const;
export type OsTab = (typeof osTabs)[number];
const TAB_LABELS: Record<OsTab, string> = {
  property: 'My Property',
  market: 'Market Watch',
  offers: 'Compare Offers',
  decisions: 'My Decisions',
  room: 'Transaction Room',
  share: 'Share With My Agent',
};
type PropertyPayload = {
  parcelId: string;
  subject: ValuationProperty;
  candidates: ValuationProperty[];
  sources: Source[];
  asOf: string;
  assumptions: CmaAssumptions;
  snapshot: StudioEvidence['snapshot'];
  facts?: PropertyFacts;
  attribution: string;
};
type SourcesResponse = { checkedAt: string; sources: SourceCheck[]; observations: Observation[] };
type NearbyResponse = { radiusMiles: number; after: string; source: SourceCheck; sales: NearbySale[] };

function Workspace({ market, data }: { market: OsMarket; data: PropertyPayload }) {
  const config = MARKETS[market];
  const evidence = useMemo<StudioEvidence>(
    () => ({
      subject: data.subject,
      candidates: data.candidates,
      sources: data.sources,
      asOf: data.asOf,
      snapshot: data.snapshot,
      facts: data.facts,
    }),
    [data],
  );
  const propertyKey = `${market}:${data.parcelId}`;
  const address = data.subject.address;
  const defaultState = useMemo(() => config.defaultState(), [config]);
  const schema = useMemo(
    () =>
      studioStateSchema(
        evidence.candidates.map(p => p.id),
        config.conditionMax,
        !!evidence.subject.roomCountsUnavailable,
        evidence.subject.condition !== undefined,
      ),
    [evidence, config.conditionMax],
  );
  // The same draft the pricing studio keeps for this home, so both pages show one analysis.
  const storageKey = studioStorageKey(evidence.subject);
  const [state, setState] = useState<StudioState>(defaultState);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const saved = readLocal(storageKey, raw => schema.safeParse(JSON.parse(raw)));
    if (saved.error) setNotice('Device storage is unavailable, so drafts are kept only while this tab is open.');
    else if (saved.value?.success) setState(saved.value.data);
    else if (saved.value) setNotice('An older pricing draft could not be restored; the original analysis is shown.');
    setReady(true);
  }, [storageKey, schema]);
  useEffect(() => {
    if (ready) {
      const error = writeLocal(storageKey, state);
      if (error) setNotice(error);
    }
  }, [ready, storageKey, state]);
  const [finance, setFinance] = useState<FinanceInputs | null>(null);
  const deferredFinance = useDeferredValue(finance);
  const result = useMemo(() => {
    try {
      return calculateStudio(evidence, state);
    } catch {
      return null;
    }
  }, [evidence, state]);
  const drivers = useMemo(
    () => (result ? decisionDrivers(result, { conditionMax: config.conditionMax }) : []),
    [result, config.conditionMax],
  );
  const brief = useMemo(
    () => buildHomeDecisionBrief({ evidence, state, result, finance: deferredFinance, drivers }),
    [evidence, state, result, deferredFinance, drivers],
  );
  const value = useMemo(() => valueContext(brief), [brief]);

  const [tab, setTab] = useState<OsTab>('property');
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (osTabs.includes(requested as OsTab)) setTab(requested as OsTab);
  }, []);
  const tabRefs = useRef<Record<OsTab, HTMLButtonElement | null>>({} as Record<OsTab, HTMLButtonElement | null>);
  const choose = (next: OsTab, focus = false) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
    if (focus) tabRefs.current[next]?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = osTabs.indexOf(tab);
    const next =
      event.key === 'ArrowRight'
        ? osTabs[(index + 1) % osTabs.length]
        : event.key === 'ArrowLeft'
          ? osTabs[(index - 1 + osTabs.length) % osTabs.length]
          : event.key === 'Home'
            ? osTabs[0]
            : event.key === 'End'
              ? osTabs.at(-1)!
              : null;
    if (next) {
      event.preventDefault();
      choose(next, true);
    }
  };

  const [watchtower, setWatchtowerState] = useState<Watchtower>(() => parseWatchtower(null));
  const [watchNotice, setWatchNotice] = useState('');
  useEffect(() => {
    const saved = readLocal(WATCHTOWER_STORAGE_KEY, raw => parseWatchtower(raw));
    if (saved.error) setWatchNotice('Watches saved on this device could not be read. They were left as they were.');
    else if (saved.value) setWatchtowerState(saved.value);
  }, []);
  const setWatchtower = useCallback((next: Watchtower) => {
    setWatchtowerState(next);
    setWatchNotice(writeLocal(WATCHTOWER_STORAGE_KEY, next));
  }, []);
  const key = watchKey(market, data.parcelId);
  const watch = watchtower.watches.find(item => item.key === key) ?? null;

  const [live, setLive] = useState<LiveCheck | null>(null);
  const [nearby, setNearby] = useState<NearbyResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const watchRef = useRef(watchtower);
  watchRef.current = watchtower;
  const runCheck = useCallback(async () => {
    setChecking(true);
    setCheckError('');
    const parcel = encodeURIComponent(data.parcelId);
    const current = watchRef.current.watches.find(item => item.key === key) ?? null;
    try {
      const sources = await requestJson<SourcesResponse>(`/api/property/sources?market=${market}&parcel=${parcel}`);
      // A nearby failure leaves the property's own check intact; it is reported, not filled in.
      const near = await requestJson<NearbyResponse>(
        `/api/property/nearby?market=${market}&parcel=${parcel}&radius=${current?.radiusMiles ?? 0.5}`,
      ).catch((error: Error) => {
        setCheckError(`Nearby sales could not be checked: ${error.message}`);
        return null;
      });
      setLive({ checkedAt: sources.checkedAt, sources: sources.sources, observations: sources.observations });
      setNearby(near);
      const state = watchRef.current;
      const now = new Date(sources.checkedAt);
      if (current && checkAllowed(state, current, now).allowed)
        setWatchtower(
          applyCheck(state, key, {
            checkedAt: sources.checkedAt,
            sources: sources.sources,
            observations: sources.observations,
            nearby: near ? { source: near.source, sales: near.sales } : null,
          }).state,
        );
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'The public sources could not be checked.');
    } finally {
      setChecking(false);
    }
  }, [data.parcelId, key, market, setWatchtower]);
  // A due watch is checked when the homeowner opens the home; there is no background process.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (autoChecked.current || !watch) return;
    const now = new Date();
    const status = watchStatus(watch, now);
    if (!watch.paused && !status.nextCheckAfter && checkAllowed(watchtower, watch, now).allowed) {
      autoChecked.current = true;
      void runCheck();
    }
  }, [watch, watchtower, runCheck]);

  const [now] = useState(() => Date.now());
  const timeline = useMemo(
    () => buildEvidenceTimeline({ evidence, parcelId: data.parcelId, live, now }),
    [evidence, data.parcelId, live, now],
  );
  const [offerState, setOfferState] = useState<{ lab: OfferLab | null; comparison: OfferComparison | null }>({
    lab: null,
    comparison: null,
  });
  const onComparison = useCallback(
    (lab: OfferLab | null, comparison: OfferComparison | null) => setOfferState({ lab, comparison }),
    [],
  );
  const account = useAccount();
  const owned = useOwnedRoom(account, propertyKey, address);
  const room = useMemo(() => roomSummary(owned.room), [owned.room]);
  // Re-read on each tab change: the workbench saves versions of this home to the same device storage.
  const saved = useMemo(() => {
    const read = readLocal(HOME_STORAGE_KEY, raw => parseProfiles(raw));
    const profile = read.value?.find(item => item.propertyId === evidence.subject.id);
    return profile?.snapshots.at(-1) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence.subject.id, tab]);
  const events = watchtower.events.filter(event => event.watchKey === key);
  const osInput: OsInput = {
    brief,
    timeline,
    lab: offerState.lab,
    offers: offerState.comparison,
    watch: watch ? { status: watchStatus(watch, new Date(now)), events } : null,
    room,
    saved,
    current: {
      valuationHash: brief.references.valuationHash,
      financeHash: brief.references.financeHash,
      salesSha256: evidence.snapshot?.salesSha256 ?? null,
    },
    now,
  };
  const os = buildOsBrief(osInput);
  const answers = osAnswers(osInput, os);
  const [question, setQuestion] = useState<OsQuestion | null>(null);
  const unread = events.filter(event => !event.read).length;
  const today = new Date(now).toISOString().slice(0, 10);
  const summary = [
    { key: 'know', title: 'What we know', items: os.know },
    { key: 'how', title: 'How we know it', items: os.how },
    { key: 'missing', title: 'What is missing', items: os.missing },
    { key: 'next', title: 'What to do next', items: os.next },
  ] as const;
  return (
    <div className="studio-page os-page">
      <a className="skip-link" href="#os-main">
        Skip to the homeowner workspace
      </a>
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">HOMEOWNER OS</span>
        <Link href="/home" className="button small">
          <ArrowLeft size={15} aria-hidden="true" /> My homes
        </Link>
      </header>
      <main id="os-main" className="os-main">
        <section className="os-hero" aria-labelledby="os-title">
          <span className="eyebrow">{config.label.toUpperCase()}</span>
          <h1 id="os-title">{address}</h1>
          <p className="os-verdict" data-verdict={brief.value.verdict} data-testid="os-verdict">
            <strong>{brief.value.label}.</strong> {brief.value.answer}
          </p>
          {notice && <p className="fine">{notice}</p>}
          {watchNotice && (
            <p className="error-box" role="alert">
              {watchNotice}
            </p>
          )}
        </section>
        <section className="os-summary" aria-label="Summary">
          {summary.map(block => (
            <details key={block.key} className="os-summary-card" open={block.key === 'next' || block.key === 'missing'}>
              <summary>
                <span>{block.title}</span> <span className="os-count">{block.items.length}</span>
              </summary>
              <ul>
                {block.items.slice(0, 6).map(item => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
              {block.items.length > 6 && <p className="fine">{block.items.length - 6} more in the printable brief.</p>}
            </details>
          ))}
        </section>
        <section className="os-ask" aria-labelledby="os-ask-title">
          <h2 id="os-ask-title">
            <MessageCircleQuestion size={18} aria-hidden="true" /> Ask Ascent
          </h2>
          <p className="fine">Answers are assembled from this home’s records and your entries. No AI model is used.</p>
          <div className="os-questions">
            {osQuestions.map(item => (
              <button
                key={item}
                type="button"
                className="button small"
                aria-pressed={question === item}
                onClick={() => setQuestion(current => (current === item ? null : item))}
              >
                {answers[item].label}
              </button>
            ))}
          </div>
          <div aria-live="polite">
            {question && (
              <div className="os-answer" data-testid="os-answer">
                <p>{answers[question].text}</p>
                {answers[question].refs.length > 0 && <small>From: {answers[question].refs.join(' · ')}</small>}
              </div>
            )}
          </div>
          <button type="button" className="button small" onClick={() => openHtmlReport(osBriefHtml(os, new Date()))}>
            <Printer size={15} aria-hidden="true" /> Printable decision brief
          </button>
        </section>
        <div className="os-tabs" role="tablist" aria-label="Homeowner workspace">
          {osTabs.map(item => (
            <button
              key={item}
              ref={element => {
                tabRefs.current[item] = element;
              }}
              id={`os-tab-${item}`}
              type="button"
              role="tab"
              aria-selected={tab === item}
              aria-controls={`os-panel-${item}`}
              tabIndex={tab === item ? 0 : -1}
              onClick={() => choose(item)}
              onKeyDown={onTabKey}
            >
              {TAB_LABELS[item]}
              {item === 'market' && unread > 0 && (
                <span className="os-badge" aria-label={`${unread} new notifications`}>
                  {unread}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* Panels stay mounted so entries in one tab survive switching to another. */}
        {osTabs.map(item => (
          <div
            key={item}
            id={`os-panel-${item}`}
            role="tabpanel"
            aria-labelledby={`os-tab-${item}`}
            hidden={tab !== item}
            tabIndex={0}
            className="os-tabpanel"
          >
            {item === 'property' && (
              <MyProperty
                brief={brief}
                timeline={timeline}
                checking={checking}
                checkError={checkError}
                onCheck={() => void runCheck()}
                studioHref={propertyHref(evidence.subject)}
              />
            )}
            {item === 'market' && (
              <MarketWatch
                home={{ market, parcelId: data.parcelId, address }}
                watchtower={watchtower}
                onChange={setWatchtower}
                onCheck={() => void runCheck()}
                checking={checking}
                observations={live?.observations ?? []}
                nearby={nearby}
                now={new Date()}
              />
            )}
            {item === 'offers' && (
              <CompareOffers
                propertyKey={propertyKey}
                address={address}
                value={value}
                defaults={{
                  commissionPercent: state.commissionPercent,
                  closingPercent: state.closingPercent,
                  payoff: state.payoff,
                }}
                today={today}
                onComparison={onComparison}
              />
            )}
            {item === 'decisions' && (
              <HomeownerWorkbench
                evidence={evidence}
                state={state}
                result={result}
                valueStated={value.estimate !== null}
                brief={brief}
                onFinanceChange={setFinance}
                onStudioChange={patch => setState(current => ({ ...current, ...patch }))}
                missingEvidence={MISSING_EVIDENCE[market]}
              />
            )}
            {item === 'room' && (
              <TransactionRoom account={account} owned={owned} brief={brief} offers={offerState.comparison} />
            )}
            {item === 'share' && (
              <ShareWithAgent
                account={account}
                owned={owned}
                packetInput={{ os, brief, timeline, lab: offerState.lab, offers: offerState.comparison, room }}
                onOpenRoom={() => choose('room', true)}
              />
            )}
          </div>
        ))}
      </main>
      <footer className="studio-footer">
        <p className="fine">
          {data.attribution} Ascent is free, works without an account and does not use an AI model for any figure here.
          Not an appraisal, legal review or financial advice.
        </p>
      </footer>
    </div>
  );
}

export function HomeownerOS({ market, parcel }: { market: OsMarket; parcel: string }) {
  const [data, setData] = useState<PropertyPayload | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    requestJson<PropertyPayload>(`/api/${market}/property?parcel=${encodeURIComponent(parcel)}`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message || 'That home could not be loaded.');
      });
    return () => controller.abort();
  }, [market, parcel, retry]);
  if (data) return <Workspace key={data.parcelId} market={market} data={data} />;
  return (
    <div className="studio-page os-page">
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">HOMEOWNER OS</span>
      </header>
      <main id="os-main" className="os-main">
        {error ? (
          <div className="error-box" role="alert">
            <p>{error}</p>
            <button type="button" className="button small" onClick={() => setRetry(value => value + 1)}>
              Retry
            </button>{' '}
            <Link href="/home">Back to my homes</Link>
          </div>
        ) : (
          <p role="status">
            <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading this home’s public records…
          </p>
        )}
      </main>
    </div>
  );
}
