# Live AI evaluation: software and factual review

The final October 16, 2026 UTC receipt passes three **software** smoke cases: a real 20B explanation, a real 120B assumption review and a protected-characteristic request held without an external call. This does not certify the explanations as factually correct. The same receipt marks competitive superiority false. All property/client records used were fictional. No RentCast record was sent to Groq.

The [final receipt](../evidence/ai-evaluation.live.json) fingerprints the assistant, transport and routing source. Previous attempts remain in [the archive](../evidence/ai-evaluations/); the [durable spend ledger](../evidence/ai-evaluation-spend.json) includes conservative reservations for unsuccessful requests. Token-cost estimates are arithmetic using configured rates, not invoices. No OpenAI-versus-Groq quality, speed or cost comparison was run.

## What changed

The original full-path HTTP 400 was reproduced with `tool_use_failed`. Shared instructions requested final JSON while the tool-only phase had no final schema. Retrieval now asks only for evidence or a brief sufficiency response; strict final synthesis is separate. Prompt-only inline citations were unreliable, so Groq now supplies evidence references per paragraph and the server renders the markers. References must be currently authorized, and the schema enumerates retrieved IDs. Complex retrieval uses medium effort; final assembly uses low effort and concise instructions under the configured output cap. A prior `json_validate_failed` preceded this change; the subsequent smoke passed, without establishing a causal reliability improvement from a controlled study.

Retrieved context now distinguishes interior floor area from lot area, identifies the CMA as a weighted mean rather than a median, and explains modeled condition-score adjustments separately from unobserved condition. Currency abbreviations and spaced percentages are checked across the answer, missing-information items and suggestions. Rejected responses fall back to deterministic evidence; no automatic provider escalation or authoritative write occurs.

## Observed errors that the old checks missed

| Retained sample | Finding | Engineering response and remaining limit |
| --- | --- | --- |
| Initial successful 20B path | Inferred a single-family property type without retrieved type evidence | Explicit unknown-type context added; this is a prompt safeguard, not a general semantic guarantee |
| Initial successful 120B path | Asserted unobserved Austin price momentum; described unmodeled lot area as missing | Conditional-assumption instructions distinguish not modeled, not retrieved and missing; professional adjudication remains necessary |
| First structured 20B path | Described 2,480 square feet of floor area as lot area and called the weighted estimate a median | Retrieved facts now label both areas and the aggregation method explicitly |
| Final 120B path | Called property-02 through property-08 “eight” comparables although the calculation contains **seven** | Still a factual defect. Citation and money checks do not validate number words or every attribute relationship; quality acceptance remains open |

This is an internal engineering inspection, not blinded expert review or a representative error-rate study. No claim that all findings are resolved is made. Valid citation IDs establish accessible sources, not semantic entailment; a supported amount can still be attached to the wrong attribute. Generated prose remains a labeled professional-review draft, while calculations and source records remain independently inspectable.

## Next acceptance gate

Before unattended professional use, freeze a separate expert-reviewed holdout covering attribute/value binding, comparable counts, method labels, condition assumptions, market claims and uncertainty. Require zero known critical unsupported financial/legal claims, 100% agreement on deterministic figures/method/count fields, and at least 95% adjudicated factual support for consequential statements before accepting a candidate. These are proposed thresholds to ratify before evaluation, not achieved results. Compare providers on identical evidence, token budgets, rubric and successful-task definitions; report failures and review labor alongside latency/cost. Prefer rendering critical counts and amounts from deterministic facts over asking a model to repeat them.

## Bounded semantic regression guards added after the live samples

The server now rejects known count, weighted-mean/median and floor/lot-area confusions before rendering generated prose, using retrieved CMA/property evidence and paragraph references. Both numeric and spelled-out counts are checked in recognized factual phrases; hypothetical counts and ambiguous multi-analysis contexts are not silently assigned facts. Full orchestration tests prove these examples return deterministic evidence without an extra provider call. These are bounded regression checks, not a general entailment model. Historical raw live outputs and the errors above remain unchanged; no new live Groq request was needed for these tests. Unsupported property-type or market claims outside these rules still require review.
