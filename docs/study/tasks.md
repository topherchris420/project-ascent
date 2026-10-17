# Task cards (protocol ascent-preference-1)

Read each card aloud and hand it to the participant. Use identical wording for both products. Fill the bracketed values from the pre-registered subject draw and packet before the first session; they must not change between participants.

The participant's subject home for each product comes from the randomization output (`Subject A` or `Subject B`).

---

**T1 · Price and explain.** Your seller owns [subject address], Washington, DC. Using this tool, recommend a list price. Then, in two or three sentences, tell me which single sale most influences your number and why.

*Deliverable:* a list price and a spoken or written explanation naming one sale.

---

**T2 · Challenge a sale.** Your seller tells you that [the sale the participant named in T1] was a transfer between relatives. Remove it from your analysis and explain how your recommendation changes and why.

*Deliverable:* the revised price and an explanation of the change.

---

**T3 · Seller document.** Produce the document you would send this seller. It must show your recommended list price and the estimated net proceeds, assuming a 2.5% commission, 1% other closing costs, $12,000 in seller concessions and a $410,000 mortgage payoff.

*Deliverable:* the document (PDF, print or link) the participant would actually send.

---

**T4 · Offers.** Three offers arrived on a different listing (see [offers.md](materials/offers.md)). Using this tool, tell the seller which offer nets the most under a 2.5% commission and 1% closing costs, and which terms are missing or risky.

*Deliverable:* a named offer with its estimated net and a list of risks or unknowns.

---

**T5 · Deadline.** The accepted contract on that listing is in [contract-excerpt.txt](materials/contract-excerpt.txt). Using this tool, find the home inspection contingency deadline and make sure it is recorded correctly.

*Deliverable:* the deadline date recorded in the tool.

---

**T6 · Changed decision.** Two weeks later, a new recorded sale appears: [new-sale address], sold [date] for [price], [beds] bedrooms, [baths] baths, [square feet] square feet, [distance] miles from your subject. Update your analysis from T1 and explain to the seller what changed from your first recommendation and why.

*Deliverable:* the updated price and an explanation that names the new sale's effect.

---

## Filling T6

The subject-draw script prints a `t6NewSale` for each subject home: dated the snapshot day, 0.2 miles away, the subject's own beds, baths and size, priced at the subject's size times 8% above the median price per square foot of the five nearest recorded sales in the prior 180 days. It is hypothetical and the card should say so. Record the values in the pre-registration and use them unchanged for both products and every participant with that subject. If a subject has no recent nearby sale, the script prints `null`; draw again with the next seed and record that you did.
