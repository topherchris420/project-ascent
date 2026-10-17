# Preference study kit

Everything an independent facilitator needs to run protocol **ascent-preference-1**: ten experienced real estate professionals complete the same six tasks in Ascent and HomeSolo, then say which they would choose. The target is at least 7 of 10 choosing Ascent.

**Status: ready to pre-register. Not yet run. Participants: 0.** No result exists until the study is conducted by someone outside the Ascent team.

| File | Use |
| --- | --- |
| [protocol.md](protocol.md) | Question, design, outcomes, analysis and pre-registration checklist |
| [facilitator-guide.md](facilitator-guide.md) | Session script, permitted prompts, unsupported-task rule, preference question |
| [tasks.md](tasks.md) | The six task cards, identical for both products |
| [materials/](materials/) | Fictional offers and contract excerpt; sealed answer key |
| [scoring-rubric.md](scoring-rubric.md) | What counts as completed, correct, critical error or assistance |
| [recruitment.md](recruitment.md) | Eligibility, screener, neutral outreach and consent form |
| [templates/](templates/) | The three CSVs the facilitator fills in |

## Commands

```bash
npx tsx scripts/study/randomize-study.ts --seed <seed> --participants 10   # counterbalanced schedule
npx tsx scripts/study/draw-subjects.ts --seed <seed> --count 3             # random DC subject homes + T6 sale
npx tsx scripts/study/analyze-study.ts <folder-with-the-three-csvs>          # pre-registered analysis
```

The analysis is unit-tested (`tests/study-analysis.test.ts`): exact Clopper-Pearson intervals, exact binomial and sign tests, counterbalance checks, and the rules that withdrawals, ties and unsupported tasks are never dropped.

## What the owner must still provide

- An **independent facilitator** and at least two **blinded reviewers** who are not on the Ascent team.
- **Working professional access to HomeSolo.** Without it the comparison cannot run fairly; do not substitute its marketing site or public preview.
- **Participant compensation**, fixed before recruitment and the same whatever participants conclude.
- **A public pre-registration** (for example on OSF) before the first participant is recruited.

## What the result can and cannot say

Seven of ten is a product bar for this sample. Its exact 95% interval is roughly 35% to 93%, so it cannot show that most professionals everywhere prefer Ascent, that its prices are more accurate, or that it improves business outcomes. Report the count, the interval, every task outcome and every miss.
