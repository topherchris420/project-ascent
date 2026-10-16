# Professional support, portability and product feedback

These features operate in the existing authenticated tenant workspace. They do not transmit messages to experts, schedule meetings, ingest MLS CSV exports, or grant authority to imported reviews. Demonstration records stay explicitly synthetic.

## Academy and support

`GET /api/trust` returns contextual Academy tasks, private support requests, structured feedback and service availability. Bundled CMAs cannot complete the pricing lessons. Saving, inspecting, approving and exporting a user-created CMA must leave matching post-registration audit evidence for the current actor. A counteroffer lesson requires an actual persisted draft. There is no checkbox completion endpoint.

`POST /api/trust` accepts `requestSupport`, `requestReview`, `requestTraining`, `resolveTicket`, `inspectCma` and `feedback`. Context may reference an accessible property, client, CMA, transaction or domain proposal. Free-form support questions are private tenant content; feedback accepts only bounded usefulness and reason codes. Training remains queued without an invented appointment. Closing a review ticket does not certify its professional review.

`GET /api/trust/report?cmaId=...` generates the existing permission-checked HTML report and records completion only after a successful response. Printing to PDF remains a browser action.

`POST /api/trust/review` requires a separate `TRUST_REVIEW_SECRET` bearer credential of at least 32 characters. A professional review additionally requires an independent reviewer account whose current owner-submitted license has actually passed the separate verification process, a reviewer workspace, a decision and HTTPS evidence references. Requesters cannot self-review. This records a review; it does not approve a domain rule, send a communication or execute a transaction. An external professional service is not configured or promised.

## Import and undo

`GET /api/migration` returns private active previews, commit metadata, authorized uploaded-document references and supported fields. Editors can preview and explicitly consent to a commit; only the importer or owner can undo it. A viewer can inspect permitted records but cannot import.

```json
{
  "action": "preview",
  "kind": "contacts",
  "csv": "name,email,preferences\nSample Contact,sample@example.test,One-level home",
  "mapping": {},
  "sourceName": "My authorized CRM export",
  "attestation": { "authorized": true, "noMls": true }
}
```

The response is `{preview}`. Supported kinds are contacts, preferences, searches, milestones, notes and references to files already uploaded through the private document workflow. Field mappings use `{targetField: sourceHeader}`. The RFC 4180 parser supports quoted newlines and doubled quotes, rejects malformed or ambiguous headers, and bounds input to 60,000 characters, 100 KB, 200 rows, 30 columns and 5,000 characters per field. It does not execute adapters or formulas. Property/MLS fields are rejected rather than treated as portable CRM fields. An attestation cannot create rights to restricted data.

Preview reports proposed creates, conflicts, skips and invalid rows. Contacts match case-insensitive email; repeated identities with inconsistent values must be corrected in the input. Existing differing fields need an explicit per-row `skip` or `update` choice. Preferences, searches and notes receive the same automated fair housing hold as manual entry; an allowed result is not legal certification.

```json
{
  "action": "commit",
  "previewId": "UUID returned by preview",
  "baseHash": "SHA256 returned by preview",
  "consent": true,
  "decisions": { "2": "update" }
}
```

The response is `{commit}` and omits private before-images. Commit rechecks permissions and a deterministic hash of target workflows, rejecting a preview after concurrent data changes. Repeating the same committed preview returns its existing receipt. Invalid rows are skipped, not silently repaired. Audit records contain counts and identifiers, not imported names, notes or CSV content.

Previews expire after 30 minutes. Private undo records expire after seven days. Access and scheduled maintenance remove expired staging and compact expired undo operations; database backups require the operator's retention policy too. `POST {action:"rollback",commitId}` returns `{commit,rolledBack,preserved}`. Undo restores only imported fields still equal to the committed value. New imported records are deleted only if unchanged and unreferenced by subsequent work. Later edits, notes and references are preserved. This is not a general database time-travel restore.

## Export and paired evaluation

`GET /api/migration/export?format=json` exports an explicit allowlist of records after current export-right checks. It excludes credentials, API keys, billing state, raw CMA snapshots, migration undo history and domain/trust review authority. Private document metadata links to the authenticated download route; binaries are not copied into the JSON. `format=csv` exports contacts with all cells quoted and spreadsheet formula prefixes escaped. Other workflows use the JSON format; automatic adapters for third-party CRMs are not implemented.

`POST /api/migration` with `action:"compare"`, an accessible `cmaId`, and `baselineAssumptions`/`candidateAssumptions` reruns both variants on the exact same frozen subject, candidate dataset and as-of date. The response includes its dataset hash, calculations and estimate delta. An optional `expectedDatasetHash` must match. This measures deterministic sensitivity, not a validation of valuation accuracy.

Current source revocation is enforced in all dedicated responses and the central workspace scoper. When any source is denied, staging and private before-images are withheld and support free text is conservatively redacted. Authorized document references are filtered again. Source retention and export permissions remain independent of an import attestation.

## Improvement lab

`GET /api/product` exposes local opt-in aggregates, the three available experiment flags, explicit priority assumptions and existing platform usage. Owners control consent, metric reset, flag configuration and priority scores. `impact × confidence × differentiation ÷ effort` is transparent owner judgment, not estimated revenue or measured customer benefit.

`POST /api/product` accepts structured opens, bounded timings, bounded error codes and evidence-backed task completion. Raw names, addresses, messages and document text are not valid event fields. Completion requires a real audited workflow; repeated event/audit identifiers are hashed and deduplicated. Existing core actions record actual server-side elapsed time only after consent. Report, Academy evidence and import completions are recorded after successful work. No external analytics provider receives events.

Assignments use a stable hash of tenant and flag identifier. Configuration and descriptive aggregate outcomes do not establish a winning variant, randomization quality or causal improvement. Open/error events and client-supplied timing values are reported telemetry, not independently verified observations. A formal experiment protocol, representative participant enrollment and causal analysis remain future work.

## Verification and limits

Meaningful regression coverage lives in `tests/trust.test.ts`, `tests/migration.test.ts` and `tests/product.test.ts`: seed exclusion, real report generation, tenant boundaries, independent review credentials, privacy redaction, quoted CSV, stale preview refusal, idempotency, field-aware undo, private document references, fair housing holds, export filtering, sensitivity hash equivalence and opt-in aggregate collection. Run the focused suite with `npm exec -- tsx --test tests/trust.test.ts tests/migration.test.ts tests/product.test.ts`.

There is no configured external expert network, delivered email, automatic meeting scheduler, full binary CRM migration, third-party import certification or claim of causal product improvement. Cloud PostgreSQL, live licensed-provider permissions and real expert review require separate deployment validation.
