# Backup, restoration and data compliance

## Executable synthetic drill

CI starts a disposable PostgreSQL 16/PostGIS service. `scripts/backup-restore-drill.ts --local-synthetic` accepts only `DRILL_DATABASE_URL` on localhost/127.0.0.1 with database `postgres`. It creates randomly named source and target databases and a restricted role; it never restores over a named existing database or reads production records. It applies every migration, enrolls a synthetic owner in MFA, stores an encrypted document, runs `pg_dump`/`pg_restore`, and checks decrypted bytes, sessions, recovery-code replay and forced RLS between two tenants. Cleanup is constrained to the generated database names; the dump stays under ignored `.data/` and is deleted.

Use PostgreSQL client 16 against that service. Supply the local connection privately through the environment, then run:

```text
npx tsx scripts/backup-restore-drill.ts --local-synthetic
```

This tests logical recovery and application protections. It does not prove a cloud provider has enabled backups, that backup retention is lawful, or that a production restoration meets an SLA.

## Production operator drill

Before relying on production storage, record an accountable owner and approved recovery targets. A proposed starting target is RPO ≤24 hours and RTO ≤4 hours; these are **targets, not measured promises**.

1. Inventory database/provider, region, retention/deletion obligations, encryption keys and restore authority. Obtain the actual provider backup/PITR settings and retention schedule; record the evidence and date. Preserve `APP_ENCRYPTION_KEY` separately from database backups in an access-controlled secret manager with a tested recovery path. Losing it loses documents and MFA secrets.
2. Verify a recoverable backup exists and is encrypted with restricted access. Exclude secrets from logs and Git. A source agreement must explicitly permit any licensed records retained in backup; otherwise exclude that source or do not enable it. Coordinate deletion, holds and backup expiration with the actual agreement.
3. Restore a chosen authorized production backup into a **new isolated database** with no outbound email, inference, property-provider or scheduled-job delivery. Never restore in place. Obtain a target identifier and verify it differs from production before executing restore commands.
4. Apply restricted role grants, verify forced RLS, compare row counts and authorized integrity samples, decrypt a designated non-sensitive test document, test MFA/session policy and read/write isolation. Revoke restored sessions and integration keys before any production promotion; do not reactivate expired licenses or previously revoked access from an older snapshot.
5. Record backup timestamp, actual data-loss window, restoration start/end, encryption-key recovery, checks, failures, cleanup and reviewer. Keep a sanitized signed receipt; do not publish tenant rows or secrets. Conduct quarterly and after material schema/key changes. Exercise key rotation separately with a rollback plan.

No production restore has been claimed by this implementation. CI supplies a repeatable synthetic drill; operational recovery remains an explicit release dependency.

## Source ledger and release rules

| Source | Current evidence and permitted slice | Gate |
| --- | --- | --- |
| Maryland SDAT/MDP state snapshot | Public-domain designation, field minimization, hashes and provenance in `src/datasets/maryland/`; Montgomery/Prince George’s R/TH only. | Runtime verifies hashes. Rooms absent; revised comps require $50,000 consideration. No MLS claim or calibrated release. |
| DC residential and condo snapshots | CC BY 4.0 license evidence, named source layers, attribution and field-minimized snapshots in their provenance files. | Required attribution preserved in UI/reports; condos cannot inherit house calibration. Owners/contact data not requested. |
| Fairfax, Arlington, Loudoun | Four written requests prepared, unsent; no permission received. | No Virginia adapter or ingest enabled. Save authorized written dataset/use/redistribution terms before implementation. Public access alone does not grant reuse permission. |
| RentCast/MLS/other licensed sources | Existing source-specific contract policy, tenant grants, review identity, expiry and permitted uses. Local-only policies cannot authorize production. | Existing read/export/AI/retention gates stay in force; payment never creates rights. No new live records or inference sent in this work. |

Before enabling any additional source, record the actual authority, datasets/fields, display and redistribution rights, model fitting/external inference permissions, attribution, geography, refresh limits, retention/backups, deletion obligations, fee and expiry. A trusted review must be separate from a user clicking a permission checkbox. Test denial and revocation on the deployed app. Keep independent legal/contract review and per-member professional eligibility as outstanding requirements where applicable; code cannot supply those approvals.
