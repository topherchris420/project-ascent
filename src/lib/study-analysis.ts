/**
 * Pre-registered analysis for the Ascent / HomeSolo task-based preference study (protocol ascent-preference-1).
 * Pure functions only: the facilitator's CSVs go in, a report comes out, and every number is reproducible.
 */
export const STUDY_PROTOCOL_ID = 'ascent-preference-1';
export const PRODUCTS = ['ascent', 'homesolo'] as const;
export type Product = (typeof PRODUCTS)[number];
export const TASK_IDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const;
export type TaskId = (typeof TASK_IDS)[number];

/** Fixed before recruitment. Changing any value changes the protocol and must be reported as a deviation. */
export const STUDY_TARGETS = {
  completers: 10,
  preferenceCount: 7,
  ascentTaskSuccessRate: 0.95,
  criticalArithmeticErrors: 0,
  unauthorizedDisclosures: 0,
} as const;

export type Participant = {
  id: string;
  firstProduct: Product;
  status: 'completed' | 'withdrawn';
  withdrawalReason?: string;
};
export type TaskResult = {
  participantId: string;
  product: Product;
  task: TaskId;
  /** 'supported' unless the product cannot accept the shared evidence; unsupported tasks are reported, never dropped. */
  supported: boolean;
  completed: boolean;
  correct: boolean;
  seconds: number | null;
  criticalArithmeticError: boolean;
  unauthorizedDisclosure: boolean;
  assisted: boolean;
};
export type Preference = { participantId: string; choice: Product | 'none'; reasons: string };

/** log C(n, k) as a sum of logs; exact to floating-point precision for study-sized samples. */
const logChoose = (n: number, k: number) => {
  let total = 0;
  for (let i = 1; i <= k; i++) total += Math.log((n - k + i) / i);
  return total;
};
export const binomialPmf = (k: number, n: number, p: number) =>
  p === 0
    ? k === 0
      ? 1
      : 0
    : p === 1
      ? k === n
        ? 1
        : 0
      : Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
/** P(X >= k) for X ~ Binomial(n, p). */
export const binomialUpperTail = (k: number, n: number, p: number) => {
  let total = 0;
  for (let i = k; i <= n; i++) total += binomialPmf(i, n, p);
  return Math.min(1, total);
};
const binomialLowerTail = (k: number, n: number, p: number) => {
  let total = 0;
  for (let i = 0; i <= k; i++) total += binomialPmf(i, n, p);
  return Math.min(1, total);
};
/** Exact (Clopper-Pearson) two-sided confidence interval for k successes in n trials. */
export function clopperPearson(k: number, n: number, confidence = 0.95): [number, number] {
  if (n === 0) return [0, 1];
  const alpha = (1 - confidence) / 2;
  const solve = (f: (p: number) => number) => {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const lower = k === 0 ? 0 : solve(p => binomialUpperTail(k, n, p) - alpha);
  const upper = k === n ? 1 : solve(p => alpha - binomialLowerTail(k, n, p));
  return [lower, upper];
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * The pre-registered analysis. Withdrawals stay in the denominator as "not preferring Ascent" and are listed;
 * ties ("none") also count as not preferring Ascent. Unsupported tasks are reported separately, never dropped.
 */
export function analyzeStudy(participants: Participant[], results: TaskResult[], preferences: Preference[]) {
  const issues: string[] = [];
  const ids = new Set(participants.map(p => p.id));
  if (ids.size !== participants.length) issues.push('Duplicate participant IDs.');
  for (const row of [...results, ...preferences])
    if (!ids.has(row.participantId)) issues.push(`Row references unknown participant ${row.participantId}.`);
  const firsts = PRODUCTS.map(product => participants.filter(p => p.firstProduct === product).length);
  if (firsts[0] !== firsts[1])
    issues.push(`Order is not counterbalanced: ${firsts[0]} Ascent-first, ${firsts[1]} HomeSolo-first.`);
  const enrolled = participants.length;
  const completers = participants.filter(p => p.status === 'completed');
  const preferAscent = completers.filter(
    p => preferences.find(pref => pref.participantId === p.id)?.choice === 'ascent',
  ).length;
  const preferHomesolo = completers.filter(
    p => preferences.find(pref => pref.participantId === p.id)?.choice === 'homesolo',
  ).length;
  const denominator = enrolled; // withdrawals count against the target
  const [low, high] = clopperPearson(preferAscent, denominator);
  const tasks = PRODUCTS.map(product => {
    const rows = results.filter(r => r.product === product);
    const supported = rows.filter(r => r.supported);
    const success = supported.filter(r => r.completed && r.correct);
    return {
      product,
      attempted: rows.length,
      supported: supported.length,
      unsupported: rows.length - supported.length,
      successes: success.length,
      successRate: supported.length ? success.length / supported.length : null,
      assisted: rows.filter(r => r.assisted).length,
      criticalArithmeticErrors: rows.filter(r => r.criticalArithmeticError).length,
      unauthorizedDisclosures: rows.filter(r => r.unauthorizedDisclosure).length,
      byTask: TASK_IDS.map(task => {
        const taskRows = rows.filter(r => r.task === task);
        const ok = taskRows.filter(r => r.supported && r.completed && r.correct);
        return {
          task,
          supported: taskRows.filter(r => r.supported).length,
          successes: ok.length,
          medianSeconds: median(ok.map(r => r.seconds).filter((s): s is number => s !== null)),
        };
      }),
    };
  });
  // Paired time comparison per task: only participants who completed the task correctly in both products.
  const paired = TASK_IDS.map(task => {
    const differences = completers
      .map(p => {
        const a = results.find(r => r.participantId === p.id && r.task === task && r.product === 'ascent');
        const h = results.find(r => r.participantId === p.id && r.task === task && r.product === 'homesolo');
        return a?.correct && h?.correct && a.seconds !== null && h.seconds !== null ? a.seconds - h.seconds : null;
      })
      .filter((d): d is number => d !== null);
    const faster = differences.filter(d => d < 0).length,
      slower = differences.filter(d => d > 0).length;
    const n = faster + slower;
    // Two-sided exact sign test on non-zero differences.
    const signP = n ? Math.min(1, 2 * binomialUpperTail(Math.max(faster, slower), n, 0.5)) : null;
    return {
      task,
      pairs: differences.length,
      medianDifferenceSeconds: median(differences),
      ascentFaster: faster,
      signTestP: signP,
    };
  });
  const ascent = tasks.find(t => t.product === 'ascent')!;
  const targets = {
    preference: {
      target: `${STUDY_TARGETS.preferenceCount} of ${STUDY_TARGETS.completers}`,
      observed: `${preferAscent} of ${denominator}`,
      met: denominator >= STUDY_TARGETS.completers && preferAscent >= STUDY_TARGETS.preferenceCount,
    },
    ascentTaskSuccess: {
      target: STUDY_TARGETS.ascentTaskSuccessRate,
      observed: ascent.successRate,
      met: ascent.successRate !== null && ascent.successRate >= STUDY_TARGETS.ascentTaskSuccessRate,
    },
    criticalArithmeticErrors: {
      target: 0,
      observed: ascent.criticalArithmeticErrors,
      met: ascent.criticalArithmeticErrors === 0,
    },
    unauthorizedDisclosures: {
      target: 0,
      observed: ascent.unauthorizedDisclosures,
      met: ascent.unauthorizedDisclosures === 0,
    },
  };
  return {
    protocol: STUDY_PROTOCOL_ID,
    valid: issues.length === 0,
    issues,
    enrolled,
    completers: completers.length,
    withdrawals: participants
      .filter(p => p.status === 'withdrawn')
      .map(p => ({ id: p.id, reason: p.withdrawalReason ?? '' })),
    preference: {
      ascent: preferAscent,
      homesolo: preferHomesolo,
      none: completers.length - preferAscent - preferHomesolo,
      share: denominator ? preferAscent / denominator : null,
      ci95: [low, high] as [number, number],
      // One-sided exact test against an even split; reported, but the study is not powered to establish superiority.
      pVersusEvenSplit: denominator ? binomialUpperTail(preferAscent, denominator, 0.5) : null,
    },
    tasks,
    paired,
    targets,
    interpretation:
      'A met preference target is a pre-registered product bar for this sample, not evidence of population-wide superiority, valuation accuracy or business outcomes. With ten participants the 95% interval is wide; report it beside the count.',
  };
}

/**
 * Deterministic counterbalanced assignment. Tasks build on each other, so their order is fixed (T1 to T6). Product
 * order alternates, and each participant prices a different subject home in each product (pairing alternates too),
 * so learning a home in the first product cannot help the second.
 */
export function randomizeStudy(participantIds: string[], seed: number) {
  let state = seed >>> 0 || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const shuffled = [...participantIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map((id, index) => {
    const swap = Math.floor(index / 2) % 2 === 1;
    return {
      id,
      firstProduct: (index % 2 === 0 ? 'ascent' : 'homesolo') as Product,
      subjects: { ascent: swap ? 'Subject B' : 'Subject A', homesolo: swap ? 'Subject A' : 'Subject B' },
      taskOrder: [...TASK_IDS],
    };
  });
}

/** Parse a facilitator CSV with a header row; values are trimmed and empty cells become ''. */
export function parseStudyCsv(text: string): Record<string, string>[] {
  const [header, ...lines] = text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
  const keys = header.split(',').map(key => key.trim());
  return lines.map(line => {
    const cells: string[] = [];
    let field = '',
      quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(field.trim());
        field = '';
      } else field += ch;
    }
    cells.push(field.trim());
    return Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? '']));
  });
}
