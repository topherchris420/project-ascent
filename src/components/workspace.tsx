'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { ClientIntelligencePanel, SearchCriteriaFields } from './client-intelligence';
import { DocumentDeadlineReview } from './document-deadline-review';
import { evaluateSavedSearch } from '@/lib/client-intelligence';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Command,
  Download,
  GraduationCap,
  FileText,
  GitBranch,
  Home,
  Layers3,
  LayoutDashboard,
  Lightbulb,
  ListFilter,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  Actor,
  Workspace,
  Property,
  CmaResult,
  CmaRecord,
  AssistantResponse,
  Client,
  Transaction,
} from '@/lib/types';
import {
  calculateCma,
  comparableExclusion,
  defaultAssumptions,
  summarizeMarket,
  simulatePricing,
  compareOffers,
  buildDecisionGraph,
  evaluateOutcomes,
} from '@/lib/analytics';
import {
  AccessView,
  BillingView,
  TeamView,
  FabricView,
  InviteAccept,
  IntegrationKeysView,
  type FabricInfo,
} from './adoption';
import { regionalAssumptions, scopeWorkspaceForAccess } from '@/lib/fabric';
import {
  DomainView,
  OfferDomainPanel,
  AcademyView,
  PortabilityView,
  ImprovementView,
  InferenceView,
} from './intelligence';
import { PropertyResearchView } from './property-research';
import { Landing } from './landing';
import {
  ClientPipeline,
  Countdown,
  ListingDescriptionStudio,
  ListingReviewPanel,
  OfferStrengthBoard,
  PricingIntelligence,
  RateSensitivity,
  WeekAgenda,
  clientRoleLabel,
  clientStageLabel,
} from './decision-panels';
import { compact, date, initials, money, number } from './format';
import { clientRoles, clientStages } from '@/lib/types';
import { buildAgenda, type AgendaItem } from '@/lib/agenda';

type Page =
  | 'overview'
  | 'properties'
  | 'cma'
  | 'market'
  | 'clients'
  | 'offers'
  | 'transactions'
  | 'graph'
  | 'learning'
  | 'reports'
  | 'settings'
  | 'fabric'
  | 'access'
  | 'billing'
  | 'team'
  | 'domain'
  | 'academy'
  | 'portability'
  | 'improvement'
  | 'ai';
type Modal = 'client' | 'offer' | 'transaction' | 'search' | 'outcome' | 'milestone' | 'sources' | null;
const nav = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard },
  { page: 'properties', label: 'Properties', icon: Building2 },
  { page: 'cma', label: 'Pricing studio', icon: SlidersHorizontal },
  { page: 'market', label: 'Market pulse', icon: Activity },
  { page: 'clients', label: 'Clients', icon: Users },
  { page: 'offers', label: 'Offer room', icon: Layers3 },
  { page: 'transactions', label: 'Transactions', icon: CheckCircle2 },
  { page: 'reports', label: 'Reports', icon: FileText },
  { page: 'graph', label: 'Decision graph', icon: GitBranch },
  { page: 'learning', label: 'Outcomes lab', icon: TrendingUp },
  { page: 'domain', label: 'Domain intelligence', icon: ShieldCheck },
  { page: 'academy', label: 'Professional academy', icon: BookOpen },
  { page: 'fabric', label: 'National data fabric', icon: MapPin },
  { page: 'access', label: 'Access & verification', icon: ShieldCheck },
  { page: 'billing', label: 'Plans & usage', icon: Wallet },
  { page: 'team', label: 'Brokerage team', icon: Users },
  { page: 'portability', label: 'Import & portability', icon: Download },
  { page: 'improvement', label: 'Improvement lab', icon: Lightbulb },
  { page: 'ai', label: 'AI operations', icon: Sparkles },
] as const;
const navGroups: { id: string; label: string; start: Page; end: Page }[] = [
  { id: 'work', label: 'YOUR WORKSPACE', start: 'overview', end: 'reports' },
  { id: 'insight', label: 'INSIGHT & PRACTICE', start: 'graph', end: 'academy' },
  { id: 'tools', label: 'WORKSPACE TOOLS', start: 'fabric', end: 'ai' },
];
const groupItems = (group: (typeof navGroups)[number]) =>
  nav.slice(
    nav.findIndex(n => n.page === group.start),
    nav.findIndex(n => n.page === group.end) + 1,
  );
async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body instanceof FormData
      ? { method: 'POST', body }
      : body === undefined
        ? {}
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const json = await res.json().catch(() => ({ error: 'The server returned an unexpected response.' }));
  if (!res.ok)
    throw new Error(
      typeof json.error === 'string' ? json.error : json.error?.message || 'Unable to complete this action.',
    );
  return json;
}
function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <Layers3 size={30} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Home;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <Icon size={17} />
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}
function HouseArt({ variant = 0, large = false }: { variant?: number; large?: boolean }) {
  const colors = ['#deded3', '#ded0bb', '#bac6be', '#d2c6bf'];
  return (
    <svg
      className={`house-art ${large ? 'large' : ''}`}
      viewBox="0 0 640 360"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Illustrative property art, not a property photograph"
    >
      <defs>
        <linearGradient id={`sky${variant}`} x2="0" y2="1">
          <stop stopColor="#b9d1d0" />
          <stop offset="1" stopColor="#e2e9dc" />
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill={`url(#sky${variant})`} />
      <circle cx="505" cy="74" r="36" fill="#f5e9cd" />
      <path d="M0 240 Q90 170 190 215 T440 207 T640 230 V360 H0" fill="#819680" />
      <path d="M0 281 Q200 232 640 273 V360 H0" fill="#607c63" />
      <rect x="135" y="151" width="375" height="151" fill={colors[variant % 4]} />
      <path d="M107 159 L251 70 L392 159" fill="#343e3b" />
      <path d="M325 159 L428 101 L535 159" fill="#46524b" />
      <rect x="257" y="201" width="61" height="101" fill="#5d6a5b" />
      <rect x="151" y="187" width="73" height="69" fill="#354e4f" />
      <rect x="350" y="184" width="134" height="78" fill="#354e4f" />
      <path
        d="M187 187 V256 M151 222 H224 M396 184 V262 M440 184 V262 M350 223 H484"
        stroke="#cbd6cb"
        strokeWidth="5"
      />
      <rect x="134" y="289" width="377" height="13" fill="#b2ae9d" />
      <path d="M257 302 L225 360 H374 L318 302" fill="#bfbca9" />
      <path d="M9 315 L89 212 L132 315Z M511 323 L559 200 L613 323Z" fill="#3d5e4e" />
      <path d="M36 278 Q72 181 97 96 Q134 184 112 269" fill="#557b62" />
      <rect x="85" y="219" width="10" height="109" fill="#52634a" />
      <path d="M521 291 Q536 171 583 129 Q627 224 606 294" fill="#6a8b67" />
      <rect x="559" y="241" width="9" height="84" fill="#52634a" />
      <path d="M0 345 Q115 309 222 345 M380 346 Q504 302 640 338" fill="none" stroke="#8da478" strokeWidth="22" />
      <text x="620" y="342" textAnchor="end" fill="#fff" opacity=".8" fontSize="11" fontFamily="sans-serif">
        ILLUSTRATION · NOT A PROPERTY PHOTO
      </text>
    </svg>
  );
}

export default function WorkspaceApp() {
  const [user, setUser] = useState<Actor | null>(null),
    [ws, setWs] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState('');
  const [page, setPage] = useState<Page>('overview'),
    [propertyId, setPropertyId] = useState(''),
    [clientId, setClientId] = useState(''),
    [transactionId, setTransactionId] = useState(''),
    [modal, setModal] = useState<Modal>(null),
    [assistantOpen, setAssistantOpen] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [commandOpen, setCommandOpen] = useState(false),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [command, setCommand] = useState('');
  const [compIds, setCompIds] = useState<string[] | null>(null),
    [assumptions, setAssumptions] = useState({ ...defaultAssumptions }),
    [listPrice, setListPrice] = useState(0),
    [savedCmaId, setSavedCmaId] = useState(''),
    [assistantMessage, setAssistantMessage] = useState(''),
    [conversation, setConversation] = useState<{ question: string; response: AssistantResponse }[]>([]),
    [chatBusy, setChatBusy] = useState(false),
    [editClient, setEditClient] = useState<Client | null>(null),
    [costs, setCosts] = useState({ commissionPercent: 2.5, closingPercent: 1, concessions: 0 }),
    [payoff, setPayoff] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login'),
    [inviteToken, setInviteToken] = useState(''),
    [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null),
    sessionVersion = useRef(0),
    currentUserId = useRef<string | null>(null);
  currentUserId.current = user?.id || null;
  const renderedUserId = user?.id;
  const applyWorkspace = (next: Workspace) => {
    if (renderedUserId && currentUserId.current === renderedUserId) setWs(next);
  };
  const [propertySource, setPropertySource] = useState<'workspace' | 'provider'>('workspace'),
    [researchCmaId, setResearchCmaId] = useState('');
  const [activeSearchId, setActiveSearchId] = useState('');
  const [productFlags, setProductFlags] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<string[]>(['tools']);
  const [rate, setRate] = useState(6.5);
  const [reviewPropertyId, setReviewPropertyId] = useState('');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ascent.nav.collapsed');
      if (stored) setCollapsed(JSON.parse(stored));
    } catch {}
  }, []);
  const toggleGroup = (id: string) =>
    setCollapsed(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      try {
        localStorage.setItem('ascent.nav.collapsed', JSON.stringify(next));
      } catch {}
      return next;
    });
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 4500);
  };
  useEffect(() => {
    setInviteToken(new URLSearchParams(window.location.search).get('invite') || '');
    request<{ user: Actor; workspace: Workspace }>('/api/workspace?initialize=1')
      .then(d => {
        setUser(d.user);
        setWs(d.workspace);
      })
      .catch(e => {
        if (!/sign|session|auth|unauth/i.test(e.message)) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const generation = ++sessionVersion.current;
    setConversation([]);
    setActiveSearchId('');
    setAssistantMessage('');
    setChatBusy(false);
    setCosts({ commissionPercent: 2.5, closingPercent: 1, concessions: 0 });
    setPayoff(0);
    setEditClient(null);
    setToast('');
    setCompIds(null);
    setSavedCmaId('');
    setPropertySource('workspace');
    setResearchCmaId('');
    setClientId('');
    setTransactionId('');
    setPropertyId('');
    setReviewPropertyId('');
    setListPrice(0);
    setPage('overview');
    setQuery('');
    setStatus('all');
    setModal(null);
    setAssistantOpen(false);
    if (!user) return;
    request<FabricInfo>('/api/fabric')
      .then(d => {
        if (generation !== sessionVersion.current) return;
        setRegions(d.regions);
        setAssumptions(regionalAssumptions(d.fabric.selectedRegionId));
        const ids = new Set(
          d.fabric.records
            .filter(
              r => r.regionId === d.fabric.selectedRegionId && r.synthetic === (d.fabric.dataMode !== 'authorized'),
            )
            .map(r => r.propertyId),
        );
        const first =
          d.workspace.properties.find(p => ids.has(p.id) && p.status === 'active') ||
          d.workspace.properties.find(p => ids.has(p.id));
        if (first) setPropertyId(first.id);
      })
      .catch(e => {
        if (generation === sessionVersion.current) setError(e.message);
      });
  }, [user?.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen(v => !v);
      }
      if (e.key === 'Escape') {
        setModal(null);
        setCommandOpen(false);
        setAssistantOpen(false);
        setMobileNav(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);
  useEffect(() => {
    let active = true;
    if (!user) {
      setProductFlags({});
      return;
    }
    request<{ flags: { id: string; assignment: string }[] }>('/api/product')
      .then(d => {
        if (active) setProductFlags(Object.fromEntries(d.flags.map(f => [f.id, f.assignment === 'treatment'])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id, ws?.product?.updatedAt]);
  useEffect(() => {
    if (!user || !ws?.product?.consent) return;
    const feature = (
      {
        cma: 'cma',
        clients: 'clients',
        offers: 'offers',
        transactions: 'transactions',
        reports: 'reports',
        academy: 'academy',
        portability: 'migration',
        fabric: 'fabric',
      } as Record<string, string>
    )[page];
    if (feature)
      void request('/api/product', { action: 'event', eventId: crypto.randomUUID(), feature, kind: 'open' }).catch(
        () => {},
      );
  }, [page, user?.id, ws?.product?.consent]);
  useEffect(() => {
    if (!modal && !commandOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[aria-modal="true"]');
    if (!dialog) return;
    const items = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
        ),
      ).filter(el => el.getClientRects().length > 0);
    items()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = items();
      const first = all[0],
        last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [modal, commandOpen]);
  const regionProperties = useMemo(() => {
    if (!ws) return [];
    if (!ws.fabric) return ws.properties;
    const ids = new Set(
      ws.fabric.records
        .filter(
          r => r.regionId === ws.fabric!.selectedRegionId && r.synthetic === (ws.fabric!.dataMode !== 'authorized'),
        )
        .map(r => r.propertyId),
    );
    return ws.properties.filter(p => ids.has(p.id));
  }, [ws]);
  const property =
    ws?.properties.find(p => p.id === propertyId) ||
    regionProperties.find(p => p.status === 'active') ||
    regionProperties[0];
  const client = ws?.clients.find(c => c.id === clientId) || ws?.clients[0];
  const transaction =
    ws?.transactions.find(t => t.id === transactionId) ||
    ws?.transactions.find(t => t.propertyId === property?.id) ||
    ws?.transactions.find(t => regionProperties.some(p => p.id === t.propertyId)) ||
    ws?.transactions[0];
  const valuationProperties = useMemo(() => {
    if (!ws) return [];
    const ids = new Set(regionProperties.map(p => p.id));
    return scopeWorkspaceForAccess(ws, 'valuation').properties.filter(p => ids.has(p.id));
  }, [ws, regionProperties]);
  const market = useMemo(() => {
    if (!ws) return null;
    const ids = new Set(regionProperties.map(p => p.id));
    return summarizeMarket(
      scopeWorkspaceForAccess(ws, 'market').properties.filter(p => ids.has(p.id)),
      ws.asOf,
    );
  }, [ws, regionProperties]);
  const cmaState = useMemo(() => {
    if (!ws || !property) return { result: null, error: '' };
    if (!valuationProperties.some(p => p.id === property.id))
      return {
        result: null,
        error:
          'This property source does not currently permit valuation use. Research remains available within its authorized scope.',
      };
    try {
      return {
        result: calculateCma(
          property,
          valuationProperties.filter(p => compIds === null || compIds.includes(p.id)),
          assumptions,
          ws.asOf,
        ),
        error: '',
      };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'No comparable evidence available.' };
    }
  }, [ws, property, compIds, assumptions, valuationProperties]);
  const cma = cmaState.result;
  const scenario = useMemo(
    () => (cma ? simulatePricing(cma, listPrice || cma.strategies.moderate, costs) : null),
    [cma, listPrice, costs],
  );
  const changeProperty = (id: string) => {
    setPropertyId(id);
    setCompIds(null);
    setListPrice(0);
    setSavedCmaId('');
  };
  const go = (p: Page) => {
    setPage(p);
    setMobileNav(false);
    setCommandOpen(false);
  };
  async function switchRegion(regionId: string) {
    setBusy(true);
    setError('');
    try {
      const d = await request<FabricInfo>('/api/fabric', { action: 'selectRegion', regionId });
      setWs(d.workspace);
      setRegions(d.regions);
      const ids = new Set(
        d.fabric.records
          .filter(r => r.regionId === regionId && r.synthetic === (d.fabric.dataMode !== 'authorized'))
          .map(r => r.propertyId),
      );
      const next =
        d.workspace.properties.find(p => ids.has(p.id) && p.status === 'active') ||
        d.workspace.properties.find(p => ids.has(p.id));
      if (next) changeProperty(next.id);
      setAssumptions(regionalAssumptions(regionId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mutate(type: string, payload: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      const d = await request<{ workspace: Workspace; result?: unknown }>('/api/actions', { type, ...payload });
      setWs(d.workspace);
      notify('Saved to your decision history.');
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(action: string, body: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      await request(`/api/auth/${action}`, body);
      const d = await request<{ user: Actor; workspace: Workspace }>('/api/workspace?initialize=1');
      setUser(d.user);
      setWs(d.workspace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function ask(message = assistantMessage) {
    if (!message.trim() || chatBusy) return;
    const generation = sessionVersion.current;
    setAssistantMessage('');
    setChatBusy(true);
    try {
      const response = await request<AssistantResponse>('/api/assistant', {
        message,
        context:
          page === 'properties' && propertySource === 'provider'
            ? { page: 'provider-research', cmaId: researchCmaId || undefined }
            : {
                page,
                propertyId: property?.id,
                cmaId: savedCmaId || undefined,
                clientId: client?.id,
                transactionId: transaction?.id,
              },
      });
      if (generation === sessionVersion.current) setConversation(c => [...c, { question: message, response }]);
    } catch (e) {
      if (generation === sessionVersion.current) setError((e as Error).message);
    } finally {
      if (generation === sessionVersion.current) setChatBusy(false);
    }
  }
  async function saveCma() {
    if (!property) return;
    const d = await mutate('saveCma', {
      propertyId: property.id,
      name: `${property.address} · ${date(ws!.asOf)}`,
      compIds: compIds || undefined,
      assumptions,
    });
    if (d) {
      const last = d.workspace.cmas.at(-1);
      if (last) setSavedCmaId(last.id);
    }
  }
  function openClient(c: Client | null = null) {
    setEditClient(c);
    setModal('client');
  }
  const submitModal = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      v = Object.fromEntries(f.entries());
    let d = null;
    if (modal === 'client')
      d = await mutate('saveClient', {
        ...v,
        id: editClient?.id,
        budget: Number(v.budget),
        phone: String(v.phone || '').trim() || undefined,
        role: v.role || undefined,
      });
    if (modal === 'search')
      d = await mutate('saveSearch', {
        ...v,
        maxPrice: Number(v.maxPrice),
        clientId: client?.id,
        criteria: {
          minBedrooms: v.minBedrooms ? Number(v.minBedrooms) : undefined,
          minBathrooms: v.minBathrooms ? Number(v.minBathrooms) : undefined,
          minSqft: v.minSqft ? Number(v.minSqft) : undefined,
          state: v.criteriaState ? String(v.criteriaState).toUpperCase() : undefined,
          zip: v.criteriaZip || undefined,
          status: v.criteriaStatus || 'active',
        },
      });
    if (modal === 'offer')
      d = await mutate('saveOffer', {
        ...v,
        propertyId: property?.id,
        price: Number(v.price),
        sellerCredit: Number(v.sellerCredit),
        downPercent: Number(v.downPercent),
        earnestMoney: Number(v.earnestMoney),
        contingencies: String(v.contingencies || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        closeDate: `${v.closeDate}T12:00:00.000Z`,
        expiresAt: `${v.expiresAt}T23:59:59.000Z`,
      });
    if (modal === 'transaction')
      d = await mutate('saveTransaction', { propertyId: v.propertyId, clientId: v.clientId });
    if (modal === 'milestone')
      d = await mutate('addMilestone', {
        transactionId: transaction?.id,
        title: v.title,
        dueAt: `${v.dueAt}T12:00:00.000Z`,
      });
    if (modal === 'outcome') {
      const record = ws!.cmas.find(c => c.id === v.cmaId);
      d = await mutate('recordOutcome', {
        ...v,
        propertyId: record?.propertyId,
        actualPrice: Number(v.actualPrice),
        observedAt: `${v.observedAt}T12:00:00.000Z`,
      });
    }
    if (d) setModal(null);
  };

  if (loading)
    return (
      <main className="opening">
        <span className="brand">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </span>
        <LoaderCircle className="spin" />
        <p>Opening your workspace</p>
      </main>
    );
  if (inviteToken && !user)
    return (
      <InviteAccept
        token={inviteToken}
        onAccepted={async () => {
          const d = await request<{ user: Actor; workspace: Workspace }>('/api/workspace?initialize=1');
          setUser(d.user);
          setWs(d.workspace);
          setInviteToken('');
          window.history.replaceState(null, '', '/');
        }}
      />
    );
  if ((!user || !ws) && !showAuth)
    return (
      <Landing
        busy={busy}
        error={error}
        onDemo={() => void authenticate('demo')}
        onSignIn={() => {
          setAuthMode('login');
          setError('');
          setShowAuth(true);
          window.scrollTo(0, 0);
        }}
        onRegister={() => {
          setAuthMode('register');
          setError('');
          setShowAuth(true);
          window.scrollTo(0, 0);
        }}
      />
    );
  if (!user || !ws)
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <a className="brand" href="/">
            <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
          </a>
          <Badge tone="light">PROPERTY INTELLIGENCE, WITH PERSPECTIVE</Badge>
          <h1>
            Every property.
            <br />A clearer picture.
          </h1>
          <p>
            From the first comparable to the final signature. Bring your evidence, decisions, and relationships into one
            thoughtful workspace.
          </p>
          <HouseArt large />
          <div className="auth-proof">
            <span>
              <ShieldCheck size={18} /> Evidence you can inspect
            </span>
            <span>
              <GitBranch size={18} /> Decisions you can reproduce
            </span>
          </div>
        </section>
        <section className="auth-form">
          <div className="auth-form-inner">
            <span className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</span>
            <h2>{authMode === 'login' ? 'Good to have you here.' : 'Make room for better decisions.'}</h2>
            <p>
              {authMode === 'login'
                ? 'Sign in to your professional workspace.'
                : 'Create a private workspace for your organization.'}
            </p>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            <form
              onSubmit={e => {
                e.preventDefault();
                void authenticate(authMode, Object.fromEntries(new FormData(e.currentTarget)));
              }}
            >
              {authMode === 'register' && (
                <>
                  <label>
                    Full name
                    <input name="name" required minLength={2} autoComplete="name" />
                  </label>
                  <label>
                    Organization
                    <input name="organization" required minLength={2} autoComplete="organization" />
                  </label>
                </>
              )}
              <label>
                Email address
                <input name="email" type="email" placeholder="you@yourbrokerage.com" required autoComplete="email" />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={authMode === 'register' ? 12 : 1}
                  required
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={authMode === 'register' ? 'At least 12 characters' : 'Your password'}
                />
              </label>
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : authMode === 'login' ? (
                  'Sign in'
                ) : (
                  'Create workspace'
                )}
                <ArrowRight size={16} />
              </button>
            </form>
            <button
              className="text-button auth-switch"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'register' : 'login');
                setError('');
              }}
            >
              {authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </button>
            <div className="divider">
              <span>or take a look around</span>
            </div>
            <button className="button full demo-button" disabled={busy} onClick={() => void authenticate('demo')}>
              <Sparkles size={18} />
              Explore the working demo
              <ArrowUpRight size={16} />
            </button>
            <p className="fine">
              Demo creates an isolated, persistent workspace with fictional properties and clients. No MLS credentials
              required.
            </p>
          </div>
        </section>
      </main>
    );

  const readonly = user.role === 'viewer';
  const unread = ws.alerts.filter(a => !a.read).length;
  // The demo runs on a frozen clock so its fictional deadlines stay meaningful.
  const now = ws.mode === 'demo' ? ws.asOf : new Date().toISOString();
  const agendaOpen = (item: AgendaItem) => {
    if (item.target.page === 'clients') setClientId(item.target.id);
    if (item.target.page === 'transactions') setTransactionId(item.target.id);
    if (item.target.page === 'market') setReviewPropertyId(item.target.id);
    if (item.target.propertyId && item.target.page !== 'transactions') changeProperty(item.target.propertyId);
    go(item.target.page);
  };
  const dueSoon = buildAgenda(ws, now, 3).length;
  // Reports carry the seller-cost assumptions entered in the pricing studio.
  const reportHref = (cmaId: string, presentation = false) =>
    `/api/report?${new URLSearchParams({
      cmaId,
      commission: String(costs.commissionPercent),
      closing: String(costs.closingPercent),
      concessions: String(costs.concessions),
      payoff: String(payoff),
      ...(presentation ? { view: 'presentation' } : {}),
    })}`;
  const listingRange = (listing: Property) => {
    try {
      const result = calculateCma(listing, valuationProperties, assumptions, ws.asOf);
      return { low: result.low, moderate: result.estimate, high: result.high };
    } catch {
      return undefined;
    }
  };
  const providerResearch = page === 'properties' && propertySource === 'provider';
  const hasLicensedData =
    ws.sources.some(source => source.kind === 'licensed') || ws.providerData?.cache.some(cache => !cache.fixture);
  const appliedSearch = ws.savedSearches.find(search => search.id === activeSearchId);
  const matchIds = appliedSearch
    ? new Set(
        evaluateSavedSearch(appliedSearch, regionProperties)
          .filter(match => match.matched)
          .map(match => match.propertyId),
      )
    : null;
  const filtered = regionProperties.filter(
    p =>
      (!matchIds || matchIds.has(p.id)) &&
      (status === 'all' || p.status === status) &&
      `${p.address} ${p.city} ${p.zip}`.toLowerCase().includes(query.toLowerCase()),
  );
  const activeOffers = ws.offers.filter(o => o.propertyId === property?.id),
    offerComparison = compareOffers(activeOffers, ws.mode === 'demo' ? ws.asOf : new Date().toISOString());
  const sourcesButton = (
    <button className="text-button" onClick={() => setModal('sources')}>
      <BookOpen size={14} />
      Inspect sources
    </button>
  );
  const propertySelect = (
    <label className="property-picker">
      <Building2 size={16} />
      <span className="sr-only">Active property</span>
      <select aria-label="Active property" value={property?.id} onChange={e => changeProperty(e.target.value)}>
        {regionProperties.map(p => (
          <option key={p.id} value={p.id}>
            {p.address}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
  const heading = (eyebrow: string, title: string, description: string, action?: React.ReactNode) => (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{action}</div>
    </div>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <aside className={`sidebar ${mobileNav ? 'show' : ''}`}>
        <a
          className="brand"
          href="/"
          onClick={e => {
            e.preventDefault();
            go('overview');
          }}
        >
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </a>
        <div className="org-switch">
          <div className="org-avatar">{ws.settings.organization[0]}</div>
          <div>
            <strong>{ws.settings.organization}</strong>
            <span>{ws.mode === 'demo' ? 'Demo workspace' : 'Professional workspace'}</span>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {navGroups.map(group => {
            const items = groupItems(group);
            const open = !collapsed.includes(group.id) || items.some(n => n.page === page);
            return (
              <div key={group.id} className="nav-group">
                {group.id === 'work' ? (
                  <div className="nav-label">{group.label}</div>
                ) : (
                  <button
                    className="nav-label nav-section nav-toggle"
                    aria-expanded={open}
                    aria-controls={`nav-${group.id}`}
                    onClick={() => toggleGroup(group.id)}
                  >
                    {group.label}
                    <ChevronDown size={12} />
                  </button>
                )}
                {open && (
                  <div id={`nav-${group.id}`}>
                    {items.map(n => (
                      <button
                        key={n.page}
                        className={`nav-item ${page === n.page ? 'active' : ''}`}
                        aria-current={page === n.page ? 'page' : undefined}
                        onClick={() => go(n.page)}
                      >
                        <n.icon size={18} />
                        <span>{n.label}</span>
                        {n.page === 'market' && unread > 0 && <span className="nav-count">{unread}</span>}
                        {n.page === 'overview' && dueSoon > 0 && (
                          <span className="nav-count due" title="Due in the next three days" aria-hidden="true">
                            {dueSoon}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="copilot-card">
            <span className="copilot-symbol">
              <Sparkles size={20} />
            </span>
            <strong>A little more perspective.</strong>
            <p>
              Your evidence, connected.
              <br />
              Ask Ascent to help you think.
            </p>
            <button onClick={() => setAssistantOpen(true)}>
              Open copilot <ArrowUpRight size={14} />
            </button>
          </div>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
            <Settings2 size={18} />
            Workspace settings
          </button>
          <div className="user-card">
            <div className="user-avatar">
              {user.name
                .split(' ')
                .map(s => s[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div>
              <strong>{user.name}</strong>
              <span>{user.role}</span>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              disabled={busy}
              onClick={async () => {
                await request('/api/auth/logout', {});
                setUser(null);
                setWs(null);
                setAuthMode('login');
                setShowAuth(true);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{nav.find(n => n.page === page)?.label || 'Settings'}</strong>
          </div>
          <div className="topbar-right">
            <label className="market-switch">
              <MapPin size={14} />
              <span className="sr-only">Market region</span>
              <select
                aria-label="Market region"
                value={ws.fabric?.selectedRegionId || 'austin'}
                disabled={busy}
                onChange={e => void switchRegion(e.target.value)}
              >
                {regions.length ? (
                  regions.map(r => (
                    <option value={r.id} key={r.id}>
                      {r.name}
                    </option>
                  ))
                ) : (
                  <option value="austin">Austin · demo</option>
                )}
              </select>
            </label>
            <button aria-label="Search workspace" className="command-trigger" onClick={() => setCommandOpen(true)}>
              <Search size={16} />
              <span>Jump to anything</span>
              <kbd>Ctrl K</kbd>
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`${unread} unread market alerts`}
              onClick={() => go('market')}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <span className="topbar-avatar">{user.name[0]}</span>
          </div>
        </header>
        <div className="demo-banner">
          <span>
            <span className="status-dot" />{' '}
            {providerResearch
              ? 'PROPERTY DATA RESEARCH'
              : hasLicensedData
                ? 'MIXED DATA WORKSPACE'
                : ws.mode === 'demo'
                  ? 'SYNTHETIC DEMO'
                  : 'LICENSED WORKSPACE'}
          </span>
          <p>
            {providerResearch
              ? 'Choose labeled demo or authorized live data. Evidence has its own source and dates.'
              : hasLicensedData
                ? 'Bundled examples are fictional. Licensed research is labeled by source.'
                : ws.mode === 'demo'
                  ? 'Fictional records. Real calculations. Your changes are saved.'
                  : 'Authorized sources only. Review evidence before acting.'}
          </p>
          <button onClick={() => setModal('sources')}>
            {providerResearch || hasLicensedData ? 'Source dates & rights' : `Data as of ${date(ws.asOf)}`}
            <ArrowUpRight size={12} />
          </button>
        </div>
        <main id="main" tabIndex={-1} className="page-content">
          {page === 'overview' && productFlags['guided-academy'] && (
            <div className="guided-academy-banner">
              <GraduationCap size={22} />
              <div>
                <strong>Your next useful step</strong>
                <p>
                  Save a CMA, inspect an adjustment, then export its evidence. Academy progress follows actual work.
                </p>
              </div>
              <button className="button small" onClick={() => go('academy')}>
                Open professional academy
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="error-box dismissible">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'overview' && (
            <>
              {heading(
                'YOUR DAY, IN FOCUS',
                `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}.`,
                'A little clarity for your next move.',
                <button className="button primary" onClick={() => go('cma')}>
                  Open pricing studio
                  <ArrowUpRight size={16} />
                </button>,
              )}
              <div className="metrics-grid">
                <Metric
                  label="Properties in view"
                  value={String(regionProperties.length)}
                  detail={`${market!.active} active · ${market!.sold} recent sales`}
                  icon={Building2}
                />
                <Metric
                  label="Client relationships"
                  value={String(ws.clients.length)}
                  detail={`${ws.clients.filter(c => c.stage === 'active').length} actively looking ahead`}
                  icon={Users}
                />
                <Metric
                  label="Open transactions"
                  value={String(ws.transactions.filter(t => t.stage !== 'closed').length)}
                  detail={`${ws.transactions.flatMap(t => t.milestones).filter(m => m.status === 'pending').length} milestones to keep moving`}
                  icon={CheckCircle2}
                />
                <Metric
                  label="Decisions preserved"
                  value={String(ws.cmas.length)}
                  detail="Reproducible pricing snapshots"
                  icon={GitBranch}
                />
              </div>
              <div className="overview-grid">
                <section className="panel feature-property">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">THE BIG PICTURE</span>
                      <h2>Your next decision starts here.</h2>
                    </div>
                    <Badge tone="green">{property?.status}</Badge>
                  </div>
                  <div className="feature-property-body">
                    <div className="feature-image">
                      <HouseArt large />
                      <div className="image-location">
                        <MapPin size={14} />
                        {property?.city}, {property?.state}
                      </div>
                    </div>
                    <div className="feature-details">
                      <span className="eyebrow">ACTIVE PROPERTY</span>
                      <h3>{property?.address}</h3>
                      <p>
                        {property?.beds} beds <span>·</span> {property?.baths} baths <span>·</span>{' '}
                        {number(property?.sqft || 0)} sq ft
                      </p>
                      <div className="feature-valuation">
                        <span>Comparable-supported estimate</span>
                        <strong>{cma ? money(cma.estimate) : 'Evidence needed'}</strong>
                        <small>
                          {cma
                            ? `${compact(cma.low)}–${compact(cma.high)} · ${cma.comps.length} comparable sales`
                            : 'Choose a property with recent sold comparables'}
                        </small>
                      </div>
                      <button className="button primary" onClick={() => go('cma')}>
                        Explore the valuation
                        <ArrowRight size={16} />
                      </button>
                      <span className="fine">Empirical comp range. Professional review required.</span>
                    </div>
                  </div>
                  <div className="feature-footer">
                    <ShieldCheck size={15} /> Every adjustment has a reason. Every source has a history.{sourcesButton}
                  </div>
                </section>
                <WeekAgenda workspace={ws} now={now} onOpen={agendaOpen} />
              </div>
              <div className="overview-bottom">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">RELATIONSHIPS, IN MOTION</span>
                      <h2>People behind the properties</h2>
                    </div>
                    <button className="text-button" onClick={() => go('clients')}>
                      All clients
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {ws.clients
                    .filter(c => c.stage !== 'lost' && c.stage !== 'closed')
                    .slice(0, 4)
                    .map(c => (
                      <button
                        key={c.id}
                        className="client-row"
                        onClick={() => {
                          setClientId(c.id);
                          go('clients');
                        }}
                      >
                        <span className="initials">{initials(c.name)}</span>
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            {clientRoleLabel(c.role)} · {c.preferences}
                          </small>
                        </span>
                        <Badge tone={c.stage === 'active' ? 'green' : 'neutral'}>{clientStageLabel(c.stage)}</Badge>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {ws.clients.length === 0 && (
                    <Empty title="Start a relationship">
                      <button className="button" onClick={() => openClient()}>
                        Add a client
                      </button>
                    </Empty>
                  )}
                </section>
                <section className="panel attention-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">KEEP THINGS MOVING</span>
                      <h2>On your radar</h2>
                    </div>
                    <Badge>{unread} updates</Badge>
                  </div>
                  {ws.alerts.slice(0, 3).map((a, i) => (
                    <button
                      className="radar-item"
                      key={a.id}
                      onClick={() => {
                        if (a.propertyId) changeProperty(a.propertyId);
                        go('market');
                      }}
                    >
                      <span className={`radar-icon radar-${i}`}>
                        {i === 0 ? <Activity size={18} /> : i === 1 ? <Clock3 size={18} /> : <Lightbulb size={18} />}
                      </span>
                      <span>
                        <strong>{a.title}</strong>
                        <small>{a.explanation.slice(0, 110)}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {ws.alerts.length === 0 && (
                    <Empty title="A clear radar">
                      <p>Run a market review to check for meaningful changes.</p>
                    </Empty>
                  )}
                  <button className="panel-link" onClick={() => go('market')}>
                    View market pulse
                    <ArrowRight size={15} />
                  </button>
                </section>
              </div>
            </>
          )}
          {page === 'properties' && (
            <div className="property-source-tabs" role="group" aria-label="Property evidence source">
              <button
                className={`button ${propertySource === 'workspace' ? 'selected' : ''}`}
                aria-pressed={propertySource === 'workspace'}
                onClick={() => setPropertySource('workspace')}
              >
                Saved workspace records
              </button>
              <button
                className={`button ${propertySource === 'provider' ? 'selected' : ''}`}
                aria-pressed={propertySource === 'provider'}
                onClick={() => setPropertySource('provider')}
              >
                National provider research
              </button>
            </div>
          )}
          {page === 'properties' && propertySource === 'provider' && (
            <PropertyResearchView
              workspace={ws}
              user={user}
              onWorkspace={applyWorkspace}
              onContext={setResearchCmaId}
            />
          )}
          {page === 'properties' && propertySource === 'workspace' && (
            <>
              {heading(
                'PROPERTY INTELLIGENCE',
                'Find the story behind the address.',
                'Explore records, geographic context, and the history that shapes a property.',
                <button className="button" onClick={() => setModal('search')}>
                  <Plus size={16} />
                  Save a search
                </button>,
              )}
              <div className="search-bar">
                <label>
                  <Search size={18} />
                  <input
                    aria-label="Search properties"
                    placeholder="Search address, city, or ZIP"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </label>
                <select aria-label="Listing status" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="sold">Sold</option>
                  <option value="pending">Pending</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
                <Badge>{filtered.length} records</Badge>
              </div>
              {appliedSearch && (
                <div className="intelligence-notice">
                  <p>
                    Applied saved criteria: {appliedSearch.name} ? up to {money(appliedSearch.maxPrice)} in the selected
                    market.
                  </p>
                  <button className="text-button" onClick={() => setActiveSearchId('')}>
                    Clear saved criteria
                  </button>
                </div>
              )}
              <div className="property-explorer">
                <section className="property-list" aria-label="Property results">
                  {filtered.map((p, i) => (
                    <button
                      key={p.id}
                      className={`property-card ${p.id === property?.id ? 'selected' : ''}`}
                      onClick={() => changeProperty(p.id)}
                    >
                      <div className="property-thumb">
                        <HouseArt variant={i % 4} />
                        <Badge tone={p.status === 'sold' ? 'neutral' : 'green'}>{p.status}</Badge>
                      </div>
                      <div className="property-card-info">
                        <strong>{money(p.soldPrice || p.price)}</strong>
                        <h3>{p.address}</h3>
                        <p>
                          {p.city}, {p.state} {p.zip}
                        </p>
                        <div>
                          {p.beds} bd <span>·</span> {p.baths} ba <span>·</span> {number(p.sqft)} sf
                        </div>
                      </div>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <Empty title="No matching properties">
                      <p>Try a broader address or another status.</p>
                    </Empty>
                  )}
                </section>
                <div className="property-right">
                  <GeoMap properties={filtered} selectedId={property?.id || ''} onSelect={changeProperty} />
                  {property && (
                    <section className="panel property-record">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">PROPERTY RECORD</span>
                          <h2>{property.address}</h2>
                        </div>
                        <Badge tone="green">{property.status}</Badge>
                      </div>
                      <p>{property.description}</p>
                      <div className="record-facts">
                        <div>
                          <span>Year built</span>
                          <strong>{property.yearBuilt}</strong>
                        </div>
                        <div>
                          <span>Lot size</span>
                          <strong>{number(property.lotSqft)} sf</strong>
                        </div>
                        <div>
                          <span>Days on market</span>
                          <strong>{property.dom}</strong>
                        </div>
                        <div>
                          <span>Condition</span>
                          <strong>{property.condition} / 5</strong>
                        </div>
                      </div>
                      <h4>Listing & transaction history</h4>
                      <ol className="timeline">
                        {property.history.map((h, i) => (
                          <li key={i}>
                            <span className="timeline-dot" />
                            <div>
                              <strong>{h.event}</strong>
                              <small>
                                {date(h.date)} {h.price && ` · ${money(h.price)}`}
                              </small>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <div className="record-source">
                        <BookOpen size={14} />
                        {ws.sources.find(s => s.id === property.sourceId)?.label}
                        <button className="text-button" onClick={() => setModal('sources')}>
                          Provenance
                        </button>
                      </div>
                      <button className="button primary full" onClick={() => go('cma')}>
                        Build a CMA for this property
                        <ArrowRight size={16} />
                      </button>
                      <ListingDescriptionStudio
                        key={property.id}
                        property={property}
                        readonly={readonly}
                        busy={busy}
                        onSave={text => mutate('draftListingDescription', { propertyId: property.id, text })}
                      />
                    </section>
                  )}
                </div>
              </div>
              {ws.savedSearches.length > 0 && (
                <section className="panel saved-searches">
                  <h2>Saved searches</h2>
                  {ws.savedSearches.map(s => (
                    <button
                      className="button"
                      key={s.id}
                      onClick={() => {
                        setActiveSearchId(s.id);
                        setQuery('');
                        setStatus('all');
                      }}
                    >
                      {s.name}
                      <Search size={14} />
                    </button>
                  ))}
                  <p className="fine">
                    Saved searches apply their full criteria to authorized stored inventory. Review matches from the
                    client profile to create deduplicated in-app alerts; no new data or messages are requested.
                  </p>
                </section>
              )}
            </>
          )}
          {page === 'cma' && (
            <>
              {heading(
                'PRICING STUDIO',
                'A price you can explain.',
                'Compare the evidence, challenge the assumptions, and preserve your reasoning.',
                <>
                  {propertySelect}
                  <button className="button primary" disabled={busy || readonly || !cma} onClick={() => void saveCma()}>
                    <Plus size={16} />
                    Save CMA snapshot
                  </button>
                </>,
              )}
              <div className="cma-top">
                <section className="valuation-card">
                  <div className="valuation-card-top">
                    <span className="eyebrow">{property?.address}</span>
                    <Badge tone="green">{cma?.comps.length || 0} supported comps</Badge>
                  </div>
                  <span className="valuation-label">Comparable-supported estimate</span>
                  <h2>{cma ? money(cma.estimate) : 'Insufficient evidence'}</h2>
                  <p>{cma ? `${money(cma.low)}–${money(cma.high)}` : cmaState.error}</p>
                  <div className="range-track">
                    <i />
                    <span />
                  </div>
                  <div className="range-labels">
                    <span>Empirical low</span>
                    <span>Weighted estimate</span>
                    <span>Empirical high</span>
                  </div>
                  <small>
                    This is the observed adjusted-comp range, not a statistical confidence interval or an appraisal.
                  </small>
                </section>
                <section className="panel scenario-card">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">WHAT IF?</span>
                      <h2>Explore your asking price</h2>
                    </div>
                    <SlidersHorizontal size={20} />
                  </div>
                  {cma && scenario ? (
                    <>
                      <div className="scenario-price">
                        <label htmlFor="asking-price">List price</label>
                        <strong>{money(scenario.listPrice)}</strong>
                      </div>
                      <input
                        id="asking-price"
                        aria-label="Asking price scenario"
                        className="price-slider"
                        type="range"
                        min={Math.round((cma.estimate * 0.8) / 1000) * 1000}
                        max={Math.round((cma.estimate * 1.2) / 1000) * 1000}
                        step="1000"
                        value={listPrice || cma.strategies.moderate}
                        onChange={e => setListPrice(+e.target.value)}
                      />
                      <div className="strategy-buttons">
                        {Object.entries(cma.strategies).map(([key, val]) => (
                          <button
                            key={key}
                            onClick={() => setListPrice(val)}
                            className={(listPrice || cma.strategies.moderate) === val ? 'selected' : ''}
                          >
                            <span>{key}</span>
                            <strong>{compact(val)}</strong>
                          </button>
                        ))}
                      </div>
                      <p className="scenario-position">
                        <Lightbulb size={16} />
                        {scenario.position}
                      </p>
                      <details className="seller-costs" open={productFlags['scenario-breakdown'] || undefined}>
                        <summary>Edit seller-cost assumptions & payoff</summary>
                        <div className="form-grid">
                          <label>
                            Negotiable commission (%)
                            <input
                              aria-label="Negotiable commission percent"
                              type="number"
                              min="0"
                              max="25"
                              step="0.1"
                              value={costs.commissionPercent}
                              onChange={e =>
                                setCosts(c => ({
                                  ...c,
                                  commissionPercent: Math.min(25, Math.max(0, +e.target.value || 0)),
                                }))
                              }
                            />
                          </label>
                          <label>
                            Other closing costs (%)
                            <input
                              type="number"
                              min="0"
                              max="25"
                              step="0.1"
                              value={costs.closingPercent}
                              onChange={e =>
                                setCosts(c => ({
                                  ...c,
                                  closingPercent: Math.min(25, Math.max(0, +e.target.value || 0)),
                                }))
                              }
                            />
                          </label>
                          <label>
                            Seller concessions ($)
                            <input
                              type="number"
                              min="0"
                              value={costs.concessions}
                              onChange={e => setCosts(c => ({ ...c, concessions: Math.max(0, +e.target.value || 0) }))}
                            />
                          </label>
                          <label>
                            Mortgage payoff ($)
                            <input
                              type="number"
                              min="0"
                              value={payoff}
                              onChange={e => setPayoff(Math.max(0, +e.target.value || 0))}
                            />
                          </label>
                        </div>
                      </details>
                      <div className="net-line">
                        <span>Illustrative proceeds after entered payoff</span>
                        <strong>{money(scenario.estimatedNet - payoff)}</strong>
                      </div>
                      <p className="fine">
                        Cost assumptions: {scenario.costAssumptions.commissionPercent}% negotiable commission,{' '}
                        {scenario.costAssumptions.closingPercent}% other closing costs. No sale timing or probability is
                        predicted.
                      </p>
                    </>
                  ) : (
                    <p>Select at least one eligible comparable sale.</p>
                  )}
                </section>
              </div>
              {cma && scenario && (
                <PricingIntelligence
                  cma={cma}
                  listPrice={scenario.listPrice}
                  properties={regionProperties}
                  onSelect={setListPrice}
                />
              )}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">MAKE THE REASONING VISIBLE</span>
                    <h2>Comparable sales & adjustments</h2>
                  </div>
                  <button className="text-button" onClick={() => setModal('sources')}>
                    <BookOpen size={15} />
                    Evidence & methodology
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Use</th>
                        <th scope="col">Comparable property</th>
                        <th scope="col">Sold price</th>
                        <th scope="col">Area / distance</th>
                        <th scope="col">Net adjustment</th>
                        <th scope="col">Adjusted price</th>
                        <th scope="col">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {valuationProperties
                        .filter(p => p.status === 'sold' && p.id !== property?.id)
                        .map(p => {
                          let eligible;
                          try {
                            eligible = calculateCma(property!, [p], assumptions, ws.asOf).comps[0];
                          } catch {}
                          const comp = cma?.comps.find(c => c.propertyId === p.id);
                          const exclusion = eligible ? '' : comparableExclusion(property!, p, assumptions, ws.asOf);
                          return (
                            <tr key={p.id} className={!eligible ? 'muted-row' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`Use ${p.address}`}
                                  checked={compIds === null ? !!eligible : compIds.includes(p.id)}
                                  onChange={e => {
                                    const current = compIds ?? cma?.comps.map(c => c.propertyId) ?? [];
                                    setCompIds(
                                      e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id),
                                    );
                                    setSavedCmaId('');
                                  }}
                                  disabled={!eligible}
                                />
                              </td>
                              <td>
                                <strong>{p.address}</strong>
                                <small>{p.soldAt ? date(p.soldAt) : 'Closing date missing'}</small>
                                {exclusion && <small className="exclusion-reason">Excluded: {exclusion}</small>}
                                {comp && (
                                  <details>
                                    <summary>Inspect adjustments</summary>
                                    {comp.adjustments.map((a, i) => (
                                      <p className="adjustment-line" key={i}>
                                        <span>{a.explanation}</span>
                                        <strong>{money(a.amount)}</strong>
                                      </p>
                                    ))}
                                  </details>
                                )}
                              </td>
                              <td>{money(p.soldPrice || 0)}</td>
                              <td>
                                {number(p.sqft)} sf
                                <small>{eligible ? `${eligible.distanceMiles.toFixed(2)} mi` : 'Excluded'}</small>
                              </td>
                              <td>{comp ? money(comp.netAdjustment) : '—'}</td>
                              <td>
                                <strong>{comp ? money(comp.adjustedPrice) : '—'}</strong>
                              </td>
                              <td>{comp ? `${(comp.weight * 100).toFixed(1)}%` : '—'}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {cmaState.error && (
                  <div className="error-box" role="alert">
                    {cmaState.error}
                  </div>
                )}
              </section>
              <div className="cma-lower">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">YOU CONTROL THE ASSUMPTIONS</span>
                      <h2>Adjustment model</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => {
                        setAssumptions(regionalAssumptions(ws.fabric?.selectedRegionId || 'austin'));
                        setCompIds(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="assumptions-grid">
                    {[
                      { key: 'sqftRate', label: 'Living area ($ / sf)', step: 5 },
                      { key: 'bedroomValue', label: 'Bedroom adjustment ($)', step: 1000 },
                      { key: 'bathroomValue', label: 'Bathroom adjustment ($)', step: 1000 },
                      { key: 'conditionValue', label: 'Condition point ($)', step: 1000 },
                      { key: 'monthlyTrend', label: 'Monthly trend (decimal)', step: 0.001 },
                      { key: 'maxDistanceMiles', label: 'Maximum distance (mi)', step: 0.5 },
                      { key: 'maxAgeDays', label: 'Maximum sale age (days)', step: 30 },
                      { key: 'maxSizeRatio', label: 'Maximum size ratio', step: 0.05 },
                    ].map(f => (
                      <label key={f.key}>
                        {f.label}
                        <input
                          type="number"
                          step={f.step}
                          value={assumptions[f.key as keyof typeof assumptions]}
                          onChange={e => {
                            setAssumptions(a => ({ ...a, [f.key]: Number(e.target.value) }));
                            setSavedCmaId('');
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="fine">
                    These are explicit analyst assumptions, not fitted market coefficients. Condition is a subjective
                    1–5 rating. Adjustments are relative to the subject; verify every input.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">BEFORE YOU RECOMMEND</span>
                      <h2>What could change this view?</h2>
                    </div>
                    <ShieldCheck size={20} />
                  </div>
                  <ul className="caution-list">
                    {(cma?.warnings || ['No eligible sold evidence is available.']).slice(0, 6).map((w, i) => (
                      <li key={i}>
                        <Circle size={8} />
                        {w}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="button full"
                    onClick={() => {
                      setAssistantOpen(true);
                      void ask(
                        'Challenge the assumptions behind this property valuation. What information is missing?',
                      );
                    }}
                  >
                    <Sparkles size={16} />
                    Challenge with copilot
                  </button>
                </section>
              </div>
              {ws.cmas.filter(c => c.propertyId === property?.id).length > 0 && (
                <section className="panel saved-cmas">
                  <div className="panel-heading">
                    <h2>Preserved decision history</h2>
                    <Badge>{ws.cmas.filter(c => c.propertyId === property?.id).length} snapshots</Badge>
                  </div>
                  {ws.cmas
                    .filter(c => c.propertyId === property?.id)
                    .map(c => (
                      <div className="snapshot-row" key={c.id}>
                        <div>
                          <strong>{c.name}</strong>
                          <small>
                            {date(c.createdAt)} · {c.result.calculationHash.slice(0, 16)}
                          </small>
                        </div>
                        <strong>{money(c.result.estimate)}</strong>
                        <Badge tone={c.approvedAt ? 'green' : 'neutral'}>
                          {c.approvedAt ? 'Reviewed' : 'Needs review'}
                        </Badge>
                        {!c.approvedAt && (
                          <button
                            className="button small"
                            disabled={readonly || busy}
                            onClick={() => void mutate('approveCma', { id: c.id })}
                          >
                            Approve recommendation
                          </button>
                        )}
                        <a className="button small" href={reportHref(c.id)} target="_blank" rel="noreferrer">
                          <Download size={14} />
                          Client report
                        </a>
                        <a
                          className="button small"
                          href={reportHref(c.id, true)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Listing presentation for ${c.name}`}
                        >
                          <ArrowUpRight size={14} />
                          Presentation
                        </a>
                      </div>
                    ))}
                </section>
              )}
            </>
          )}
          {page === 'market' && (
            <>
              {heading(
                'MARKET PULSE',
                'Know when the picture changes.',
                'Monitor meaningful changes and inspect the evidence behind every signal.',
                <button
                  className="button primary"
                  disabled={busy || readonly}
                  onClick={() => void mutate('runMonitor')}
                >
                  <Activity size={16} />
                  Run market review
                </button>,
              )}
              <div className="metrics-grid">
                <Metric
                  label="Active inventory"
                  value={String(market!.active)}
                  detail="In this dataset snapshot"
                  icon={Home}
                />
                <Metric
                  label="Months of supply"
                  value={market!.monthsSupply?.toFixed(1) || 'N/A'}
                  detail="Active / trailing 90-day monthly sales"
                  icon={Layers3}
                />
                <Metric
                  label="Median days on market"
                  value={String(market!.medianDom)}
                  detail="Current active sample"
                  icon={Clock3}
                />
                <Metric
                  label="Monthly absorption"
                  value={market!.absorption === null ? 'N/A' : `${market!.absorption.toFixed(1)}%`}
                  detail="90-day sold average / active count"
                  icon={TrendingUp}
                />
              </div>
              <ListingReviewPanel
                workspace={ws}
                listings={regionProperties.filter(p => p.status === 'active')}
                selectedId={reviewPropertyId || property?.id}
                rate={rate}
                now={now}
                readonly={readonly}
                busy={busy}
                rangeFor={listingRange}
                onSelect={setReviewPropertyId}
                onRecord={payload => mutate('recordCheckIn', payload)}
              />
              <div className="market-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="eyebrow">INVENTORY LANDSCAPE</span>
                      <h2>What’s in the local sample</h2>
                    </div>
                    <Badge>As of {date(ws.asOf)}</Badge>
                  </div>
                  <div className="inventory-bars">
                    {[
                      { name: 'Active', count: market!.active, color: 'green' },
                      { name: 'Sold in last 90 days', count: market!.sold, color: 'blue' },
                      { name: 'Pending', count: market!.pending, color: 'peach' },
                      { name: 'Withdrawn', count: market!.withdrawn, color: 'gray' },
                    ].map(v => (
                      <div key={v.name}>
                        <span>{v.name}</span>
                        <div>
                          <i
                            className={v.color}
                            style={{ width: `${(v.count / Math.max(regionProperties.length, 1)) * 100}%` }}
                          />
                        </div>
                        <strong>{v.count}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="market-note">
                    <Lightbulb size={17} />
                    <p>{market!.warnings.join(' ')}</p>
                  </div>
                  <div className="mini-stats">
                    <div>
                      <span>Median active price</span>
                      <strong>{money(market!.medianPrice)}</strong>
                    </div>
                    <div>
                      <span>Listings with reductions</span>
                      <strong>{market!.priceReductions}</strong>
                    </div>
                  </div>
                </section>
                <RateSensitivity price={market!.medianPrice || property?.price || 0} rate={rate} onRate={setRate} />
              </div>
              <section className="panel alerts-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">CHANGES WITH CONTEXT</span>
                    <h2>Your signal inbox</h2>
                  </div>
                  <Badge>{unread} unread</Badge>
                </div>
                {ws.alerts.map(a => (
                  <div className={`alert-row ${a.read ? 'read' : ''}`} key={a.id}>
                    <span className="radar-icon">
                      <Activity size={18} />
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.explanation}</p>
                      <small>
                        {date(a.createdAt)} · Evidence: {a.sourceIds.join(', ') || 'Workspace comparison'}
                      </small>
                    </div>
                    {a.read ? (
                      <Badge>Reviewed</Badge>
                    ) : (
                      <button
                        className="button small"
                        disabled={readonly || busy}
                        onClick={() => void mutate('markAlertRead', { id: a.id })}
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                ))}
                {ws.alerts.length === 0 && (
                  <Empty title="No new evidence-based changes">
                    <p>A review will appear here when the underlying data changes materially.</p>
                  </Empty>
                )}
              </section>
            </>
          )}
          {page === 'clients' && (
            <>
              {heading(
                'CLIENT INTELLIGENCE',
                'Good relationships have continuity.',
                'Keep preferences, conversations, and the next thoughtful follow-up together.',
                <button className="button primary" disabled={readonly} onClick={() => openClient()}>
                  <Plus size={16} />
                  Add client
                </button>,
              )}
              <ClientPipeline clients={ws.clients} now={now} selectedId={client?.id} onSelect={setClientId} />
              <div className="client-workspace single">
                {client && (
                  <section className="panel client-detail">
                    <div className="panel-heading">
                      <div>
                        <span className="eyebrow">RELATIONSHIP PROFILE</span>
                        <h2>{client.name}</h2>
                        <p className="contact-line">
                          <a href={`mailto:${client.email}`}>{client.email}</a>
                          {client.phone && <a href={`tel:${client.phone.replace(/[^0-9+]/g, '')}`}>{client.phone}</a>}
                        </p>
                      </div>
                      <button className="button small" disabled={readonly} onClick={() => openClient(client)}>
                        Edit profile
                      </button>
                    </div>
                    <div className="client-profile-stats">
                      <div>
                        <span>Stage</span>
                        <Badge tone={client.stage === 'lost' ? 'peach' : 'green'}>
                          {clientStageLabel(client.stage)}
                        </Badge>
                      </div>
                      <div>
                        <span>Role</span>
                        <strong>{clientRoleLabel(client.role)}</strong>
                      </div>
                      <div>
                        <span>Budget</span>
                        <strong>{money(client.budget)}</strong>
                      </div>
                    </div>
                    <h4>What matters to them</h4>
                    <p className="preference-text">{client.preferences}</p>
                    <h4>Properties to keep in view</h4>
                    <div className="saved-property-chips">
                      {client.savedPropertyIds.map(id => {
                        const p = ws.properties.find(p => p.id === id);
                        return p ? (
                          <button
                            key={id}
                            className="button"
                            onClick={() => {
                              changeProperty(id);
                              go('properties');
                            }}
                          >
                            <Home size={14} />
                            {p.address}
                            <ArrowUpRight size={14} />
                          </button>
                        ) : null;
                      })}
                      {client.savedPropertyIds.length === 0 && <p className="fine">No saved properties yet.</p>}
                    </div>
                    <div className="followup-callout">
                      <Lightbulb size={20} />
                      <div>
                        <strong>A useful next conversation</strong>
                        <p>
                          {client.timeline.length
                            ? 'Review the latest preferences and confirm what has changed since the last conversation.'
                            : 'Start by confirming budget, timing, property needs, and communication preferences.'}
                        </p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setAssistantOpen(true);
                          void ask(
                            `Draft a follow-up for ${client.name} using only their recorded preferences and timeline.`,
                          );
                        }}
                      >
                        Draft with copilot
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <h4>Relationship timeline</h4>
                    <ol className="timeline">
                      {[...client.timeline]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((t, i) => (
                          <li key={i}>
                            <span className="timeline-dot" />
                            <div>
                              <strong>{t.note}</strong>
                              <small>{date(t.date)}</small>
                            </div>
                          </li>
                        ))}
                    </ol>
                    <form
                      className="inline-form"
                      onSubmit={async e => {
                        e.preventDefault();
                        const form = e.currentTarget,
                          note = new FormData(form).get('note');
                        if (await mutate('addClientNote', { id: client.id, note })) form.reset();
                      }}
                    >
                      <label className="sr-only" htmlFor="client-note">
                        Add relationship note
                      </label>
                      <input
                        id="client-note"
                        name="note"
                        required
                        maxLength={4000}
                        placeholder="Add a conversation, preference, or next step…"
                      />
                      <button className="button primary" disabled={busy || readonly}>
                        <Plus size={16} />
                        Add note
                      </button>
                    </form>
                  </section>
                )}
              </div>
              {client && (
                <ClientIntelligencePanel
                  key={client.id}
                  workspace={ws}
                  client={client}
                  readonly={readonly}
                  busy={busy}
                  onAction={mutate}
                  onProperty={id => {
                    changeProperty(id);
                    go('properties');
                  }}
                />
              )}
              <section className="panel saved-searches">
                <div className="panel-heading">
                  <h2>Searches that stay with the relationship</h2>
                  <button className="button small" disabled={readonly} onClick={() => setModal('search')}>
                    <Plus size={14} />
                    Save search
                  </button>
                </div>
                {ws.savedSearches.map(s => (
                  <div className="snapshot-row" key={s.id}>
                    <div>
                      <strong>{s.name}</strong>
                      <small>
                        {s.query || 'All local properties'} · Up to {money(s.maxPrice)}
                      </small>
                    </div>
                    <Badge>{ws.clients.find(c => c.id === s.clientId)?.name || 'Workspace'}</Badge>
                  </div>
                ))}
                {!ws.savedSearches.length && <p className="fine">Save a search to preserve a client’s criteria.</p>}
              </section>
            </>
          )}
          {page === 'offers' && (
            <>
              {heading(
                'OFFER INTELLIGENCE',
                'There’s more to an offer than price.',
                'Compare the economics, timing, and conditions without hiding the tradeoffs.',
                <>
                  {propertySelect}
                  <button className="button primary" disabled={readonly} onClick={() => setModal('offer')}>
                    <Plus size={16} />
                    Add offer
                  </button>
                </>,
              )}
              <div className="offer-summary">
                <div>
                  <span className="eyebrow">OFFER ROOM</span>
                  <h2>{property?.address}</h2>
                  <p>
                    {activeOffers.length} offers · As of {date(ws.asOf)}
                  </p>
                </div>
                <Badge tone="green">
                  <ShieldCheck size={13} />
                  Professional review required
                </Badge>
              </div>
              <OfferStrengthBoard offers={activeOffers} estimate={cma?.estimate} now={now} />
              {activeOffers.length > 0 ? (
                <div className={`offer-grid ${productFlags['compact-offers'] ? 'compact-offers' : ''}`}>
                  {offerComparison.rows.map(o => (
                    <section className="panel offer-card" key={o.id}>
                      <div className="offer-card-heading">
                        <span className="initials">{initials(o.buyer)}</span>
                        <div>
                          <h3>{o.buyer}</h3>
                          <Badge>{o.financing}</Badge>
                        </div>
                        {o.expired ? (
                          <Badge tone="peach">Expired</Badge>
                        ) : (
                          <Countdown dueAt={activeOffers.find(x => x.id === o.id)!.expiresAt} now={now} />
                        )}
                      </div>
                      <span className="eyebrow">OFFER PRICE</span>
                      <h2>{money(o.price)}</h2>
                      <dl className="offer-facts">
                        <div>
                          <dt>Seller credit</dt>
                          <dd>{money(o.sellerCredit)}</dd>
                        </div>
                        <div>
                          <dt>Net before transaction costs</dt>
                          <dd>{money(o.netBeforeCosts)}</dd>
                        </div>
                        <div>
                          <dt>Down payment</dt>
                          <dd>{o.downPercent}%</dd>
                        </div>
                        <div>
                          <dt>Earnest money</dt>
                          <dd>{money(o.earnestMoney)}</dd>
                        </div>
                        <div>
                          <dt>Closing</dt>
                          <dd>{date(activeOffers.find(x => x.id === o.id)!.closeDate)}</dd>
                        </div>
                        <div>
                          <dt>Conditions</dt>
                          <dd>{o.contingencies.join(', ') || 'None recorded'}</dd>
                        </div>
                      </dl>
                      <ul className="caution-list">
                        {o.cautions.map((c, i) => (
                          <li key={i}>
                            <Circle size={7} />
                            {c}
                          </li>
                        ))}
                      </ul>
                      <form
                        onSubmit={async e => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await mutate('draftCounter', {
                            offerId: o.id,
                            price: Number(f.get('price')),
                            note: String(f.get('note') || ''),
                          });
                        }}
                      >
                        <label>
                          Counteroffer price
                          <input type="number" name="price" required min="1" step="1" defaultValue={o.price} />
                        </label>
                        <label>
                          Terms for review
                          <input name="note" maxLength={2000} placeholder="Conditions to discuss with the client" />
                        </label>
                        <button className="button full" disabled={readonly || busy}>
                          <FileText size={16} />
                          Create counteroffer draft
                        </button>
                      </form>
                    </section>
                  ))}
                </div>
              ) : (
                <Empty title="Open the conversation">
                  <p>Add an offer for this property to compare terms.</p>
                  <button className="button primary" onClick={() => setModal('offer')}>
                    Add an offer
                  </button>
                </Empty>
              )}
              <OfferDomainPanel workspace={ws} propertyId={property?.id} />
              <p className="method-note">{offerComparison.warnings.join(' ')}</p>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">NOTHING GOES OUT WITHOUT YOU</span>
                    <h2>Professional approval queue</h2>
                  </div>
                  <ShieldCheck size={20} />
                </div>
                {ws.approvals.map(a => (
                  <div className="approval-row" key={a.id}>
                    <div>
                      <Badge tone={a.status === 'approved' ? 'green' : 'peach'}>{a.status}</Badge>
                      <strong>{a.kind} draft</strong>
                      <pre>{a.draft}</pre>
                      <small>
                        Created {date(a.createdAt)}
                        {a.approvedAt ? ` · Approved ${date(a.approvedAt)}` : ''}
                      </small>
                    </div>
                    {a.status === 'draft' && (
                      <button
                        className="button primary small"
                        disabled={readonly || busy}
                        onClick={() => void mutate('approveDraft', { id: a.id })}
                      >
                        Approve draft
                      </button>
                    )}
                  </div>
                ))}
                {!ws.approvals.length && (
                  <p className="fine">
                    Counteroffer drafts appear here. Approval records your review; delivery and legal execution remain
                    with the professional.
                  </p>
                )}
              </section>
            </>
          )}
          {page === 'transactions' && (
            <>
              {heading(
                'TRANSACTION CONTINUITY',
                'From accepted to all set.',
                'Documents, dates, and human-reviewed next steps, in one reliable place.',
                <button className="button primary" disabled={readonly} onClick={() => setModal('transaction')}>
                  <Plus size={16} />
                  New transaction
                </button>,
              )}
              <div className="transaction-tabs">
                {ws.transactions.map(t => (
                  <button
                    key={t.id}
                    className={transaction?.id === t.id ? 'selected' : ''}
                    onClick={() => setTransactionId(t.id)}
                  >
                    <Home size={16} />
                    {ws.properties.find(p => p.id === t.propertyId)?.address}
                    <Badge tone="green">{t.stage}</Badge>
                  </button>
                ))}
              </div>
              {transaction ? (
                <>
                  <div className="transaction-top">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">TRANSACTION TIMELINE</span>
                          <h2>{ws.properties.find(p => p.id === transaction.propertyId)?.address}</h2>
                          <p>Client: {ws.clients.find(c => c.id === transaction.clientId)?.name}</p>
                        </div>
                        <button className="button small" disabled={readonly} onClick={() => setModal('milestone')}>
                          <Plus size={14} />
                          Add deadline
                        </button>
                      </div>
                      <div className="progress-row">
                        <div>
                          <i
                            style={{
                              width: `${(transaction.milestones.filter(m => m.status === 'complete').length / Math.max(transaction.milestones.length, 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span>
                          {transaction.milestones.filter(m => m.status === 'complete').length} of{' '}
                          {transaction.milestones.length} complete
                        </span>
                      </div>
                      {(() => {
                        const next = transaction.milestones
                          .filter(m => m.status === 'pending')
                          .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
                        return next ? (
                          <div className="next-deadline">
                            <span>Next deadline</span>
                            <strong>{next.title}</strong>
                            <small>{date(next.dueAt)}</small>
                            <Countdown dueAt={next.dueAt} now={now} />
                          </div>
                        ) : null;
                      })()}
                      {[...transaction.milestones]
                        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
                        .map(m => (
                          <div className="milestone-row" key={m.id}>
                            <button
                              className={`milestone-check ${m.status === 'complete' ? 'complete' : ''}`}
                              aria-label={`${m.status === 'complete' ? 'Reopen' : 'Complete'} ${m.title}`}
                              disabled={readonly || busy}
                              onClick={() =>
                                void mutate('toggleMilestone', { transactionId: transaction.id, milestoneId: m.id })
                              }
                            >
                              {m.status === 'complete' ? <Check size={17} /> : <Circle size={19} />}
                            </button>
                            <div>
                              <strong>{m.title}</strong>
                              <small>
                                {date(m.dueAt)}
                                {m.sourceId
                                  ? ws.documents.some(document => document.id === m.sourceId)
                                    ? ` · Document evidence${m.dateEvidence?.page ? ` · page ${m.dateEvidence.page}` : ''}`
                                    : ` · Evidence ${m.sourceId}`
                                  : ' · Professional entry'}
                                {m.dateEvidence && m.dateEvidence.proposedDate !== m.dueAt
                                  ? ` · corrected from ${m.dateEvidence.proposedDate}`
                                  : ''}
                              </small>
                              {m.sourceId && ws.documents.some(document => document.id === m.sourceId) && (
                                <a className="fine" href={`/api/documents/${m.sourceId}`}>
                                  Open source document
                                </a>
                              )}
                            </div>
                            {m.status === 'complete' ? (
                              <Badge tone="green">complete</Badge>
                            ) : (
                              <Countdown dueAt={m.dueAt} now={now} />
                            )}
                          </div>
                        ))}
                      {transaction.milestones.length === 0 && <Empty title="Set the next milestone" />}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">PRIVATE DOCUMENT VAULT</span>
                          <h2>Keep the evidence close</h2>
                        </div>
                        <ShieldCheck size={20} />
                      </div>
                      <form
                        onSubmit={async e => {
                          e.preventDefault();
                          const form = e.currentTarget,
                            f = new FormData(form);
                          f.set('transactionId', transaction.id);
                          setBusy(true);
                          try {
                            const d = await request<{ workspace: Workspace }>('/api/documents', f);
                            setWs(d.workspace);
                            form.reset();
                            notify('Document stored. Review any proposed dates.');
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <label className="upload-zone">
                          <Upload size={26} />
                          <strong>Choose a transaction document</strong>
                          <span>PDF or text · Maximum 5 MB</span>
                          <input
                            name="file"
                            type="file"
                            required
                            accept=".pdf,.txt,application/pdf,text/plain"
                            disabled={readonly}
                          />
                        </label>
                        <button className="button full" disabled={busy || readonly}>
                          <Upload size={16} />
                          Upload privately
                        </button>
                      </form>
                      <p className="fine">
                        Ascent reads text files and text-based PDFs for contract dates, including terms like “10 days
                        after ratification”. Scanned PDFs need OCR, which is not connected. Every proposed deadline
                        waits for your review.
                      </p>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Documents & proposed deadlines</h2>
                      <Badge>Private to this team</Badge>
                    </div>
                    {ws.documents
                      .filter(d => d.transactionId === transaction.id)
                      .map(d => (
                        <DocumentDeadlineReview
                          key={d.id}
                          document={d}
                          readonly={readonly}
                          busy={busy}
                          onAction={mutate}
                        />
                      ))}
                    {ws.documents.filter(d => d.transactionId === transaction.id).length === 0 && (
                      <Empty title="A clean document vault">
                        <p>Upload the first document to preserve it with this transaction.</p>
                      </Empty>
                    )}
                  </section>
                </>
              ) : (
                <Empty title="Every closing starts somewhere">
                  <button className="button primary" onClick={() => setModal('transaction')}>
                    Create transaction
                  </button>
                </Empty>
              )}
            </>
          )}
          {page === 'graph' && (
            <>
              {heading(
                'REAL ESTATE DECISION GRAPH',
                'See what connects.',
                'A temporal, source-linked view of the evidence behind your work.',
                sourcesButton,
              )}
              <DecisionGraph
                workspace={ws}
                onProperty={id => {
                  changeProperty(id);
                  go('properties');
                }}
              />
              <section className="panel">
                <div className="panel-heading">
                  <h2>Decision & evidence history</h2>
                  <Badge>{ws.audit.length} audited events</Badge>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>When</th>
                        <th>Entity</th>
                        <th>Integrity reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...ws.audit]
                        .reverse()
                        .slice(0, 30)
                        .map(a => (
                          <tr key={a.id}>
                            <td>
                              <strong>{a.action}</strong>
                              <small>{a.details}</small>
                            </td>
                            <td>{date(a.at)}</td>
                            <td>{a.entityId}</td>
                            <td>
                              <code>{a.hash.slice(0, 18)}</code>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="fine">
                  Hash-linked records detect casual modification; database administrators can rewrite the chain.
                  External immutable anchoring is a production follow-up.
                </p>
              </section>
            </>
          )}
          {page === 'learning' && (
            <>
              {heading(
                'OUTCOME-BASED LEARNING',
                'Measure the thinking. Improve the process.',
                'Preserve forecasts before outcomes, then evaluate what actually happened.',
                <button
                  className="button primary"
                  disabled={readonly || !ws.cmas.length}
                  onClick={() => setModal('outcome')}
                >
                  <Plus size={16} />
                  Record observed outcome
                </button>,
              )}
              <OutcomesView workspace={ws} />
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">A SCIENTIFIC STARTING POINT</span>
                    <h2>What this evaluation can tell you</h2>
                  </div>
                  <BookOpen size={20} />
                </div>
                <p>
                  Observed outcomes can show forecast error and empirical range coverage for this recorded sample. They
                  do not establish causality, demonstrate regional calibration, or prove that one pricing strategy
                  creates better outcomes.
                </p>
                <div className="method-cards">
                  <div>
                    <strong>Preserve before observing</strong>
                    <p>Save a dated CMA before recording a closing. Late or duplicate observations are rejected.</p>
                  </div>
                  <div>
                    <strong>Track who is missing</strong>
                    <p>
                      Sold-only samples miss withdrawn and unsold listings. Compare cohorts and data completeness before
                      drawing conclusions.
                    </p>
                  </div>
                  <div>
                    <strong>Evaluate forward</strong>
                    <p>
                      Use time-separated holdouts, a fixed baseline, and market cohorts before changing coefficients. No
                      automated retraining is enabled.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
          {page === 'reports' && (
            <>
              {heading(
                'CLIENT-READY MATERIALS',
                'Clear thinking, ready to share.',
                'Printable reports preserve the calculation, evidence, caveats, and professional review status.',
                <button className="button primary" onClick={() => go('cma')}>
                  <Plus size={16} />
                  Create a CMA
                </button>,
              )}
              <div className="report-grid">
                {ws.cmas.map(c => (
                  <section className="panel report-card" key={c.id}>
                    <span className="report-icon">
                      <FileText size={30} />
                    </span>
                    <Badge tone={c.approvedAt ? 'green' : 'peach'}>
                      {c.approvedAt ? 'Workspace review recorded' : 'Draft · review required'}
                    </Badge>
                    <h2>{c.name}</h2>
                    <p>
                      {c.result.comps.length} comparable sales · {date(c.createdAt)}
                    </p>
                    <strong className="report-price">{money(c.result.estimate)}</strong>
                    <p className="fine">
                      Calculation {c.result.calculationHash.slice(0, 16)} · All source references included
                    </p>
                    <a className="button full" href={reportHref(c.id)} target="_blank" rel="noreferrer">
                      <Download size={16} />
                      Open printable client report
                    </a>
                    <a className="button full" href={reportHref(c.id, true)} target="_blank" rel="noreferrer">
                      <ArrowUpRight size={16} />
                      Open listing presentation
                    </a>
                  </section>
                ))}
              </div>
              {!ws.cmas.length && (
                <Empty title="Your first report starts with evidence">
                  <p>Save a CMA snapshot in Pricing studio to create a reproducible report.</p>
                  <button className="button primary" onClick={() => go('cma')}>
                    Open pricing studio
                  </button>
                </Empty>
              )}
            </>
          )}
          {page === 'settings' && (
            <>
              {heading(
                'PROFESSIONAL INFRASTRUCTURE',
                'A workspace built on trust.',
                'Manage retention, review access boundaries, and inspect integration readiness.',
              )}
              <div className="settings-grid">
                <section className="panel">
                  <h2>Organization & retention</h2>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void mutate('updateSettings', {
                        organization: f.get('organization'),
                        retentionDays: Number(f.get('retentionDays')),
                      });
                    }}
                  >
                    <label>
                      Organization name
                      <input name="organization" defaultValue={ws.settings.organization} required minLength={2} />
                    </label>
                    <label>
                      Document retention (days)
                      <input
                        name="retentionDays"
                        type="number"
                        min="1"
                        max="3650"
                        defaultValue={ws.settings.retentionDays}
                      />
                    </label>
                    <button className="button primary" disabled={user.role !== 'owner' || busy}>
                      Save workspace settings
                    </button>
                  </form>
                  <button
                    className="text-button retention-action"
                    disabled={user.role !== 'owner' || busy}
                    onClick={() => void mutate('purgeExpiredDocuments')}
                  >
                    Apply retention to expired documents
                    <ArrowRight size={14} />
                  </button>
                  <p className="fine">
                    Retention uses upload date. Documents inside the retention window are preserved. Audit metadata
                    remains.
                  </p>
                </section>
                <section className="panel">
                  <h2>Access & integration status</h2>
                  <div className="integration-row">
                    <span>Your access</span>
                    <Badge tone="green">{user.role}</Badge>
                  </div>
                  {[
                    ['Persistence', ws.mode === 'demo' ? 'Local SQLite · isolated tenants' : 'PostgreSQL'],
                    ['Licensed MLS / RESO', 'Not connected'],
                    ['Mortgage rates', 'Not connected'],
                    ['Email delivery', 'Not connected'],
                    ['Contextual copilot', 'Evidence retrieval enabled'],
                    ['Model synthesis', 'Optional server configuration'],
                    ['Document extraction', 'Text dates · human review'],
                  ].map(([k, v]) => (
                    <div className="integration-row" key={k}>
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                  <p className="fine">
                    Owner and agent roles can review decisions; viewers can inspect and export. Team provisioning is an
                    administrative deployment operation. No real client messages, offers, or listing changes are sent by
                    this application.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === 'domain' && (
            <DomainView workspace={ws} user={user} onWorkspace={applyWorkspace} propertyId={property?.id} />
          )}{' '}
          {page === 'academy' && (
            <AcademyView
              workspace={ws}
              user={user}
              onWorkspace={applyWorkspace}
              propertyId={property?.id}
              onNavigate={go}
            />
          )}{' '}
          {page === 'portability' && <PortabilityView workspace={ws} user={user} onWorkspace={applyWorkspace} />}{' '}
          {page === 'improvement' && <ImprovementView workspace={ws} user={user} onWorkspace={applyWorkspace} />}{' '}
          {page === 'ai' && <InferenceView />}{' '}
          {page === 'settings' && <IntegrationKeysView workspace={ws} user={user} onWorkspace={applyWorkspace} />}{' '}
          {page === 'access' && <AccessView workspace={ws} user={user} onWorkspace={applyWorkspace} />}{' '}
          {page === 'billing' && <BillingView workspace={ws} user={user} onWorkspace={applyWorkspace} />}{' '}
          {page === 'team' && <TeamView workspace={ws} user={user} onWorkspace={applyWorkspace} />}{' '}
          {page === 'fabric' && (
            <FabricView
              workspace={ws}
              user={user}
              onWorkspace={applyWorkspace}
              onRegion={id => {
                const p = ws.fabric?.records.find(r => r.regionId === id && r.propertyId);
                if (p?.propertyId) changeProperty(p.propertyId);
              }}
            />
          )}{' '}
        </main>
        <footer className="workspace-footer">
          <span>
            <ShieldCheck size={13} /> Evidence-led. Professional review required.
          </span>
          <span>
            Ascent · Independent successor ·{' '}
            {providerResearch || hasLicensedData
              ? 'Sources labeled per evidence'
              : ws.mode === 'demo'
                ? 'Synthetic demo'
                : 'Authorized workspace'}
          </span>
        </footer>
      </div>
      <button className={`floating-copilot ${assistantOpen ? 'hidden' : ''}`} onClick={() => setAssistantOpen(true)}>
        <Sparkles size={19} />
        <span>Ask Ascent</span>
        <kbd>✦</kbd>
      </button>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={`modal ${modal === 'sources' ? 'wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h2 id="modal-title">
                  {modal === 'sources'
                    ? 'Sources & evidence boundaries'
                    : modal === 'client'
                      ? editClient
                        ? 'Edit client'
                        : 'Add a client'
                      : modal === 'offer'
                        ? 'Record an offer'
                        : modal === 'transaction'
                          ? 'Start a transaction'
                          : modal === 'search'
                            ? 'Save a client search'
                            : modal === 'milestone'
                              ? 'Add a reviewed deadline'
                              : 'Record an observed outcome'}
                </h2>
              </div>
              <button className="icon-button" aria-label="Close dialog" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </div>
            {modal === 'sources' ? (
              <>
                <p>
                  Bundled demonstration records are fictional. Authorized provider observations are labeled with their
                  actual source and retrieval time. Coordinates alone do not establish verified property facts. Source
                  rights and freshness travel with each record.
                </p>
                {ws.sources.map(s => (
                  <article className="source-record" key={s.id}>
                    <Badge tone={s.kind === 'synthetic' ? 'peach' : 'green'}>{s.kind}</Badge>
                    <h3>{s.label}</h3>
                    <code>{s.id}</code>
                    <p>{s.license}</p>
                    <small>
                      Observed {date(s.observedAt)} · Declared confidence {(s.confidence * 100).toFixed(0)}% (source
                      metadata, not model accuracy)
                    </small>
                  </article>
                ))}
                <div className="method-note">
                  Pricing assumptions are transparent analyst inputs. Provider observations remain distinct from bundled
                  fictional clients and outcomes. No MLS completeness, inspected appraisal or verified transaction
                  outcome is implied. Private Homesolo behavior remains unverified.
                </div>
              </>
            ) : (
              <form onSubmit={e => void submitModal(e)}>
                {modal === 'client' && (
                  <>
                    <label>
                      Client name
                      <input name="name" defaultValue={editClient?.name} required minLength={2} />
                    </label>
                    <div className="form-grid">
                      <label>
                        Email
                        <input name="email" type="email" defaultValue={editClient?.email} required />
                      </label>
                      <label>
                        Phone
                        <input
                          name="phone"
                          type="tel"
                          autoComplete="off"
                          maxLength={30}
                          pattern="[0-9+().\-\s]*"
                          placeholder="Optional"
                          defaultValue={editClient?.phone}
                        />
                      </label>
                      <label>
                        Role
                        <select name="role" defaultValue={editClient?.role || ''}>
                          <option value="">Not set</option>
                          {clientRoles.map(role => (
                            <option key={role} value={role}>
                              {clientRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Stage
                        <select name="stage" defaultValue={editClient?.stage || 'active'}>
                          {clientStages.map(stage => (
                            <option key={stage} value={stage}>
                              {clientStageLabel(stage)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Budget ($)
                        <input
                          name="budget"
                          type="number"
                          min="1"
                          defaultValue={editClient?.budget || 750000}
                          required
                        />
                      </label>
                    </div>
                    <label>
                      Property preferences
                      <textarea
                        name="preferences"
                        defaultValue={editClient?.preferences}
                        required
                        placeholder="Property needs, timing, and budget constraints. Exclude protected characteristics."
                      />
                    </label>
                  </>
                )}
                {modal === 'offer' && (
                  <>
                    <label>
                      Buyer / offer reference
                      <input name="buyer" required minLength={2} />
                    </label>
                    <div className="form-grid">
                      <label>
                        Offer price ($)
                        <input name="price" type="number" min="1" defaultValue={property?.price} required />
                      </label>
                      <label>
                        Seller credit ($)
                        <input name="sellerCredit" type="number" min="0" defaultValue={0} required />
                      </label>
                      <label>
                        Financing
                        <select name="financing">
                          <option value="conventional">Conventional</option>
                          <option value="cash">Cash</option>
                          <option value="fha">FHA</option>
                          <option value="va">VA</option>
                        </select>
                      </label>
                      <label>
                        Down payment (%)
                        <input name="downPercent" type="number" min="0" max="100" defaultValue={20} required />
                      </label>
                      <label>
                        Earnest money ($)
                        <input name="earnestMoney" type="number" min="0" defaultValue={15000} required />
                      </label>
                      <label>
                        Close date
                        <input name="closeDate" type="date" required />
                      </label>
                      <label>
                        Expiration date
                        <input name="expiresAt" type="date" required />
                      </label>
                    </div>
                    <label>
                      Contingencies (comma separated)
                      <input name="contingencies" defaultValue="inspection, financing, appraisal" />
                    </label>
                  </>
                )}
                {modal === 'transaction' && (
                  <>
                    <label>
                      Property
                      <select name="propertyId" defaultValue={property?.id}>
                        {ws.properties.map(p => (
                          <option value={p.id} key={p.id}>
                            {p.address}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Client
                      <select name="clientId" required>
                        {ws.clients.map(c => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {modal === 'search' && (
                  <>
                    <label>
                      Search name
                      <input name="name" minLength={2} required placeholder="North Austin · 3 beds" />
                    </label>
                    <label>
                      Location query
                      <input name="query" defaultValue={query} placeholder="City, address, or ZIP" />
                    </label>
                    <label>
                      Maximum price ($)
                      <input name="maxPrice" type="number" min="1" defaultValue={client?.budget || 800000} required />
                    </label>
                    <p className="fine">
                      Saved to {client?.name || 'your workspace'}. Live alerts need an authorized data feed.
                    </p>
                    <SearchCriteriaFields />
                  </>
                )}
                {modal === 'milestone' && (
                  <>
                    <label>
                      Deadline title
                      <input name="title" required minLength={2} />
                    </label>
                    <label>
                      Reviewed due date
                      <input name="dueAt" type="date" required />
                    </label>
                  </>
                )}
                {modal === 'outcome' && (
                  <>
                    <label>
                      Preserved forecast
                      <select name="cmaId" required>
                        {ws.cmas.map(c => (
                          <option value={c.id} key={c.id}>
                            {c.name} · {money(c.result.estimate)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Observed closing price ($)
                      <input name="actualPrice" type="number" min="1" required />
                    </label>
                    <label>
                      Observed date
                      <input name="observedAt" type="date" required />
                    </label>
                    <label>
                      Source / evaluation notes
                      <textarea
                        name="notes"
                        required
                        placeholder="Identify the source and any missing cases or data-use restrictions."
                      />
                    </label>
                    <p className="fine">
                      In demo mode this is a synthetic outcome. Production requires licensed evidence.
                    </p>
                  </>
                )}
                <div className="modal-footer">
                  <button type="button" className="button" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button className="button primary" disabled={busy || readonly}>
                    {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Save to workspace
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {commandOpen && (
        <div className="modal-backdrop" onClick={() => setCommandOpen(false)}>
          <section
            className="command-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Command search"
            onClick={e => e.stopPropagation()}
          >
            <label>
              <Search size={20} />
              <input
                autoFocus
                placeholder="Find a page, property, or client…"
                aria-label="Search workspace commands"
                value={command}
                onChange={e => setCommand(e.target.value)}
              />
              <button aria-label="Close search" className="icon-button" onClick={() => setCommandOpen(false)}>
                <X size={18} />
              </button>
            </label>
            <div className="command-results">
              {nav
                .filter(n => n.label.toLowerCase().includes(command.toLowerCase()))
                .map(n => (
                  <button key={n.page} onClick={() => go(n.page)}>
                    <n.icon size={17} />
                    <span>{n.label}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              {ws.properties
                .filter(p => command && p.address.toLowerCase().includes(command.toLowerCase()))
                .map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      changeProperty(p.id);
                      go('properties');
                    }}
                  >
                    <Home size={17} />
                    {p.address}
                    <Badge>Property</Badge>
                  </button>
                ))}
              {ws.clients
                .filter(c => command && c.name.toLowerCase().includes(command.toLowerCase()))
                .map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setClientId(c.id);
                      go('clients');
                    }}
                  >
                    <Users size={17} />
                    {c.name}
                    <Badge>Client</Badge>
                  </button>
                ))}
            </div>
            <small>Use Tab to navigate · Enter to open · Esc to close</small>
          </section>
        </div>
      )}
      {assistantOpen && (
        <aside className="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="copilot-title">
          <div className="assistant-heading">
            <span className="copilot-symbol">
              <Sparkles size={20} />
            </span>
            <div>
              <h2 id="copilot-title">A little more perspective.</h2>
              <small>Ascent contextual copilot</small>
            </div>
            <button className="icon-button" aria-label="Close copilot" onClick={() => setAssistantOpen(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="assistant-context">
            <span className="status-dot" />
            {nav.find(n => n.page === page)?.label || page} · {property?.address}
          </div>
          <div className="assistant-messages">
            {conversation.length === 0 && (
              <div className="assistant-welcome">
                <Sparkles size={32} />
                <h3>
                  Your evidence.
                  <br />A clearer next step.
                </h3>
                <p>
                  I can retrieve this workspace’s records, explain computations, identify missing information, and draft
                  material for your review.
                </p>
                {[
                  'Explain the pricing evidence for this property.',
                  'What could make this valuation unreliable?',
                  'Compare offers and explain the tradeoffs.',
                  'What deadlines need my attention?',
                ].map(q => (
                  <button key={q} onClick={() => void ask(q)}>
                    {q}
                    <ArrowUpRight size={14} />
                  </button>
                ))}
                <small>
                  Evidence mode works without a model API. Model synthesis is optional. Nothing is sent or executed on
                  your behalf.
                </small>
              </div>
            )}
            {conversation.map((c, i) => (
              <div className="conversation-turn" key={i}>
                <div className="user-message">{c.question}</div>
                <div className="assistant-message">
                  <Badge tone="green">
                    {c.response.mode === 'model' ? 'Model synthesis' : 'Evidence retrieval'} ·{' '}
                    {c.response.computed ? 'Computed results' : 'Recorded context'}
                  </Badge>
                  <div className="answer-text">{c.response.answer}</div>
                  {c.response.citations.length > 0 && (
                    <details open>
                      <summary>Supporting evidence ({c.response.citations.length})</summary>
                      {c.response.citations.map((s, j) => (
                        <div className="citation" key={j}>
                          <BookOpen size={12} />
                          <span>
                            <strong>{s.label}</strong>
                            <small>{s.detail}</small>
                            <code>{s.id}</code>
                          </span>
                        </div>
                      ))}
                    </details>
                  )}
                  {c.response.missingInformation.length > 0 && (
                    <div className="missing-info">
                      <strong>Information to confirm</strong>
                      <ul>
                        {c.response.missingInformation.map((m, j) => (
                          <li key={j}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.response.suggestedActions.map((a, j) => (
                    <p className="suggested-action" key={j}>
                      <ArrowRight size={13} />
                      {a}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="assistant-thinking" role="status">
                <LoaderCircle size={16} className="spin" />
                Retrieving authorized evidence…
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form
            className="assistant-input"
            onSubmit={e => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor="assistant-question">
              Ask about this workspace
            </label>
            <textarea
              id="assistant-question"
              value={assistantMessage}
              onChange={e => setAssistantMessage(e.target.value)}
              placeholder="Ask a question about your workspace…"
              required
              maxLength={4000}
            />
            <button
              className="button primary"
              aria-label="Send question"
              disabled={chatBusy || !assistantMessage.trim()}
            >
              <Send size={17} />
            </button>
          </form>
          <p className="assistant-footnote">Inspect the sources. Use professional judgment.</p>
        </aside>
      )}
    </div>
  );
}

function GeoMap({
  properties,
  selectedId,
  onSelect,
}: {
  properties: Property[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const bounds = useMemo(() => {
    const lats = properties.map(p => p.lat),
      lngs = properties.map(p => p.lng);
    return {
      minLat: Math.min(...lats) - 0.005,
      maxLat: Math.max(...lats) + 0.005,
      minLng: Math.min(...lngs) - 0.005,
      maxLng: Math.max(...lngs) + 0.005,
    };
  }, [properties]);
  return (
    <section className="geo-map panel" aria-label="Geographic property explorer">
      <div className="map-heading">
        <span>
          <MapPin size={15} />
          Geographic perspective
        </span>
        <Badge>Schematic · no map tiles</Badge>
      </div>
      <svg viewBox="0 0 600 340" aria-label="Property coordinates plotted relative to one another" role="group">
        <defs>
          <pattern id="mapgrid" width="54" height="42" patternUnits="userSpaceOnUse">
            <rect width="54" height="42" fill="#eef0e6" />
            <rect x="4" y="4" width="44" height="32" rx="4" fill="#e0e7d7" />
          </pattern>
        </defs>
        <rect width="600" height="340" fill="url(#mapgrid)" />
        <path d="M-10 290 Q120 210 260 240 T620 160" fill="none" stroke="#bfd6d8" strokeWidth="30" />
        <path d="M-10 80 L620 210 M130 -10 L220 350 M460 -10 L350 350" fill="none" stroke="#fffdf4" strokeWidth="13" />
        <path d="M-10 80 L620 210" stroke="#d9c9a7" strokeWidth="2" />
        <text x="33" y="36" fontSize="11" fill="#67766a" letterSpacing="3">
          SCHEMATIC · SYNTHETIC RECORDS
        </text>
        {properties.map(p => {
          const x = 35 + ((p.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 530,
            y = 310 - ((p.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 260;
          return (
            <g
              key={p.id}
              className={`map-point ${selectedId === p.id ? 'selected' : ''}`}
              transform={`translate(${x},${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${p.address}, ${money(p.price)}`}
              onClick={() => onSelect(p.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p.id);
                }
              }}
            >
              <title>{p.address}</title>
              <rect x="-29" y="-13" rx="13" width="58" height="27" />
              <text textAnchor="middle" y="5" fontSize="11" fontWeight="600">
                {compact(p.soldPrice || p.price)}
              </text>
            </g>
          );
        })}
        <text x="575" y="324" textAnchor="end" fontSize="12" fill="#67766a">
          N ↑
        </text>
      </svg>
      <div className="map-caption">
        <span className="status-dot" />
        Locations from dataset coordinates · Select a price to inspect a record
      </div>
    </section>
  );
}
function DecisionGraph({ workspace, onProperty }: { workspace: Workspace; onProperty: (id: string) => void }) {
  const graph = useMemo(() => buildDecisionGraph(workspace), [workspace]),
    [selected, setSelected] = useState<string>(''),
    [graphQuery, setGraphQuery] = useState(''),
    [graphType, setGraphType] = useState('all'),
    [graphPage, setGraphPage] = useState(0);
  const filteredNodes = graph.nodes.filter(
    n => (graphType === 'all' || n.type === graphType) && n.label.toLowerCase().includes(graphQuery.toLowerCase()),
  );
  const neighborIds = new Set(
    graph.edges.filter(e => e.from === selected || e.to === selected).flatMap(e => [e.from, e.to]),
  );
  const nodes = selected
      ? graph.nodes.filter(n => n.id === selected || neighborIds.has(n.id)).slice(0, 30)
      : filteredNodes.slice(graphPage * 24, (graphPage + 1) * 24),
    node = graph.nodes.find(n => n.id === selected);
  const positions = new Map(
    nodes.map((n, i) => [
      n.id,
      {
        x: 450 + Math.cos((i * 2 * Math.PI) / nodes.length) * 315,
        y: 255 + Math.sin((i * 2 * Math.PI) / nodes.length) * 190,
      },
    ]),
  );
  return (
    <div className="graph-layout">
      <section className="panel graph-canvas">
        <div className="panel-heading">
          <h2>An inspectable chain of reasoning</h2>
          <Badge>
            {graph.nodes.length} nodes · {graph.edges.length} relationships
          </Badge>
        </div>
        <div className="graph-toolbar">
          <label>
            <Search size={15} />
            <input
              aria-label="Search decision graph"
              placeholder="Find any property, decision, or relationship…"
              value={graphQuery}
              onChange={e => {
                setGraphQuery(e.target.value);
                setGraphPage(0);
                setSelected('');
              }}
            />
          </label>
          <select
            aria-label="Graph node type"
            value={graphType}
            onChange={e => {
              setGraphType(e.target.value);
              setGraphPage(0);
              setSelected('');
            }}
          >
            <option value="all">All node types</option>
            {Array.from(new Set(graph.nodes.map(n => n.type)))
              .sort()
              .map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>
        </div>
        <svg viewBox="0 0 900 510" role="group" aria-label="Temporal decision graph">
          <defs>
            <radialGradient id="graphbg">
              <stop stopColor="#f0f3e9" />
              <stop offset="1" stopColor="#fff" />
            </radialGradient>
          </defs>
          <rect width="900" height="510" fill="url(#graphbg)" />
          {graph.edges
            .filter(e => positions.has(e.from) && positions.has(e.to))
            .map(e => {
              const a = positions.get(e.from)!,
                b = positions.get(e.to)!;
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={e.from === selected || e.to === selected ? '#46836e' : '#dce3d9'}
                  strokeWidth={e.from === selected || e.to === selected ? 2.5 : 1}
                />
              );
            })}
          {nodes.map(n => {
            const p = positions.get(n.id)!;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${n.type}: ${n.label}`}
                onClick={() => setSelected(n.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') setSelected(n.id);
                }}
                className="graph-node"
              >
                <circle
                  r={n.id === selected ? 19 : 13}
                  fill={n.type.includes('property') ? '#294e41' : n.type.includes('source') ? '#dda989' : '#819b9d'}
                />
                <text y={31} textAnchor="middle" fontSize="10" fill="#44554e">
                  {n.label.slice(0, 24)}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="map-caption">
          <span>
            <i className="legend-dot green" />
            Property
          </span>
          <span>
            <i className="legend-dot peach" />
            Evidence source
          </span>
          <span>
            <i className="legend-dot blue" />
            Decision / relationship
          </span>
          <span>
            {selected
              ? `Focused neighborhood · ${nodes.length} nodes`
              : `Showing ${filteredNodes.length ? graphPage * 24 + 1 : 0}–${Math.min((graphPage + 1) * 24, filteredNodes.length)} of ${filteredNodes.length}`}
          </span>
          {selected ? (
            <button className="text-button" onClick={() => setSelected('')}>
              Return to all nodes
            </button>
          ) : (
            <>
              <button
                className="button small"
                aria-label="Previous graph page"
                disabled={graphPage === 0}
                onClick={() => setGraphPage(p => Math.max(0, p - 1))}
              >
                <ArrowLeft size={12} />
              </button>
              <button
                className="button small"
                aria-label="Next graph page"
                disabled={(graphPage + 1) * 24 >= filteredNodes.length}
                onClick={() => setGraphPage(p => p + 1)}
              >
                <ArrowRight size={12} />
              </button>
            </>
          )}
        </div>
      </section>
      <section className="panel graph-inspector">
        <span className="eyebrow">INSPECT THE CONTEXT</span>
        {node ? (
          <>
            <h2>{node.label}</h2>
            <Badge>{node.type}</Badge>
            <dl className="offer-facts">
              <div>
                <dt>Valid from</dt>
                <dd>{date(node.validFrom)}</dd>
              </div>
              <div>
                <dt>Source confidence</dt>
                <dd>{Math.round(node.confidence * 100)}%</dd>
              </div>
            </dl>
            <h4>Supporting sources</h4>
            {node.sourceIds.map(s => (
              <code key={s}>
                {s}
                <br />
              </code>
            ))}
            <h4>Connected relationships</h4>
            {graph.edges
              .filter(e => e.from === node.id || e.to === node.id)
              .slice(0, 12)
              .map(e => (
                <p key={e.id}>
                  {e.relation} → {graph.nodes.find(n => n.id === (e.from === node.id ? e.to : e.from))?.label || e.to}
                </p>
              ))}
            {workspace.properties.some(p => p.id === node.id.replace(/^property:/, '')) && (
              <button className="button" onClick={() => onProperty(node.id.replace(/^property:/, ''))}>
                Inspect property
                <ArrowUpRight size={14} />
              </button>
            )}
          </>
        ) : (
          <>
            <GitBranch size={36} />
            <h2>Follow the evidence.</h2>
            <p>Select a node to inspect its dates, provenance, and relationships.</p>
            <p className="fine">
              Edges represent recorded relationships. They do not imply causal influence. Temporal validity and source
              metadata travel with every connection.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
function OutcomesView({ workspace }: { workspace: Workspace }) {
  const evaluation = evaluateOutcomes(workspace.cmas, workspace.outcomes);
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Evaluable observations"
          value={String(evaluation.count)}
          detail={`${workspace.cmas.length} preserved forecasts · ${evaluation.excluded.length} exclusions`}
          icon={GitBranch}
        />
        <Metric
          label="Mean absolute error"
          value={evaluation.meanAbsoluteError === null ? 'Unmeasured' : money(evaluation.meanAbsoluteError)}
          detail={
            evaluation.meanAbsolutePercentError === null
              ? 'Record a later outcome'
              : `${evaluation.meanAbsolutePercentError.toFixed(2)}% mean absolute percent error`
          }
          icon={Activity}
        />
        <Metric
          label="Empirical range coverage"
          value={
            evaluation.empiricalRangeCoverage === null
              ? 'Unmeasured'
              : `${evaluation.empiricalRangeCoverage.toFixed(0)}%`
          }
          detail="Observed sample only · not calibrated confidence"
          icon={CheckCircle2}
        />
        <Metric
          label="Data environment"
          value={workspace.mode === 'demo' ? 'Synthetic' : 'Licensed'}
          detail="Synthetic outcomes verify evaluation plumbing"
          icon={ShieldCheck}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Frozen forecasts meet observed outcomes</h2>
          <Badge>{evaluation.count} evaluable observations</Badge>
        </div>
        {evaluation.count ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Property / preserved decision</th>
                  <th>Forecast</th>
                  <th>Observed price</th>
                  <th>Absolute error</th>
                  <th>Within empirical range</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.samples.map(s => {
                  const record = workspace.cmas.find(c => c.id === s.cmaId);
                  return (
                    <tr key={s.outcomeId}>
                      <td>
                        <strong>{record?.name}</strong>
                        <small>{s.cmaId}</small>
                      </td>
                      <td>{money(s.predicted)}</td>
                      <td>{money(s.actual)}</td>
                      <td>
                        {money(Math.abs(s.signedError))}
                        <small>{s.absolutePercentError.toFixed(2)}%</small>
                      </td>
                      <td>
                        <Badge tone={s.inRange ? 'green' : 'peach'}>{s.inRange ? 'Yes' : 'No'}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="The right answer is “not measured yet.”">
            <p>Save a forecast and record a later observed outcome to begin evaluating error and range coverage.</p>
          </Empty>
        )}
        <ul className="caution-list">
          {evaluation.warnings
            .filter(w => /Synthetic|Fewer|selection|Closed-sale/.test(w))
            .map((w, i) => (
              <li key={i}>
                <Circle size={8} />
                {w}
              </li>
            ))}
        </ul>
      </section>
    </>
  );
}
