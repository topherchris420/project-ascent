# Domain intelligence: validation and limits

The implementation adds a deterministic professional-practice layer, rather than claiming that a language model has acquired expert judgment. It does not establish competitive superiority over Homesolo. Original-product internals, real customer outcomes and independent expert agreement are unmeasured.

## Working foundation

Eleven versioned declarative rules cover sparse CMA evidence, adjustment dependence, empirical range width, assumed trends, and offer interactions involving financing, appraisal protection, concessions, another-home sales, deposits and entered chronology. The DSL supports bounded `all`/`any`/`not` expressions over a fixed financial/property fact catalog. It cannot execute code, inspect arbitrary customer fields, use protected traits, or invent local legal deadlines. Missing facts and unknown exceptions produce an explicit insufficient-data state.

Built-ins are **unreviewed analyst-practice assumptions**. Thresholds such as three comparable sales or a 25% gross-adjustment review flag are disclosed practice choices, not statutory requirements, fitted probabilities or validated reliability cutoffs. Offer explanations distinguish seller and buyer perspectives, preserve price-minus-credit arithmetic, identify missing contract/lender evidence and require an explicit professional decision. There is no universal risk score or automated winner.

Each result separates known facts, computed arithmetic, assumptions, unknown information, evidence IDs and the decision a professional must make. Frozen CMA checksums and archived input records remain the calculation reference. Read scoping removes persisted analytical evaluations and linked support/migration copies when source rights are revoked.

## Expert governance

Users can propose rules with evidence, jurisdiction, dates, tests and labeled exceptions. Proposals are immutable and pending; they do not change active rules. Positive and negative interpreter cases must pass before independent review can approve a proposal. Review also requires a separately configured `DOMAIN_RULE_REVIEW_SECRET`, a reviewer identity distinct from the proposer, current qualification evidence and a bounded review expiry. Professional-practice approval additionally requires current workspace license verification and a credentialed real-estate reviewer. Legal-classified proposals require official primary evidence and attorney review. An owner session or paid subscription cannot approve a rule.

These checks authenticate an operator-mediated review process; they do not automatically verify an attorney or professional against a regulator. Operators must validate reviewer identity, qualification, sources, jurisdiction and independence. No actual experts or completed expert reviews are supplied in the demo. Expired reviews lose active authority. Training/support review records cannot approve domain rules.

`GET /api/domain` returns the authorized registry, proposals, evaluations, fact catalog and offer explanations. `POST` supports `checkSafety`, `evaluate`, `proposePractice` and structured `proposeRule`. Independent service review uses `POST /api/domain/review`. The schema and pure engines are in `domain-types.ts`, `domain.ts`, `offer-risk.ts` and `domain-service.ts`.

## Fair-housing triage

The shared deterministic guard separates explicit exclusion/targeting, steering, ambiguous proxies, advertising context, accommodation requests and legitimate educational/accessibility discussions. It returns `allow`, `review` or `block` with structured reasons, without echoing raw private text. Review requires clarification; it is not an automatic pass. An allow result is not compliance certification.

Federal background is grounded in [HUD's Fair Housing Rights and Obligations](https://www.hud.gov/stat/fheo/rights-obligations). Neutral, consistently supplied school/crime information is not categorically blocked, consistent with [HUD's April 24, 2026 clarification](https://www.hud.gov/news/hud-no-26-028). [HUD accessibility information](https://www.hud.gov/helping-americans/disabilities) informs the distinction between accessibility requests and discriminatory exclusion. Contract review remains necessary; [CFPB consumer guidance](https://www.consumerfinance.gov/owning-a-home/explore/find-the-right-home/) discusses financing/inspection contingencies and questions about deposits without supplying a universal contract rule.

Policy patterns are application safeguards, not a complete legal model. State/local protections, valid exceptions, multilingual text, novel euphemisms, coded messages and quoted mixed-intent requests require further review. No legal exception is automatically established by a senior-housing label or an advertising phrase.

## Reproducible local evidence

Run `npm exec -- tsx scripts/evaluate-domain.ts`. It writes [the measured artifact](../evidence/domain-evaluation.json). The internally authored English fixture contains 32 cases: explicit harmful instructions, legitimate accessibility/neutral/educational requests, and ambiguous proxies. Preset goals are 95% explicit-harm block recall, 90% legitimate allow rate and 90% proxy-review recall.

The recorded run achieved 32/32 expected triage outcomes. On this same fixture, a deliberately simple keyword-block baseline achieved 12/32 (37.5%) and allowed 2/10 legitimate requests (20%); the layered guard allowed all ten legitimate requests. The 11 built-in rules passed their positive/negative execution cases. Offer fixtures show interaction coverage that a price-minus-credit-only baseline does not attempt to supply.

Those are **fixture-specific implementation results**. Labels were authored internally, the baseline is intentionally limited, and cases are not a blinded independent holdout. These numbers are not production error rates, legal accuracy, an estimate of discrimination risk, evidence of better transaction outcomes or a measurement of Homesolo. The artifact explicitly records expert agreement, actual outcome evaluation and customer task completion as unmeasured.

Provider-record CMA inputs retain missing listing dates, asking prices, condition and days on market rather than fabricating them. Only provider-reported recorded sales with a positive closing price and eligible date can be used as closing evidence; AVM-selected listings remain listings. Unknown condition requires explicit `conditionValue=0` consent, which omits that adjustment and labels the limitation, or a separately disclosed analyst assumption. Frozen minimal observations retain source, valuation and recorded-sale graph edges. Observation IDs are evidence-bundle scoped; duplicate observations across requests remain possible, so this does not establish nationwide canonical entity resolution.

## Next validation priorities

The following gates are the evaluation protocol for future professional/production studies. They are engineering targets, not achieved results; they were not pre-registered for the internally authored fixture runs above. Ratify study design and thresholds with qualified reviewers before collecting independent evaluation data.

| Capability | Transparent baseline | Acceptance target and evidence required | Present boundary |
| --- | --- | --- | --- |
| Expert rules | Fixed versioned interpreter cases, including unknown facts | 100% specified deterministic cases; independent adjudication of jurisdiction/applicability before authoritative promotion; zero self-approved rules | Built-in practices unreviewed; no measured expert agreement |
| CMA | Same licensed, time-separated dataset with unadjusted median-price baseline | Pre-register one forecast per property and paired error/calibration tests across at least 200 properties and three markets; require a confidence interval supporting improvement before superiority claims | Arithmetic/reproducibility tested; empirical envelope is not calibrated confidence |
| Fair Housing | Published simple keyword baseline on identical labeled cases | At least 95% severe-harm recall and 90% legitimate-request allow rate on a separate independently reviewed holdout; all known critical regression cases pass; human escalation for ambiguity | Internal English cases only; no compliance certification |
| Offer analysis | Price-minus-credit arithmetic plus manual review checklist | 100% money/date fixture arithmetic, all known interacting terms/unknowns explained; future contract extraction requires at least 99% exact critical-field agreement on an independent annotated set | Structured/manual terms; no general contract extraction accuracy established |
| Onboarding | New isolated Explorer account | Register and save a useful labeled CMA/report within 120 seconds without professional approval; report distribution, not only fastest run | Automated local browser acceptance; no human usability study |
| Training | Unguided first use on the same tasks | At least 80% independent completion in a pre-registered professional study; assess corrections and understanding as well as clicks | Academy progress follows audited work; human learning unmeasured |
| Migration | Source CSV and exact preview | 100% expected supported-field mapping and idempotency; no unauthorized writes; rollback preserves all subsequent edits in the golden cases | Synthetic formats tested; vendor-specific CRM exports unverified |
| Efficiency | Same-data task using prior UI and fixed provider/model configuration | Pre-register paired task time/cost/reliability guardrails and analysis; retain a variation only with measured benefit and no critical error regression | Local computation timings/aggregate instrumentation; no causal time-saved claim |
| Trust | Blinded review of explanation with hidden calculation details | At least 90% correct identification of facts, computations, assumptions, unknowns and required decisions in an independent professional task study | Five-part explanations implemented; user comprehension unmeasured |
| Retention | Consenting professional cohort with declared eligible work | Pre-register voluntary cohort usage, successful-task and usefulness targets before an eight-week study; report churn, missing observations and support burden | No customers, retention outcomes or switching success invented |

Homesolo comparisons require reliable equivalent datasets, workflows, access and timing conditions. Public demo visuals do not supply those conditions. Until then, competitive conclusions remain unverified and the internal baselines above are the comparison reference.

1. Obtain independent qualified reviewer participation, documented jurisdiction scope and blinded case adjudication.
2. Build a separated, multilingual adversarial holdout and measure false positives/negatives by intent and surface.
3. Validate contract-specific offer interpretations and analyst thresholds prospectively against a frozen comparison cohort.
4. Run licensed-source revocation, export and retention checks in production PostgreSQL and actual provider contracts.
5. Measure professional task completion, correction burden and outcome calibration before claiming a competitive advantage.
