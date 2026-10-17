# Facilitator guide (protocol ascent-preference-1)

Each session takes about 2 hours: 10 minutes intro, 10 minutes familiarization per product, about 35 minutes of tasks per product, and 10 minutes for the preference question and debrief. Schedule a break between products.

## Before the study

1. Pre-register the [protocol](protocol.md) with its seeds, subject draw and sealed answer key.
2. Obtain working access to **both** products at the level a paying professional would have. For Ascent, each participant registers their own account on the hosted site during setup. For HomeSolo, arrange access through its normal sign-up or beta process. If either product cannot be accessed as a professional would use it, stop: the comparison would not be fair.
3. Prepare a clean browser profile per session, the printed task cards with the drawn subjects filled in, the three materials files and the CSV templates.
4. Run one pilot session with someone who is not a participant. Fix logistics only; do not change tasks or wording without a dated deviation.

## Script (read verbatim)

**Intro.** "Thank you for joining. You'll do the same six short tasks in two real estate tools. We're interested in how the tools work for you, not in testing you. I can't help you use either tool, but I can repeat instructions. Please think aloud if you're comfortable. The study is funded by the developer of one of the tools; I'm not part of either team. You can stop at any time and you'll still be paid."

**Familiarization (each product, 10 minutes).** "Take ten minutes to look around. Please find where you would look up a home, where a price or analysis appears, where you would compare offers and where you would track contract dates." Do not demonstrate features. Answer only "I can't say; please explore."

**Before each task.** Read the card aloud, hand it over and start the timer when the participant finishes reading.

**Permitted prompts only:** "Please continue." · "What would you do next?" · "Is that your final answer?" · Repeating the card. Anything else is assistance: record `assisted=yes` and what you said.

**Stopping a task.** Stop at 12 minutes, or when the participant says they would give up in real work. Record it as not completed.

**Unsupported tasks.** If the product clearly cannot accept the evidence (no way to add a sale, record a deadline or enter an offer), confirm by checking yourself for no more than two minutes, then record `supported=no`. Never mark a task unsupported because the participant could not find the feature.

## Preference question (after both products, read verbatim)

"If you had to use one of these two tools for your next listing and the offers on it, which would you choose: the first tool, the second tool, or no preference?" Then: "What are the main reasons?" and "How confident are you in that choice, from 1 to 5?"

Translate "first" and "second" to the product names when recording. Do not ask for a preference earlier, and do not ask leading follow-up questions.

## After each session

Save deliverables named by participant ID and product, fill the three CSVs from [templates](templates/), and send deliverables to the blinded reviewers. Delete screen recordings after scoring if consent was limited to scoring.

## After all sessions

Run `npx tsx scripts/study/analyze-study.ts <folder>` and publish `study-report.md` with every deviation, withdrawal and unsupported task.
