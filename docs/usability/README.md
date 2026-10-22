# Running the homeowner comprehension study

**Status: registered, ready to run, not yet run.** No participant has been recruited and no session has taken place. Until results are published here, Ascent makes no claim about how well homeowners understand the Home Decision Brief.

The study tests whether ordinary homeowners correctly understand what the brief says, including its estimates and its limits. The tasks, criteria and analysis are fixed by [the protocol](../usability-protocol.md), registered in `evidence/usability/registration.json` before any session; its code form is `usabilityProtocol` in `src/lib/usability-study.ts`.

## The kit

| File | Use |
| --- | --- |
| [Screener](screener.md) | Who can take part, and the variety to recruit for |
| [Consent form](consent.md) | Read and signed before each session |
| [Facilitator guide](facilitator-guide.md) | Setup, the verbatim tasks, neutral prompts and scoring |
| [Answer key](answer-key.md) | The correct answers on the build being tested, generated from it |
| [Scoring sheet](scoring-sheet.md) | One per participant |
| [SUS questionnaire](sus.md) | The ten System Usability Scale items |
| [Results template](results-template.json) | The shape of `results.json` (its values are placeholders) |

The three prepared states are `/demo/study/value`, `/demo/study/abstention` and `/demo/study/finance`.

## Steps

1. **Registration.** `npm run usability:register` confirms the protocol in code still matches its registration. It was registered before any recruitment; never edit a registered task or criterion.
2. **Build.** Fix the commit participants will use, run the pre-flight against it (`E2E_BASE_URL=<build> npx playwright test tests/e2e/usability-preflight.spec.ts`) and print the answer key for it (`npm run usability:answer-key`).
3. **Recruit** 12–16 participants with the screener, including at least two who use a screen reader or magnification, at least half on a phone, house and condo owners, and more than one age band.
4. **Run** each session with the facilitator guide.
5. **Enter** the results in `evidence/usability/<study-id>/results.json` (fields below).
6. **Analyze** with `npm run usability:analyze -- --results evidence/usability/<study-id>/results.json`, which writes `report.json` beside the results and publishes `docs/usability/results-<study-id>.md`.
7. **Publish** all three files, failed criteria included, and update the protocol status, `docs/remaining-work.md` and anything else that describes comprehension.
8. **Retest** interface changes with new participants under a new study id (`retestOf` names the original).

## Results fields (`ascent-usability-results-1`)

| Field | Contents |
| --- | --- |
| `protocolId`, `protocolDigest` | The registered protocol; analysis refuses any other digest |
| `studyId` | Lower-case letters, digits and hyphens, e.g. `2026-11-dc-md-1`; also the directory name |
| `commit` | The full 40-character commit participants used |
| `retestOf` | The earlier study id this retests, or `null` |
| `facilitators`, `facilitatorNotes` | Who ran the sessions, and their notes for publication |
| `sessions[]` | One per participant: `participant` (P01…), `date` (YYYY-MM-DD), `device` (phone, tablet, desktop), `assistiveTechnology` (none, screen-reader, magnification, other), `housing` (house, condo), `ageBand` (18-34, 35-49, 50-64, 65+), `tasks`, `sus` (ten answers 1–5, or `null` if not completed) and `barriers` |
| `sessions[].tasks[]` | T1–T9 in order: `outcome` (met, not-met, not-attempted), `unaided`, `seconds` (or `null`), `errors`, `misinterpretations` (verbatim) and `notes` |
| `sessions[].barriers[]` | Each accessibility barrier: the `task` (or `null`) and a `description` |

## What the analysis reports

For each criterion: how many participants met it, a 95% Wilson interval, how many did not attempt it, how many completed it unaided, the median time and the errors. A criterion is met when at least 80% of all participants met it; a task not attempted counts as not met. It also reports each recruitment target as met or not, the SUS mean and median, every misinterpretation verbatim, and every accessibility barrier. With 12–16 participants these are counts, not population rates.
