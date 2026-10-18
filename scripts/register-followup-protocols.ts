import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dcCondoProtocol, marylandV2Protocol, protocolDigest } from '../src/lib/valuation-validation';

for (const [market, protocol] of [
  ['maryland-v2', marylandV2Protocol],
  ['dc-condos', dcCondoProtocol],
] as const) {
  const path = `evidence/${market}-protocol-registration.json`;
  const digest = protocolDigest(protocol);
  if (existsSync(path)) {
    if (JSON.parse(readFileSync(path, 'utf8')).protocolDigest !== digest)
      throw new Error('Registered protocol changed.');
  } else {
    if (existsSync(`evidence/valuation-validation-${market}.json`)) throw new Error('Holdout already scored.');
    writeFileSync(
      path,
      JSON.stringify(
        {
          protocol,
          protocolDigest: digest,
          registeredAt: new Date().toISOString(),
          statement:
            market === 'maryland-v2'
              ? 'New experiment after the published Maryland failure. July–September 2026 outcomes have not been scored or used to select rates. The snapshot was previously bundled, and monthly counts and interface examples were inspected; this is a temporal, previously unscored holdout, not prospective collection. Register and commit before running. A $50,000 minimum consideration applies to every primary window and comparable pool. Fit nonnegative paired-sale rates with the original Huber method, fixing the quality coefficient at $75,000 and refitting other coefficients if the unconstrained fit exceeds that cap. Nine acceptance bars unchanged. Separately publish all-positive-consideration sensitivity with the frozen primary configuration and calibration; no refitting, screening by residual, or acceptance substitution. Short holdout and recording lag limit generalization. Never overwrite Maryland v1.'
              : 'First condo-specific accuracy experiment. No condo accuracy scoring or rate selection has occurred. Existing interface examples were calculated; there was no statistical holdout review. DC house fit/select/calibration/test dates and all nine criteria retained. Studios stay. Missing condition is a neutral sentinel with coefficient fixed at zero. Only condo sales enter fitting or comparables; own parcel and future/same-day sales are withheld. Current characteristics and missing floor, view, HOA, parking and assessments limit inference. This is an internal reproducible study, not third-party certification.',
        },
        null,
        2,
      ) + '\n',
    );
  }
  console.log(`${market}: ${digest}`);
}
