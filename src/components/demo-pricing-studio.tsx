'use client';
import { defaultDemoState, demoReportHref, sampleEvidence } from '@/lib/demo-studio';
import { SAMPLE_AS_OF } from '@/lib/pricing-sample';
import { PricingStudio } from './pricing-studio';
import { date } from './format';

/** The account-free practice studio on the authored fictional Arlington sample. */
export function DemoPricingStudio() {
  return (
    <PricingStudio
      evidence={sampleEvidence}
      defaultState={defaultDemoState}
      storageKey="ascent.practice-studio.v1"
      reportHref={demoReportHref}
      conditionMax={5}
      intro={{
        eyebrow: 'A DECISION YOU CAN TAKE APART',
        titleTop: 'Find the price.',
        titleBottom: 'Understand every part.',
        lede: (
          <>
            One fictional Arlington home. Real pricing calculations.
            <br />
            Inspect a sale, choose a strategy, challenge it, then open your report.
          </>
        ),
        badgeTitle: 'Account-free practice',
        badgeLines: ['Fictional property and sales', 'No live data or model requests'],
      }}
      subjectEyebrow="SUBJECT · ARLINGTON, VIRGINIA"
      evidenceNote={`Evidence frozen ${date(SAMPLE_AS_OF)} · authored fictional records`}
      passport={{
        facts:
          'Address, coordinates, living area, beds, baths and recorded closing prices/dates come from the authored fictional sample.',
        assumptions:
          'Condition ratings, marginal adjustment rates, the trend and eligibility filters are illustrative inputs. They are not inspections or fitted local coefficients.',
        missing:
          'No ownership, transfer chain, permits, taxes, verified renovations, concessions, listing history or complete market inventory is supplied. No real map is implied by fictional coordinates.',
        footnote:
          'Real workspace evidence is separately labeled public, licensed or user-provided and requires current source permissions. This practice route accepts only the fictional sample and labeled practice entries.',
      }}
      reportNote="Draft · fictional demonstration · not reviewed for a real client"
      footerNote="Fictional practice · actual deterministic engine · no account required"
    />
  );
}
