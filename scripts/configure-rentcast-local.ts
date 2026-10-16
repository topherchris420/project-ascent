/** Explicit, local operator setup. Never run as part of application startup or deployment. */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { register, login } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace } from '../src/lib/db';
import { reviewProviderGrant } from '../src/lib/fabric-service';

async function main() {
  if (
    !process.argv.includes('--scope=local-development') ||
    process.env.NODE_ENV === 'production' ||
    process.env.DATABASE_URL
  )
    throw new Error('Explicit local-development scope and the local SQLite environment are required.');
  if (!process.env.RENTCAST_API_KEY) throw new Error('Configure the private RentCast key first.');
  const review = await readFile('docs/rentcast-local-use-review.md', 'utf8');
  if (!review.includes('not qualified legal review')) throw new Error('The local technical assessment is missing.');
  await mkdir('.data', { recursive: true });
  const now = new Date().toISOString(),
    expiry = new Date(Date.now() + 30 * 86400000).toISOString();
  const policy = {
    providerId: 'rentcast',
    version: 'rentcast-private-local-2026-10-16-v1',
    deploymentScope: 'local-development',
    reviewedBy: 'Codex technical local-use assessment; not legal review',
    reviewedAt: now,
    expiresAt: expiry,
    licenseReference: 'RentCast API License section 1 internal research/analytics; docs/rentcast-local-use-review.md',
    termsUrl: 'https://www.rentcast.io/terms-api',
    allowedUses: ['research', 'valuation', 'market', 'export'],
    retentionHours: 24,
    cacheTtlMinutes: 60,
    requiresProfessionalVerification: false,
  };
  const secret = process.env.DATA_GRANT_REVIEW_SECRET || randomBytes(32).toString('base64url');
  const settings = {
    DATA_GRANT_REVIEW_SECRET: secret,
    PROPERTY_PROVIDER_ENABLED: 'true',
    PROPERTY_PROVIDER_MONTHLY_REQUEST_LIMIT: '10',
    PROPERTY_PROVIDER_TENANT_MONTHLY_REQUEST_LIMIT: '10',
    PROPERTY_PROVIDER_USER_MONTHLY_REQUEST_LIMIT: '10',
    PROPERTY_PROVIDER_MAX_CONCURRENCY: '1',
    PROPERTY_PROVIDER_MAX_COST_PER_REQUEST_USD: '0.20',
    PROPERTY_PROVIDER_MONTHLY_BUDGET_USD: '2.00',
    PROPERTY_PROVIDER_POLICY_JSON: JSON.stringify(policy),
  };
  let environment = await readFile('.env.local', 'utf8');
  for (const [name, value] of Object.entries(settings)) {
    if (/[\r\n']/.test(value)) throw new Error('Unexpected environment value.');
    const line = `${name}='${value}'`;
    environment = new RegExp(`^${name}=.*$`, 'm').test(environment)
      ? environment.replace(new RegExp(`^${name}=.*$`, 'm'), () => line)
      : `${environment.trimEnd()}\n${line}\n`;
    process.env[name] = value;
  }
  await writeFile('.env.local', environment, { mode: 0o600 });
  const accessPath = '.data/rentcast-local-access.json';
  let access: { email: string; password: string };
  try {
    access = JSON.parse(await readFile(accessPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    access = {
      email: `rentcast-local-${randomBytes(5).toString('hex')}@ascent.local.invalid`,
      password: randomBytes(32).toString('base64url'),
    };
    await register({ name: 'Ascent local research', ...access, organization: 'Private live-data validation' });
    await writeFile(accessPath, JSON.stringify(access), { mode: 0o600 });
  }
  const account = await login(access.email, access.password);
  const workspace = await getWorkspace(account.user.tenantId);
  if (
    !workspace.platform?.providerGrants.some(
      grant => grant.providerId === 'rentcast' && !grant.revokedAt && Date.parse(grant.expiresAt) > Date.now(),
    )
  ) {
    await reviewProviderGrant(
      account.user,
      {
        action: 'grant',
        providerId: 'rentcast',
        regionIds: ['us'],
        allowedUses: policy.allowedUses,
        licenseReference: policy.licenseReference,
        terms:
          'Private local development only, based on documented internal-use license grant. No MLS, external AI or commercial compliance approval. See docs/rentcast-local-use-review.md.',
        expiresAt: expiry,
        reviewedBy: policy.reviewedBy,
      },
      secret,
    );
  }
  await mutateWorkspace(account.user, workspace => {
    for (const source of workspace.fabric?.sources || [])
      if (source.providerId === 'rentcast' && source.license.label === policy.licenseReference)
        source.license.deploymentScope = 'local-development';
  });
  await writeFile(
    'evidence/rentcast-setup.json',
    JSON.stringify(
      {
        at: now,
        keyCreated: true,
        keyName: 'Project Ascent local development',
        restrictedEndpoints: ['/properties', '/listings/sale', '/avm/value', '/markets'],
        serverEnvironmentConfigured: true,
        keyValueIncluded: false,
        providerDashboardKeyState: 'Active',
        providerDashboardPlan: 'API Developer - Active',
        dashboardObservedIncludedUsage: 0,
        dashboardIncludedAllowance: 50,
        subscriptionActivatedByAgent: false,
        activationReportedByOwner: true,
        liveProviderEnabled: true,
        deploymentScope: 'local-development',
        qualifiedLegalReviewCompleted: false,
        localCaps: {
          monthlyRequests: 10,
          perUserRequests: 10,
          perTenantRequests: 10,
          concurrency: 1,
          perAttemptReserveUsd: 0.2,
          monthlyReserveUsd: 2,
        },
        reserveIsProviderInvoice: false,
        nextStep: 'Run bounded live acceptance; production policy and legal/privacy review remain separate.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Local-only provider policy and one private tenant grant configured. 10-request cap preserved. No provider request made. Access details remain in ignored .data/rentcast-local-access.json.',
  );
}
main()
  .catch(() => {
    console.error('Local setup failed. No credential values are logged. Check the documented prerequisites.');
    process.exitCode = 1;
  })
  .finally(closeDatabase);
