# Ascent Homeowner OS

One page per covered home, `/home/{dc|dc-condos|maryland}/{parcel}`, with six areas. All six share the property, the provenance of every figure, one calculation engine and one authorization model. Open it from **My Home** or from the link under a home's address in its pricing studio. It is free, needs no account for public research and uses no AI model for any figure.

Every visit shows four things first:

- **What we know.**
- **How we know it**, with each source.
- **What is missing.**
- **What to do next**, including upcoming deadlines.

A printable decision brief covers the same ground, and Ask Ascent answers questions from the same records.

| Area | What it does | Where its data lives |
| --- | --- | --- |
| **My Property** | The Home Decision Brief and the Property Evidence Timeline. Every sale, permit, assessment, tax record and flood zone keeps its own date apart from when it was recorded, published and checked. "Check public records now" runs a live check. | Bundled snapshot in the app, plus a live check through `/api/property/sources`. Nothing is stored. |
| **Market Watch** | Opt-in Property Watchtower: recorded sales nearby that are newer than the snapshot, and the regional price index, labelled as describing the metro area rather than this home. | Browser only (`ascent.watchtower.v1`). |
| **Compare Offers** | The Offer Lab for sellers and buyers: proceeds or cash to close, deadlines, contingency differences, missing terms and sensitivity. Also a printable Offer Comparison Brief and a private JSON export. | Browser only (`ascent.offer-lab.v1:{market}:{parcel}`). |
| **My Decisions** | The existing homeowner workbench (finances, sell / stay / rent decisions, saved versions) on the same pricing draft as the studio. | Browser only (the studio draft key and `ascent.homeowner-profiles.v1`). |
| **Transaction Room** | Milestones, tasks, deadlines, documents, quotes, inspection items, financing and settlement checklists, stage history, notes, decisions and references to saved briefs. | Server, encrypted, in the owner's tenant. Needs a free account. |
| **Share With My Agent** | An agent packet the homeowner downloads and sends themselves, invitations to chosen parts of the room, and the MLS status. | The packet is built in the browser. Grants are on the server. |

Code: [`src/components/homeowner-os.tsx`](../src/components/homeowner-os.tsx) and [`src/components/os/`](../src/components/os). Libraries: [`homeowner-os.ts`](../src/lib/homeowner-os.ts), [`offer-lab.ts`](../src/lib/offer-lab.ts), [`watchtower.ts`](../src/lib/watchtower.ts), [`rooms.ts`](../src/lib/rooms.ts), [`room-model.ts`](../src/lib/room-model.ts), [`agent-packet.ts`](../src/lib/agent-packet.ts), [`mls-bridge.ts`](../src/lib/mls-bridge.ts) and [`os-reports.ts`](../src/lib/os-reports.ts). The data network is described in [public-data-network.md](public-data-network.md).

## Rules every area follows

- **A withheld estimate stays withheld everywhere.** `valueContext()` is the only path from the brief to an offer comparison. A declined verdict passes no figure. The offer comparison's hash excludes it. The OS brief reports that a saved estimate changed, never the old figure. The agent packet drops the estimate, the range and every comparable's adjusted price and weight. Tests check that the withheld figure appears nowhere in the brief, the offers, the answers, the packet or its printable page.
- **No fabricated probabilities, scores or advice.** The Offer Lab shows arithmetic and term differences only. It never says which offer is better or how likely an offer is to close, and it does not interpret legal terms; "other terms" are kept as written. A test scans all output for ranking and probability language.
- **Provenance on every figure.** Each figure in the comparison is marked *entered*, *assumed* or *calculated*, with its formula. Deadlines say whether they were entered or counted from an assumed acceptance date.
- **Ask Ascent is deterministic.** It answers questions about offers, what is due next, the checklist, records, finances, what is missing and questions for a professional. Answers are assembled from the records above and name their sources. No model is called. A question the records cannot answer says so.
- **No disclosure by default.** Nothing about the homeowner leaves the browser unless they act. The live check sends only the market and parcel identifier. The agent packet is a local download; its private parts (offer terms, finances, the transaction) are off by default, and an item that cites a part left out is dropped. Documents, notes, saved versions and account details are never in a packet.

## Offer Lab arithmetic

- **Seller.** Net before payoff uses the same sale-cost function as the pricing studio (commission, closing percentage, seller credit, other costs). The rest is:
  - proceeds = net before payoff − mortgage payoff
  - headline = proceeds − carrying cost
  - carrying cost = monthly cost × days to closing × 12 / 365
  - With an escalation clause, proceeds are also shown at the escalation cap.
- **Buyer.**
  - Down payment, loan, and closing costs.
  - The seller credit, capped at closing costs.
  - Cash to close, and cash remaining from what is available.
  - The mortgage payment, using the workbench's payment function.
  - The housing payment: mortgage, tax, insurance and dues.
- **Deadlines** are entered, or counted from an explicitly assumed acceptance date, and sorted. Without an acceptance date, relative deadlines remain unknown. Calendar validation rejects impossible dates; chronology checks flag acceptance after expiration, closing before acceptance, and earnest-money or contingency dates after closing. These checks do not interpret a contract.
- **Sensitivity** shows how each headline moves if the price is renegotiated lower, the credit rises, the commission is half a point lower, closing slips 30 days or (for a buyer) the interest rate rises.
- **Comparison with the estimate** appears only when a value is stated.

Hand-checked figures are in [`tests/offer-lab.test.ts`](../tests/offer-lab.test.ts).

### Offer portability and calendar handoff

**Private export → Restore private export** works between browsers without an account. Open the same home, choose the exported JSON, review its side, offers, export date and assumptions, and explicitly replace that home's comparison. Cancel leaves the current comparison untouched. Restore validates the file format, both property identifiers, every input, unique offer IDs and the comparison reference. Files above 512 KB, unsupported formats and invalid terms are rejected. A failed storage write leaves the current comparison in place. This is an unencrypted private file, separate from the saved-home backup; it contains financial inputs and notes and should not be posted publicly.

Only offer inputs are restored. Archived result objects, hashes and valuation claims are ignored; the comparison is recalculated using the current engine and the current home's valuation restrictions. A withheld estimate therefore remains withheld. Existing version-1 exports remain supported when their inputs pass validation. The saved-input format stays `ascent-offer-lab-1`; calculation version `ascent-offer-calculation-2` is included in new comparisons and their calculation hashes to distinguish the corrected deadline behavior. Saved dates are preserved, not silently advanced to today; the restore preview asks the homeowner to review them.

**Download calendar dates** exports one selected offer as an RFC 5545 `.ics` file. Every entry is a tentative all-day review marker, labeled as entered or calculated; what-if offers are explicitly labeled. Missing dates are omitted, and conflicting dates must be resolved before download. Calendar-day calculations do not account for contract-specific counting, holidays, time zones or times of day. Confirm those with the agent before relying on the dates. The file contains the offer label and property identifier but excludes prices, mortgage balances and free-text notes. It sends no invitation, configures no alarms and provides no synchronization; calendar imports can duplicate entries depending on the client.

Unit coverage: [`tests/offer-transfer.test.ts`](../tests/offer-transfer.test.ts). Browser coverage: [`tests/e2e/offer-transfer.spec.ts`](../tests/e2e/offer-transfer.spec.ts), including preview/cancel/replace, reload, wrong-home rejection, storage failures, mobile accessibility and actual downloads. This feature adds no data-provider costs, account requirement or network upload.

## Transaction Room security model

- **Isolation.** Rooms, grants and the audit log live in the owner's tenant under forced row-level security ([migration 005](../migrations/005_homeowner_rooms.sql)). Room data and documents are encrypted with AES-256-GCM when `APP_ENCRYPTION_KEY` is set, which production requires.
- **Fail closed.**
  - On PostgreSQL, rooms return 503 until migration 005 is applied and its tables have forced RLS. Nothing else in the app is affected.
  - An unknown room, a room in another tenant, or a revoked or expired grant all return 404, so room identifiers reveal nothing.
  - A collaborator attempting an owner action gets 403.
- **Invitations.**
  - The owner chooses the email, the role, the sections, which documents (all in the shared sections, or a list), whether downloads are allowed, whether notes may be added, and how many days access lasts (at most 365).
  - Ascent shows a single-use link once and sends no email. The token travels in the URL fragment, which browsers never send to a server.
  - The invitation expires after 7 days. To accept, the invitee must sign in with the invited email address.
  - At most 20 collaborators can be active at once, and the owner can revoke any of them immediately.
- **Least privilege on every request.** A collaborator reaches a room only through a server-only membership index. The grant is re-checked inside the owner's tenant transaction on every request. The view contains only the granted sections, notes the owner marked shared, and permitted documents. A download without permission returns 403, and a document outside the grant returns 404.
- **Uploads.** Only PDF (checked by magic bytes) and plain text are accepted, up to 4 MB each and 100 per room. Downloads are sent as attachments with `nosniff`, `no-store` and a sandbox CSP.
- **Retention.** Each document has a delete-after date: 730 days by default. The owner can set from 30 to 3650 days for documents uploaded afterwards. Retention is enforced whenever the room is opened, and each expiry is audited.
- **Audit.** Room creation, edits, stage changes, uploads, downloads, collaborator views, invitations, acceptances and revocations are appended to a hash-linked log that the owner can verify. The private export contains no tokens. Deleting a room removes its documents, grants, memberships and log; downloaded copies cannot be recalled.

Tests: [`tests/rooms.test.ts`](../tests/rooms.test.ts) covers:

- tenant isolation and encryption at rest
- invitations: email match, single use, expiry
- least-privilege views, download and notes permissions, and revocation
- expired access and upload validation
- stale writes, audit tampering and retention
- export and delete, and the migration's RLS

[`tests/e2e/homeowner-os.spec.ts`](../tests/e2e/homeowner-os.spec.ts) runs the owner-to-agent flow in two browsers.

## MLS Bridge (disabled)

[`mls-bridge.ts`](../src/lib/mls-bridge.ts) holds the permission model Ascent would use for listing data, and nothing more. `MLS_AGREEMENTS` is empty, so every authorization fails closed.

- **Arrangements distinguished.** IDX, VOW (which needs registration, accepted terms and a broker relationship), broker back office (never shown to consumers) and a separate data license.
- **Always denied.** Valuation and model inference.
- **Field control.** Fields outside an agreement's allowlist are refused.
- **Expiry and audit.** Records past the agreement's retention are expired, and the audit log is hash-linked.
- **Fixtures.** The mock fixtures are synthetic, labelled FICTIONAL TEST FIXTURE, and cannot pass the display guard.
- **No listings presented.** Recorded deed transfers are never presented as listings. `/api/mls/status` and the Share tab say the bridge is disabled and what would be required.

## Environment

| Variable | Used for | Without it |
| --- | --- | --- |
| `APP_ENCRYPTION_KEY` | Encrypting room data and documents (base64 of 32 random bytes; keep it stable and backed up). | Production refuses to store documents. Locally they are stored unencrypted, and the database marks them so. |
| `APP_ORIGIN` | The origin in invitation links. | Links point to `http://localhost:3040`. |
| `DATABASE_URL` | PostgreSQL with RLS in production. Migration 005 must be applied. | Local SQLite for development. Production refuses SQLite. |
| `TRUST_PROXY` | Per-client limits on live public-record checks behind a trusted proxy. | One shared bucket at four times the per-client limit. |

No API key is needed: every public source in use is keyless, and nothing here calls an AI model.

## Not available, and why

| Item | Blocked by |
| --- | --- |
| Email watch alerts | An account-based server-side watch, a configured email provider and recorded consent. In-app notifications only for now. |
| Prince George's permits | No open license is stated. |
| Northern Virginia | Written county permissions ([drafted requests](data-permissions/virginia-requests.md), unsent). |
| MLS listings | A written IDX, VOW or data-license agreement through a participating broker. |
| Homeowner comprehension of the OS | The registered usability study has no participants yet. Nothing here claims how well homeowners understand it. |

An invalid market or parcel in the URL gets a real 404 with the not-found page. [`src/proxy.ts`](../src/proxy.ts) runs only for `/home/{market}/{parcel}` and answers it before the page streams; the page keeps its own check as well.
