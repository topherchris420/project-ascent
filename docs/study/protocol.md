# Protocol ascent-preference-1: Ascent and HomeSolo, task-based preference study

**Status: not yet run. Participants to date: 0.** This protocol is ready to pre-register. Nothing in it is a result.

## Question

After completing the same six professional tasks in both products, do at least 7 of 10 experienced real estate professionals prefer Ascent?

This is a product target for one small sample. It is not a test of population-wide superiority, valuation accuracy or business outcomes. With ten people, 7/10 has an exact 95% interval of roughly 35%–93% and a one-sided p of 0.17 against an even split; the report must show both beside the count.

## Who runs it

An **independent facilitator** who is not on the Ascent team, plus one or more **blinded reviewers** who score deliverables against the answer key. Ascent's developers may answer technical questions before sessions but must not attend, coach, recruit participants they know, or see identifiable data. Disclose that Ascent's developer sponsors the study.

## Pre-register before recruiting

Register this file, unchanged or with dated amendments, on a public registry such as OSF or AsPredicted. Include:

1. The commit hash of this repository and the analysis code version (`src/lib/study-analysis.ts`).
2. The randomization seed and its output: `npx tsx scripts/study/randomize-study.ts --seed <seed> --participants 10`.
3. The subject-draw seed and its output: `npx tsx scripts/study/draw-subjects.ts --seed <seed> --count 3`.
4. The filled task packet (addresses and the new-sale values in [tasks.md](tasks.md)) and the [answer key](materials/answer-key.md), sealed until scoring.
5. Participant compensation, which must be the same regardless of which product is preferred.

Any later change is a dated deviation in the report, never a silent edit.

## Participants

Ten completers. Eligibility and screening are in [recruitment.md](recruitment.md): an active real estate license in DC, Maryland or Virginia, at least two years of practice, recent listing or buyer work in the District, and no relationship with either product's team. Aim for a mix of primarily-listing and primarily-buyer agents and record it. Record prior use of either product; do not exclude for it.

## Design

Within-subjects, two products, six fixed tasks.

- **Order:** half the participants start with Ascent, half with HomeSolo (from the randomization output).
- **Subject homes:** three homes are drawn at random from all District single-family parcels. Each participant prices a different home in each product, and the pairing alternates, so knowledge of one home cannot carry over.
- **Familiarization:** ten minutes per product with the same neutral checklist in the [facilitator guide](facilitator-guide.md). No feature tour beyond it.
- **Tasks:** T1–T6 in [tasks.md](tasks.md), in order, with the same wording for both products.
- **Equivalent evidence:** both products receive the same addresses, offers, contract excerpt and new-sale values. Each product uses its own data for comparable sales; record what data each product drew on. If a product cannot accept the shared evidence for a task, the facilitator records the task as **unsupported** for that product. Unsupported tasks stay in every report.
- **Access:** each product must be used with the access a working professional would have. If full HomeSolo access cannot be obtained, the study cannot run as designed; do not substitute its marketing pages or public preview.

## Outcomes

**Primary.** The answer to the neutral preference question in the facilitator guide, asked once after both products: Ascent, HomeSolo or no preference. Ties and withdrawals count as not preferring Ascent. Target: at least 7 of 10 enrolled.

**Secondary, pre-specified.**

- Task success per product: completed and scored correct by a blinded reviewer, out of supported tasks.
- Time per task, from reading the card to a deliverable the reviewer scores correct.
- Paired time differences per task (exact two-sided sign test, reported, not used for any claim).
- Critical arithmetic errors and unauthorized disclosures (definitions in [scoring-rubric.md](scoring-rubric.md)).
- Assistance events, abandoned tasks, the participant's stated reasons and confidence.

**Engineering targets for Ascent:** at least 95% task success on supported tasks, zero critical arithmetic errors, zero unauthorized disclosures.

## Analysis

Run `npx tsx scripts/study/analyze-study.ts <folder>` on the three CSVs from [templates](templates/). It reports the preference count with an exact Clopper-Pearson 95% interval and exact binomial test, task outcomes per product, paired time differences and each target as met or not met. The script exits non-zero if order is not counterbalanced or a row names an unknown participant. Publish the full report, including misses and unsupported tasks.

## Stopping and withdrawal

Participants may stop at any time without losing compensation. Withdrawals stay in the denominator and are listed with their reason. Do not recruit replacements to reach a target count after looking at preference results; if a replacement is needed for a session that never started, record it before any data from that slot exists.

## Data handling

Pseudonymous participant IDs only in the CSVs; names and contacts stay in a separate access-controlled file. No client or real transaction data is entered into either product. Screen recordings, if any, require separate consent and are deleted after scoring.
