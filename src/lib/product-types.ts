export type ProductFeature =
  'cma' | 'clients' | 'offers' | 'transactions' | 'reports' | 'academy' | 'migration' | 'assistant' | 'fabric';
export type ProductMetric = {
  feature: ProductFeature;
  opens: number;
  completedTasks: number;
  timingCount: number;
  totalDurationMs: number;
  errors: Record<string, number>;
};
export type ProductFlag = {
  id: 'guided-academy' | 'scenario-breakdown' | 'compact-offers';
  enabled: boolean;
  treatmentPercent: number;
};
export type ProductPriority = {
  feature: ProductFeature;
  impact: number;
  confidence: number;
  differentiation: number;
  effort: number;
  score: number;
};
export type ProductState = {
  version: 1;
  consent: boolean;
  metrics: ProductMetric[];
  dedupe: string[];
  flags: ProductFlag[];
  priorities: ProductPriority[];
  updatedAt: string;
};
