# Independent replication of Ascent’s valuation studies

**Status: requested, none completed.** No outside researcher has reproduced Ascent’s published accuracy results or assessed its methodology. Every accuracy figure Ascent shows is reproducible internal validation by the people who built the method. This page is the brief for the outside quantitative researcher who changes that, and the record of what they find, favorable or not.

## What we are asking for

1. **Reproduce** the six published studies at whatever depth you choose (levels below), starting from the files in this repository.
2. **Assess the methodology** against the ten questions in the rubric, or say which ones you did not assess.
3. **Publish a signed record** of both, with your narrative assessment. It appears on the public accuracy page and in this repository exactly as you wrote it.

## Independence

- You should have no financial, employment, advisory or personal relationship with Ascent’s maintainers. Disclose anything that could look like one; the record has a field for it.
- Any payment is agreed before you start, stated in the record, and does not depend on what you conclude.
- You decide what to examine. Ask questions in public GitHub issues so the exchange is part of the record; the maintainers will not review drafts of your conclusions.
- Ascent commits to publishing your record and assessment unedited, including unfavorable conclusions; to leaving every frozen protocol and published result unchanged in response; and to addressing your findings through new, registered protocols that cite your record.

## The studies

| Protocol | Cohort | Holdout sales | Criteria met | Report digest |
| --- | --- | ---: | --- | --- |
| `ascent-valuation-validation-dc-1` | Washington, DC single-family and rowhouses | 2,254 | 9 of 9, three narrowly | `sha256-d4acbe7087a2…` |
| `ascent-valuation-validation-1` | King County, WA, 2015 | 6,975 | 5 of 9 | `sha256-11e488dbc7d0…` |
| `ascent-valuation-validation-maryland-1` | Montgomery and Prince George’s, original model | 12,831 | 4 of 9 | `sha256-483c1495df5e…` |
| `ascent-valuation-validation-maryland-2` | Same counties, revised model | 2,812 | 8 of 9 | `sha256-1c420bbcfa82…` |
| `ascent-valuation-validation-dc-condos-1` | DC condominium units | 1,434 | 4 of 9 | `sha256-06e88b2bfbcf…` |
| `ascent-valuation-validation-maryland-external-1` | Four Maryland counties Ascent does not serve, registered before download | 19,039 | 5 of 9 | `sha256-60f04f4d65eb…` |

Full digests, files and columns are in the [data dictionary](replication/data-dictionary.md). The studies, their protocols and every miss are described in [valuation validation](valuation-validation.md).

## Levels of replication

| Level | What it shows | How | Time |
| --- | --- | --- | --- |
| Re-derive | Every published figure, bootstrap intervals and verdicts follow from the per-sale samples | `python3 -I scripts/replication/rederive.py`, or your own code from the data dictionary | Minutes |
| Re-run | The engine reproduces every report and per-sale estimate byte for byte from the bundled datasets | `npm run replicate -- --full` | About 45 minutes |
| Reimplement | The method, written independently from the [method specification](replication/method-specification.md), produces the same estimates | Your code; compare with each samples file, allowing $1 for floating-point order | Days |
| Re-fetch | The bundled datasets are what their provenance files say | `scripts/datasets/*.py`; the sources are live, so compare overlapping records rather than fingerprints | Hours |

The re-derivation script and the evidence checks were written by Ascent’s maintainers. They are a convenience, not independent evidence: audit them line by line or write your own. A byte-for-byte re-run shows that the engine is deterministic, not that the method is sound.

## Quick start

Requirements: Node.js 24, npm and Python 3.9 or later. No account or key is needed, and nothing after `npm ci` uses the network.

```bash
git clone https://github.com/topherchris420/project-ascent.git
cd project-ascent
npm ci
npm run replicate              # evidence checks, dataset fingerprints, exact Python re-derivation (~6 minutes)
npm run replicate -- --quick   # the same without bootstrap intervals (~1 minute)
npm run replicate -- --full    # also re-runs every study from its dataset (~45 minutes)
```

Each run writes `replication-output/<time>/`: `summary.md`, `summary.json`, a log per step and `replication-record.draft.json`, pre-filled with the commit, your environment and what the run reproduced. A run from a working tree with uncommitted changes, untracked files included, describes no published commit, so its draft pre-fills neither the commit nor any outcome, and the signer refuses it until the commit is filled in; re-run from a clean checkout instead. The fingerprint step fails if any declared fingerprint matches no bundled CSV or any bundled CSV matches no declaration.

## Methodology rubric

Rate each area `no-concern`, `minor`, `major` or `critical`, or mark it `not-assessed`. A rating is your judgment of the problem’s consequence for the published claims, not of its difficulty.

| Area | Question |
| --- | --- |
| Data provenance and screening | Are the datasets what their provenance files claim (sources, licenses, fingerprints), and are the import and screening rules blind to sale prices and valuation errors? |
| Look-ahead and leakage | Could a holdout price or any later information reach an estimate: same-day or later sales, the home’s own sales, or characteristics recorded after a sale? |
| Windows, fitting and selection | Are the fit, selection, calibration and test windows disjoint and ordered, and was each choice made only on its own window? |
| Pre-registration integrity | Do the protocol digests, registrations, data locks and commit history show that thresholds and analyses were fixed before scoring? |
| Metric definitions and arithmetic | Are MdAPE, PPE10, COD, PRD, median signed error and interval coverage defined and computed as stated, consistent with the IAAO Standard on Ratio Studies where cited? |
| Baselines and comparisons | Are the median $/sqft and trailing ZIP-median baselines fair, correctly implemented and compared on the same sales? |
| Uncertainty and intervals | Are the bootstrap intervals and the split-conformal interval valid for these data, given correlated sales (shared buildings, neighborhoods, periods) and possible non-exchangeability? |
| Reporting and interpretation | Do the documentation and the product report passes, narrow passes and failures faithfully, without overstating accuracy or certainty? |
| Scope of claims | Do the claims stay within the markets, periods, property types and configurations that were actually tested? |
| Home Decision Brief verdict policy | Does the registered supplement support how the product uses its verdict policy to state, limit or decline a value? |

### Known weak points worth examining

The maintainers already know of these. Confirming, quantifying or dismissing them is useful; finding others is more useful.

- **Narrow DC passes.** The 95% intervals for median error and for the share within ±10% straddle their bars, and PRD sits 0.0005 under its limit.
- **Correlated sales.** Sale-level bootstrap intervals treat holdout sales as independent. Condo units in one building, rowhouses on one block and sales in one month are not.
- **Current characteristics.** Assessor records describe homes today, not on each sale date. Sales in or before a recorded remodel year are removed; unrecorded renovations remain.
- **Exchangeability.** The calibrated interval’s coverage guarantee assumes calibration and test sales are exchangeable. Coverage ran slightly under target in every market.
- **Maryland’s original study** kept five transfers at $1,000 or less under its frozen rule; they drive its extreme COD and PRD.
- **Trend in rising markets.** The external study’s fitted trend was double Maryland v2’s and coincided with 3% median over-valuation.
- **The outlier check** in the verdict policy fired often without separating accuracy in the external supplement.
- **Collation.** The engine sorts comparables and the engine fingerprint sorts keys with `localeCompare`, which depends on the runtime’s ICU data (section 3 and 11 of the [method specification](replication/method-specification.md)).
- **Only holdout rows are published per sale.** Fit, selection and calibration rows must be reproduced by re-running.

## Reporting your results

The record (`ascent-replication-record-1`) holds:

- **Reviewer:** name, affiliation, Ed25519 public key and a URL where you publish that key, so readers can tie the signature to you.
- **Independence:** your statement, conflicts (or “None”) and compensation (or “Unpaid”).
- **Commit and environment** you worked from.
- **Studies:** for each report you examined, an outcome per level: `reproduced`, `differs` or `not-attempted`, with notes. A study counts as reproduced when some level reproduced it and none found a difference.
- **Findings:** one entry per rubric area, with a rating and a summary.
- **Conclusion:** whether you reproduced `all`, `some` or `none` of the studies you covered (this must agree with your study outcomes); whether the methodology is `sound`, `sound-with-reservations`, `unsound` or `not-assessed`; and a statement in your own words.
- **Assessment:** the digest of your narrative Markdown assessment, stored beside the record.

To sign:

```bash
openssl genpkey -algorithm ed25519 -out reviewer.pem      # keep it private; publish the public key
npm run replication:sign -- --draft replication-output/<time>/replication-record.draft.json \
  --assessment my-assessment.md --key reviewer.pem
```

`npx tsx scripts/replication/sign-record.ts --template` prints a blank draft if you did not use the runner. The tool refuses drafts with unfinished `REPLACE` fields, records that fail verification, and overwriting an existing record. It writes `evidence/replications/<date>-<name>.json`, the assessment beside it, and the summary the accuracy page displays. Submit the three files in a pull request; if you cannot, send them to the maintainers, who will commit them unchanged (the signature shows whether they were altered).

You can also attest a single report digest you reproduced, without a methodology assessment: `npm run validate:valuation -- --attest --market dc --key reviewer.pem --reviewer "Name, Organization"`.

## How records are checked and shown

`npm run validate:valuation -- --check`, which runs in CI, verifies every record: format, a rating for every rubric area, studies that are published reports, a conclusion consistent with its study outcomes, the assessment’s digest and the Ed25519 signature. The [accuracy page](https://project-ascent-theta.vercel.app/accuracy) shows each verified record’s reviewer, outcome, methodology verdict, concerns and statement, and links the full assessment. Until a record exists it says that no outside researcher has reproduced the results.

## For the maintainers

[A request you can send to prospective reviewers](replication/request-template.md). Do not send it on a reviewer’s behalf, edit their record, or describe a replication as complete before its signed record passes `--check`.
