# Home Decision Brief comprehension protocol

**Status: registered and ready to run; not yet run.** No participants have been recruited, no sessions have taken place and no results exist. Nothing in Ascent's documentation should be read as evidence that homeowners understand the brief until this protocol, or a better one, has been run and its results published, including unfavorable ones.

**Registration.** Protocol `ascent-usability-brief-1` is `usabilityProtocol` in `src/lib/usability-study.ts`. Its digest, `sha256-5ae60b44f30b19411b5fbe56a068f842ddb0397ce1519b096cfd0b5319d2ec2f`, was recorded in `evidence/usability/registration.json` on October 22, 2026, before any recruitment. The tasks, criteria, threshold and analysis below are the registered ones; a unit test fails if the code drifts from the registration, and `npm run usability:analyze` refuses results gathered under any other digest. Changing any of them means declaring a new protocol id.

**Running it.** The [session kit](usability/README.md) has the screener, consent form, [facilitator guide](usability/facilitator-guide.md) with the verbatim tasks and scoring rules, a per-build [answer key](usability/answer-key.md), scoring sheet, SUS questionnaire and results template. A browser pre-flight (`tests/e2e/usability-preflight.spec.ts`) checks that every task's answer is on the page in its prepared state at phone and desktop widths; it runs in CI and must pass against the build used in sessions. Passing it says nothing about comprehension.

## Question

Can homeowners who are not real estate professionals correctly interpret what the brief says, and what it does not say, well enough to decide what to do next?

## Participants

- 12–16 adults who own a home, or expect to sell one within two years, in a covered market (DC or Montgomery / Prince George's, Maryland). Exclude licensed agents, appraisers and lenders.
- Recruit for variety in age, housing type (house, condo), screen reader or magnification use (at least two participants), and phone versus desktop use (at least half on a phone).
- Informed consent, the right to stop at any time, and modest compensation set before recruitment. Sessions use the public studios with Ascent's fictional sample or the participant's chosen public-record address. Participants never enter their real mortgage or finances; the sessions use the illustrative inputs.

## Tasks

Each task starts from a fresh page at its prepared state. The facilitator reads the task and does not explain the interface. The three prepared states restore nothing and save no draft: `/demo/study/value` (the fictional sample), `/demo/study/abstention` (a separate fictional home with exactly two eligible recorded sales, so no exclusions or changed settings are attributed to the participant) and `/demo/study/finance` (the sample with the illustrative financial inputs loaded and Compare Decisions open). Tasks 1 and 3–5 use the first, task 2 the second, tasks 6–9 the third.

Known before any session, and recorded rather than explained if it causes confusion: the illustrative inputs assume a $600,000 sale price and a $300,000 mortgage unrelated to the sample's estimate.

1. **Value.** Open the sample. "What does Ascent say this home is worth, and how sure is it?"
2. **Abstention.** Open a prepared state in which two eligible sales remain. "What does Ascent say this home is worth?"
3. **Evidence.** "Which recorded sale influences the estimate most, and why?"
4. **Ranges.** "Is the home certain to sell within the range shown?"
5. **Missing facts.** "What would you need to find out before relying on this?"
6. **Choices.** With the illustrative financial inputs loaded: "What would you have after selling now, and how does renting compare?"
7. **Sensitivity.** "Which of your inputs changes the 'Continue owning' result most?"
8. **Break-even.** "Below what sale price does selling leave you worse off than continuing to own, under these inputs?"
9. **Sharing.** "Export something you could send to a relative without including your mortgage."

## Measures and success criteria

Fixed before any session. A criterion is met when at least 80% of participants meet it. A participant who did not attempt a task counts as not meeting it. The facilitator guide gives each criterion's met and not-met rules, and the answer key gives the correct figures on the build being tested.

| Task | Correct interpretation |
| --- | --- |
| 1 | States the estimate and that it is an estimate with stated limits; does not call the observed range a confidence interval or guarantee |
| 2 | States that Ascent does not give a value for this home and names the reason (too few sales) |
| 3 | Names the highest-weight sale and one reason (weight, distance, similarity or adjustment) |
| 4 | Says no: the range is the spread of adjusted sales, not a promise |
| 5 | Names at least two missing facts from the brief |
| 6 | States the net proceeds after selling costs, and that the choices are not ranked or equivalent housing |
| 7 | Names the top driver from the Compare panel |
| 8 | States the break-even sale price and that it depends on the entered assumptions |
| 9 | Produces the default (public) export and confirms it omits the mortgage |

Also recorded: time on task, task completion without assistance, errors, every misinterpretation verbatim, a System Usability Scale score, and accessibility barriers observed with assistive technology.

## Analysis and publication

- Report each criterion's count with a 95% Wilson interval, every misinterpretation, and every accessibility barrier. Small samples are reported as counts, not as population rates.
- Interface changes made in response are listed with the finding that prompted them, then re-tested with new participants; the same participants are not used to confirm a fix.
- Results, including failed criteria, are published in this repository with the date, the commit tested and the facilitator's notes. Participant identities and recordings are never published.
