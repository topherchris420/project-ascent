# Facilitator guide · `ascent-usability-brief-1`

How to run one comprehension session of the [registered protocol](../usability-protocol.md). Read it fully before the first session, and follow it the same way every time. The tasks, criteria and analysis are fixed by the registration; this guide only says how to carry them out.

## Before recruiting anyone

1. Confirm the registration is committed and pushed: `npm run usability:register` prints the registered digest. Never edit a task or criterion afterwards; a changed study needs a new protocol id.
2. Choose the build participants will use and record its full 40-character commit. Every session in a study uses the same build.
3. Run the pre-flight against that build. It checks that each task’s answer is on the page at phone and desktop widths:
   `E2E_BASE_URL=https://<the build> npx playwright test tests/e2e/usability-preflight.spec.ts`
   Do not start sessions until it passes.
4. Print the [answer key](answer-key.md) generated for that commit (`npm run usability:answer-key`). It is for scoring only; participants never see it.
5. Prepare per participant: the [consent form](consent.md), a [scoring sheet](scoring-sheet.md) and the [SUS questionnaire](sus.md). Agree the compensation before recruiting and pay it whether or not the participant finishes.

## Prepared states

Each task starts from a fresh page at one of three unlisted addresses. They restore nothing and save no draft, so reloading starts over.

| State | Path | What it shows |
| --- | --- | --- |
| Practice home | `/demo/study/value` | The fictional Arlington sample as a first-time visitor sees it |
| Practice home with few sales | `/demo/study/abstention` | A different fictional home with only two eligible recorded sales |
| Practice home with illustrative finances | `/demo/study/finance` | The sample with the illustrative financial inputs loaded and Compare Decisions open |

Known in advance and not to be explained during a session: the illustrative inputs assume a $600,000 sale price and $300,000 mortgage that are unrelated to the sample’s estimate, and the few-sales home is deliberately a different address. Record any confusion they cause verbatim.

## Running the session (about 60 minutes)

**Setup.** Use a private browser window, or a fresh browser profile, for each participant. Participants on a phone use their own phone where possible, with their usual text size and any assistive technology. Have the three paths ready to open, by link or QR code.

**Consent.** Read the consent form together, answer questions, and confirm the participant may stop at any time and will not enter any real financial information.

**Instructions.** Read aloud:

> We are testing the page, not you. There are no wrong answers. Please think aloud: tell me what you are looking at and what you are thinking. I can’t help you find things, because I want to see how the page works on its own. Answer in your own words.

**Tasks.** For each task, open its prepared state in a new tab, read the prompt exactly as written, and start timing. Do not explain the interface, define terms, or confirm whether an answer is right.

| Task | Open | Read aloud, verbatim |
| --- | --- | --- |
| T1 · Value | `/demo/study/value` | What does Ascent say this home is worth, and how sure is it? |
| T2 · Abstention | `/demo/study/abstention` | What does Ascent say this home is worth? |
| T3 · Evidence | `/demo/study/value` | Which recorded sale influences the estimate most, and why? |
| T4 · Ranges | `/demo/study/value` | Is the home certain to sell within the range shown? |
| T5 · Missing facts | `/demo/study/value` | What would you need to find out before relying on this? |
| T6 · Choices | `/demo/study/finance` | What would you have after selling now, and how does renting compare? |
| T7 · Sensitivity | `/demo/study/finance` | Which of your inputs changes the 'Continue owning' result most? |
| T8 · Break-even | `/demo/study/finance` | Below what sale price does selling leave you worse off than continuing to own, under these inputs? |
| T9 · Sharing | `/demo/study/finance` | Export something you could send to a relative without including your mortgage. |

Neutral prompts you may use: “What are you looking for?”, “What would you do next?”, “Take your time.” If the participant asks for help, reply “What would you try if I weren’t here?” After a second request, or five minutes without progress, you may give one hint. Record the hint; the task is then not unaided. Stop timing when the participant gives a final answer (“Is that your answer?”) or gives up, which scores as not met.

**Questionnaire.** After T9, hand over the SUS questionnaire and let the participant complete it alone.

**Debrief.** Ask: “What, if anything, was confusing?” and “Did anything seem misleading?” Record answers verbatim. Participants may then explore a public-record address of their choice; this part is not scored, and nothing they type is recorded beyond your notes.

## Scoring

Score each task immediately against its criterion and the answer key:

| Task | Met when the participant | Not met when the participant |
| --- | --- | --- |
| T1 | Gives the estimate (approximately is fine) and says it is an estimate with limits, such as a practice figure from fictional sales or one that needs care. | Treats the figure as a sale price, appraisal or guarantee, or calls the range of adjusted sales a confidence interval. |
| T2 | Says no value is stated, and that only two eligible recorded sales were found or that there were too few sales. | Gives a number as the value, or says no value is stated without the reason. |
| T3 | Names the leading sale in the answer key and one reason: its weight, closeness, recency, similar size or its adjustments. | Names another sale, or a reason unrelated to the arithmetic, such as the highest price. |
| T4 | Says no, and that the range is the spread of the adjusted sales rather than a promise or prediction. | Says yes or probably, or describes the range as a probability or confidence interval. |
| T5 | Names two or more facts listed under the brief’s missing facts, in their own words. | Names fewer than two, or only facts the brief does not list. |
| T6 | Gives the net proceeds from selling now in the answer key and compares renting without treating either as recommended, ranked or equivalent housing. | Gives the sale price as the proceeds, or states that one choice is the better or recommended one. |
| T7 | Names the top driver for Continue owning in the answer key. | Names another input. |
| T8 | Gives the break-even sale price in the answer key and says it depends on the entered inputs. | Gives another figure, or treats the threshold as a forecast or a recommended price. |
| T9 | Downloads the sharing passport with private details left out and says the mortgage is not included. | Includes private details, or cannot produce or describe the export. |

Record as **not attempted** any task the participant did not reach (for example after stopping early); it counts as not met in the analysis.

Also record, for every task: time in seconds, whether it was unaided, the number of errors (wrong paths taken), and every misinterpretation in the participant’s exact words, even when the criterion was met. Record every accessibility barrier: anything that blocked or slowed a screen reader, magnification or zoom user.

If a second person can attend, they should score independently; resolve disagreements by discussion and note them.

## After the sessions

1. Enter the results in `evidence/usability/<study-id>/results.json` following the [results template](results-template.json) and the field list in the [README](README.md). Use participant codes (P01, P02 …), never names. Never commit recordings, contact details or consent forms.
2. Run `npm run usability:analyze -- --results evidence/usability/<study-id>/results.json`. It refuses results from another protocol, sessions dated before registration, and overwriting a published report.
3. Commit the results, `report.json` and the generated `docs/usability/results-<study-id>.md`, and update the protocol’s status, including every failed criterion.
4. For each interface change made in response, write down the finding that prompted it. Re-test with **new** participants under a new study id whose results set `retestOf` to the original study.
