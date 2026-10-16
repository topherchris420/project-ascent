/** Opt-in live acceptance through the real application service and durable shared quota. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { login, sessionCookie } from '../src/lib/auth';
import { closeDatabase, getWorkspace } from '../src/lib/db';
import { executePropertyProviderAction, getPropertyProviderSnapshot, propertyProviderPolicy } from '../src/lib/property-provider-service';
import { buildProviderCmaInputs } from '../src/lib/providers/normalize-property';
import type { ProviderProperty } from '../src/lib/providers/property-provider';
import { calculateCma, simulatePricing } from '../src/lib/analytics';
import { answerAssistant } from '../src/lib/assistant';
import { GET as report } from '../src/app/api/report/route';
import type { CmaRecord } from '../src/lib/types';

async function main() {
  if (!process.argv.includes('--live') || process.env.NODE_ENV === 'production' || process.env.DATABASE_URL || propertyProviderPolicy()?.deploymentScope !== 'local-development') throw new Error('Explicit --live and a reviewed local-only policy are required.');
  const access = JSON.parse(await readFile('.data/rentcast-local-access.json', 'utf8'));
  const account = await login(access.email, access.password), actor = account.user;
  const initial = await getPropertyProviderSnapshot(actor);
  if (initial.budget.effectiveRequestLimit > 10 || initial.budget.monthlyRequestLimit > 10) throw new Error('This acceptance is limited to the authorized 10-request monthly cap.');
  const maxAgeDays = Number(process.argv.find(value => value.startsWith('--max-sale-age-days='))?.split('=')[1] || 180);
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) throw new Error('Acceptance sale-age assumption must be explicit and bounded to 365 days.');
  const steps: { action: string; transport: 'live' | 'cache'; durationMs: number; returned: number; warnings: string[] }[] = [];
  async function query(action: string, query: Record<string, unknown>) {
    const started = performance.now();
    const response = await executePropertyProviderAction(actor, { action, query, fixture: false }) as { result: { cached: boolean; pending?: boolean; data: { data: unknown; warnings: string[] } } };
    if (response.result.pending) throw new Error('A matching operation remains in progress.');
    const data = response.result.data.data;
    steps.push({ action, transport: response.result.cached ? 'cache' : 'live', durationMs: Math.round(performance.now() - started), returned: Array.isArray(data) ? data.length : data ? 1 : 0, warnings: response.result.data.warnings });
    return data;
  }
  // One bounded DMV page, not an unmetered address hunt. Choose the first record with >=3 eligible sales.
  const records = await query('searchProperties', { zipCode: '22207', propertyType: 'Single Family', saleDateRange: 365, limit: 50, offset: 0, includeTotalCount: true }) as ProviderProperty[];
  const asOf = new Date().toISOString();
  const subject = records.find(record => {
    const normalized = buildProviderCmaInputs(record, records, { sourceId: 'preflight-only', asOf, omitUnobservedCondition: true });
    if (!normalized.subject) return false;
    try { return calculateCma(normalized.subject, normalized.comparables, { conditionValue: 0, maxAgeDays }, asOf).comps.length >= 3; } catch { return false; }
  });
  if (!subject) throw new Error('The bounded DMV sample has insufficient eligible recorded sales. Do not fabricate or broaden paid queries automatically.');
  await query('getProperty', { address: subject.address.formatted });
  const benchmark = await query('getValuation', { address: subject.address.formatted, compCount: 5 });
  const listings = await query('getSaleListings', { zipCode: '22207', status: 'Active', limit: 10, offset: 0 });
  await query('getMarketStatistics', { zipCode: '22207', historyRange: 12 });
  // Published RentCast documentation sample, not a private client address.
  const second = await query('getProperty', { address: '5500 Grand Lake Dr, San Antonio, TX 78244' }) as ProviderProperty | null;
  await query('getMarketStatistics', { zipCode: '78244', historyRange: 12 });
  const saved = await executePropertyProviderAction(actor, { action: 'saveCma', fixture: false, subjectId: subject.id, comparableIds: records.filter(record => record.id !== subject.id).map(record => record.id), omitUnobservedCondition: true, assumptions: { maxAgeDays } }) as { result: { cma: CmaRecord } };
  const cma = saved.result.cma;
  const recalculated = calculateCma(cma.result.inputSnapshot!.subject, cma.result.inputSnapshot!.candidates, cma.result.assumptions, cma.result.asOf);
  if (recalculated.calculationHash !== cma.result.calculationHash) throw new Error('Reproducibility check failed.');
  let modelCalls = 0;
  const assistant = await answerAssistant(await getWorkspace(actor.tenantId), 'Explain the recorded sales, CMA assumptions and missing evidence.', { cmaId: cma.id, page: 'properties' }, async () => { modelCalls++; throw new Error('Licensed records must not leave the application.'); });
  if (modelCalls || assistant.mode !== 'evidence') throw new Error('External-inference privacy boundary failed.');
  const exported = await report(new Request(`http://localhost:3040/api/report?cmaId=${cma.id}`, { headers: { cookie: sessionCookie(account.token) } }));
  if (exported.status !== 200) throw new Error('Authorized report export failed.');
  const html = await exported.text();
  if (!html.includes(cma.result.calculationHash) || !html.includes('RentCast')) throw new Error('Report lacks calculation or source evidence.');
  await mkdir('.data', { recursive: true });
  await writeFile('.data/rentcast-live-report.html', html, { mode: 0o600 });
  await writeFile('.data/rentcast-live-workflow.json', JSON.stringify({ subjectId: subject.id, address: subject.address.formatted, cmaId: cma.id, secondRecordId: second?.id }), { mode: 0o600 });
  const final = await getPropertyProviderSnapshot(actor);
  await writeFile('evidence/rentcast-live-acceptance.json', JSON.stringify({ at: new Date().toISOString(), mode: 'actual-live-provider', qualifiedProfessionalValidation: false, steps, requestsThisRun: final.budget.globallyObservedRequests - initial.budget.globallyObservedRequests, applicationObservedMonthlyRequests: final.budget.globallyObservedRequests, monthlyRequestCap: final.budget.effectiveRequestLimit, conservativeReservedUsd: final.budget.globallyReservedCostUsd, reserveIsInvoice: false, markets: ['Arlington VA 22207', 'San Antonio TX 78244'], secondMarketPropertyAvailable: !!second, activeListingCount: Array.isArray(listings) ? listings.length : 0, independentCma: { comparableCount: cma.result.comps.length, estimate: cma.result.estimate, low: cma.result.low, high: cma.result.high, calculationHash: cma.result.calculationHash, reproduced: true }, providerBenchmark: { estimate: (benchmark as { estimate: number }).estimate, isGroundTruth: false }, scenarioExamples: [cma.result.estimate, Math.round(cma.result.estimate * 1.03)].map(price => { const result = simulatePricing(cma.result, price); return { assumedSalePrice: price, estimatedNetAtAssumedSalePrice: result.estimatedNet, prediction: false }; }), assistant: { mode: assistant.mode, citationCount: assistant.citations.length, externalProviderCalls: modelCalls, licensedDataTransmittedToGroq: false }, report: { status: exported.status, privateLocalFile: '.data/rentcast-live-report.html' }, limitations: ['Small developer acceptance sample, not accuracy calibration or proof of national completeness.', 'Provider-recorded sales require independent verification; listing asks and AVM estimates remain separate.', 'No inspected condition or verified concessions; zero condition adjustment explicitly selected.', 'Real provider evidence remains blocked from external inference.', 'No automatic pagination or retries; every attempted live request is conservatively reserved.'] }, null, 2) + '\n');
  console.log(`Live acceptance complete: ${steps.filter(step => step.transport === 'live').length} new provider operations; ${final.budget.globallyObservedRequests}/10 observed monthly requests; ${cma.result.comps.length} recorded-sale comparables; deterministic explanation and authorized report verified. No credentials or raw records printed.`);
}
main().catch(async error => { await mkdir('.data', { recursive: true }); await writeFile('.data/rentcast-live-failure.json', JSON.stringify({ at: new Date().toISOString(), message: error instanceof Error ? error.message.replace(/[A-Za-z0-9_+/.=-]{24,}/g, '[redacted]') : 'Acceptance failed' }), { mode: 0o600 }); console.error('Live acceptance stopped safely. See private .data/rentcast-live-failure.json; failed requests remain counted.'); process.exitCode = 1; }).finally(closeDatabase);
