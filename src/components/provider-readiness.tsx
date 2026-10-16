import type { PropertyProviderSnapshot } from '@/lib/property-provider-service';

export function ProviderReadiness({ info }: { info: PropertyProviderSnapshot }) {
  const { readiness, budget, usage, health, policy } = info;
  return (
    <section className="panel section-space" aria-labelledby="provider-readiness-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LIVE DATA CONTROLS</span>
          <h2 id="provider-readiness-title">Access and remaining requests</h2>
        </div>
        <span className="badge">
          {readiness.canRequestNewData ? 'Ready for explicit requests' : 'Setup or allowance requires attention'}
        </span>
      </div>
      <div className="metrics-grid">
        <article className="metric">
          <span>Shared request allowance</span>
          <strong>
            {budget.globallyObservedRequests} / {budget.effectiveRequestLimit}
          </strong>
          <small>{readiness.remaining.shared} remaining across this application</small>
        </article>
        <article className="metric">
          <span>Your remaining requests</span>
          <strong>{Math.min(readiness.remaining.user, readiness.remaining.tenant, readiness.remaining.shared)}</strong>
          <small>Calendar month {usage.period} · provider billing dates can differ</small>
        </article>
        <article className="metric">
          <span>Conservative cost reserve</span>
          <strong>
            ${budget.globallyReservedCostUsd.toFixed(2)} / ${budget.monthlyBudgetUsd.toFixed(2)}
          </strong>
          <small>Reserved limit, not a provider charge or invoice</small>
        </article>
      </div>
      {readiness.blockers.length > 0 && (
        <ul className="caution-list">
          {readiness.blockers.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <dl className="offer-facts">
        {readiness.permissions.map(permission => (
          <div key={permission.use}>
            <dt>{permission.use[0].toUpperCase() + permission.use.slice(1)}</dt>
            <dd>{permission.allowed ? 'Authorized for this workspace' : permission.reason}</dd>
          </div>
        ))}
        <div>
          <dt>Observed live requests</dt>
          <dd>
            {health.succeeded} successful · {health.failed} failed · {health.pending} pending
          </dd>
        </div>
        <div>
          <dt>Measured transport average</dt>
          <dd>
            {health.averageLatencyMs === null
              ? 'Not measured'
              : `${health.averageLatencyMs} ms across ${health.latencySamples} retained attempts`}
          </dd>
        </div>
        <div>
          <dt>Policy scope</dt>
          <dd>
            {policy?.deploymentScope === 'local-development'
              ? 'Private local development only'
              : policy
                ? 'Configured policy; verify deployment review'
                : 'Not configured'}
          </dd>
        </div>
      </dl>
      {budget.warnings.map(warning => (
        <p className="fine" role="status" key={warning}>
          {warning}
        </p>
      ))}
      <p className="fine">
        {readiness.note} Included requests can have no incremental charge; usage by other applications is unknown.
        Failed attempts retain their reserve. No render, assistant question or status check fetches new property data.
      </p>
    </section>
  );
}
