# Contract-date evidence and human review

This extends the existing transaction/document workflow. It does not establish jurisdiction-specific legal deadlines or interpret the complete legal effect of a contract. No AI, property-provider call, new service or new dependency is used by this update.

## Use the workflow

1. Open **Transactions**, select a transaction and upload a PDF or UTF-8 text file (maximum 5 MB).
2. Check text-extraction status and unresolved terms. Partial, unreadable and image-only files are identified. Download the preserved original when needed.
3. Inspect each proposal's matched phrase, surrounding text, PDF page and, for relative arithmetic, named anchor and counting assumptions.
4. Open **Edit title or correct proposed date** to change the date/title. A different date requires a reason. Computed proposals additionally require acknowledgment of the source and counting assumptions.
5. Choose **Review & add deadline**. The milestone links to the source download; the proposal retains its original date/evidence alongside the reviewed date, actor, time, correction note and milestone ID. Reloading preserves the review. Duplicate approval returns HTTP 409.

The source download continues to enforce authentication, tenant and current source permissions. Owner/editor access is required for upload and review; viewers cannot mutate. A review records the signed-in workspace actor, not an independently verified license or legal approval. The reviewer still determines applicability and the actual contractual deadline.

## Deterministic behavior

`src/lib/contract-dates.ts` exposes `analyzeContractDates` and retains the existing `extractContractDates` / service `extractDateCandidates` compatibility interfaces. Analysis version is `ascent-contract-dates-2026-10-16.2`.

- Recognizes common US numeric, ISO and written dates; invalid calendar dates create issues instead of proposals.
- Relative expressions support numeric 1–365 or recognized written 1–99 day counts, optionally with matching parenthetical digits. Unsupported counts and disagreement such as `ten (7)` create issues.
- Ratification, effective date, acceptance, execution, settlement, closing and close of escrow are separate anchor kinds. A different event is never silently substituted. The existing broad display labels are retained for compatibility; computed evidence identifies the precise anchor kind.
- A relative term requires one unique stated date of its named kind. Conflicting dates produce an issue listing the available anchors; identical repetitions are allowed. There is no automatic choice of the original contract versus an amendment.
- `after/following` and `before/prior to` determine arithmetic direction. `from/of` is held because the counting convention is not established.
- Arithmetic excludes the anchor day. Unqualified `days` uses an explicitly disclosed calendar-day assumption. Business/banking-day arithmetic skips Saturdays/Sundays in **both** directions and warns that no holidays, jurisdiction or bank calendar was applied. For example, two business days before Monday November 9, 2026 is Thursday November 5 under this weekday-only assumption.
- Analysis is bounded to 100 pages, 250,000 characters, 100 candidates and 50 issues. Partial extraction and text/page bounds withhold relative calculations because unseen text may change an anchor. Reaching the stated-candidate bound also withholds relative calculations. Explicit dates in the readable portion remain unapproved proposals.

These are syntactic proposals, not a complete grammar. Tables, multiple agreements, cross-references, qualified/conditional clauses, amendments, notifications, receipt/service dates, time-of-day/timezone rules, extension rules, holidays and nonstandard wording require professional interpretation. Unrecognized terms may not appear in the issue list. A clean issue list does not mean every contractual deadline was found or verified. No numerical confidence, expert certification or legal accuracy rate is claimed.

## Evidence and storage

`src/lib/document-reader.ts` extracts each PDF page separately through the existing `unpdf` dependency. It does not OCR image-only pages, execute PDF JavaScript or fetch URLs contained in contract text. PDF rendering/image extraction is not requested. Decoder cleanup uses the installed library's loading-task API.

Evidence offsets address **normalized extracted page text**: CRLF becomes LF and inline whitespace becomes a single space. They are neither PDF glyph coordinates nor raw-file byte offsets. `quote` retains the exact matched date/relative phrase in that normalized text. Text files have no invented PDF page number. Surrounding excerpts and matched phrases are private document metadata; the complete extracted text is not separately persisted. Original file bytes and SHA-256 remain unchanged, under the existing private storage/encryption and retention controls.

The milestone stores a document/candidate pointer, original proposed date, page, arithmetic rule and extraction version. It does not duplicate contract excerpts or review notes into the assistant's milestone context. Approval audit records contain identifiers, dates, basis, correction/review status and version, excluding raw source text and correction notes. Existing source scoping also withholds documents when a linked property's data rights become unavailable. Upload checks authorization before decoding and again inside the final database mutation to reject permission changes during extraction.

Optional additive JSON fields preserve existing workspace records; no SQL migration is needed for this slice. Existing stored proposals are not silently reinterpreted or recomputed. They may lack page/analysis metadata; download and verify their original file or upload it again for the current analysis. The legacy string-returning `documentText` helper delegates to the bounded reader.

## Verification and remaining gates

All new test documents, contract language, extensions and reviewer identities are fictional. Unit/integration cases cover forward/backward weekday arithmetic, separate/missing/conflicting anchors, written-count conflicts, ambiguous direction, truncation, normalized evidence offsets, two-page PDFs, original-byte preservation, unreadable/image-only files, tenant/viewer/source checks, access changes during decoding, explicit review, correction persistence and privacy of audit/milestone metadata. The browser acceptance uploads conflicting and reviewable contracts, corrects an inspection date, checks reload/download, mobile reflow and axe accessibility. See [executed results](verification-results.md).

Before untrusted public-scale uploads, isolate PDF decoding in a constrained worker/process with hard execution/memory limits, add appropriate file security review, and validate encrypted storage/retention against production infrastructure. Current page/text/output bounds do not prevent a hostile PDF from exhausting decoder CPU or memory. Mixed readable/textless pages are marked partial and withhold relative calculations; a textless page may be blank or scanned. Images or missing clauses on an otherwise readable page still cannot be detected reliably, so extraction status is not a completeness guarantee. Add OCR only with a reviewed privacy, cost and error-handling policy. Any authoritative holiday calendars, contract practices and jurisdictional rules need qualified review and versioned evidence before activation.
