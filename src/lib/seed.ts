import { buildDecisionGraph, calculateCma, DEMO_AS_OF } from './analytics';
import type { ListingCheckIn, Property, Workspace } from './types';

const day = (date: string) => `${date}T12:00:00.000Z`;
const checkIn = (
  id: string,
  propertyId: string,
  weekOf: string,
  showings: number,
  secondShowings: number,
  offers: number,
  feedback: string,
): ListingCheckIn => ({
  id,
  propertyId,
  weekOf: day(weekOf),
  showings,
  secondShowings,
  offers,
  feedback: `DEMO: ${feedback}`,
  createdAt: day(weekOf),
});
/** Entirely invented fixture records. Geographic context is approximate Austin, not real listings. */
export function createDemoWorkspace(): Workspace {
  const makeProperty = (
    input: Partial<Property> & Pick<Property, 'id' | 'address' | 'lat' | 'lng' | 'sqft' | 'price'>,
  ): Property => ({
    city: 'Austin',
    state: 'TX',
    zip: '78745',
    beds: 4,
    baths: 3,
    lotSqft: 7200,
    yearBuilt: 2006,
    condition: 4,
    status: 'active',
    listedAt: day('2026-08-20'),
    dom: 56,
    sourceId: 'source-synthetic-properties',
    description:
      'SYNTHETIC DEMO ONLY. Fictional home and invented listing history, coordinates approximating an Austin-area neighborhood. Not an actual listing, MLS record, or valuation.',
    history: [],
    ...input,
  });
  const properties: Property[] = [
    makeProperty({
      id: 'property-01',
      address: '104 Example Willow Loop',
      lat: 30.2088,
      lng: -97.7872,
      sqft: 2480,
      price: 749000,
      history: [
        { date: day('2026-08-20'), event: 'Synthetic listing created', price: 769000 },
        { date: day('2026-09-18'), event: 'Synthetic asking-price revision', price: 749000 },
      ],
    }),
    makeProperty({
      id: 'property-02',
      address: '118 Example Willow Loop',
      lat: 30.2114,
      lng: -97.7819,
      sqft: 2440,
      price: 729000,
      soldPrice: 715000,
      status: 'sold',
      soldAt: day('2026-06-20'),
      listedAt: day('2026-05-04'),
      dom: 47,
      history: [
        { date: day('2026-05-04'), event: 'Synthetic listing created', price: 729000 },
        { date: day('2026-06-20'), event: 'Synthetic closed sale', price: 715000 },
      ],
    }),
    makeProperty({
      id: 'property-03',
      address: '212 Example Cedar Trace',
      lat: 30.2165,
      lng: -97.7912,
      sqft: 2600,
      price: 759000,
      soldPrice: 742000,
      status: 'sold',
      soldAt: day('2026-07-10'),
      listedAt: day('2026-05-28'),
      dom: 43,
      lotSqft: 7700,
      history: [
        { date: day('2026-05-28'), event: 'Synthetic listing created', price: 759000 },
        { date: day('2026-07-10'), event: 'Synthetic closed sale', price: 742000 },
      ],
    }),
    makeProperty({
      id: 'property-04',
      address: '306 Example Meadow Rise',
      lat: 30.2043,
      lng: -97.779,
      sqft: 2320,
      price: 705000,
      soldPrice: 690000,
      status: 'sold',
      soldAt: day('2026-08-01'),
      listedAt: day('2026-06-12'),
      dom: 50,
      beds: 3,
      baths: 2.5,
      condition: 3.5,
      history: [
        { date: day('2026-06-12'), event: 'Synthetic listing created', price: 719000 },
        { date: day('2026-07-03'), event: 'Synthetic asking-price revision', price: 705000 },
        { date: day('2026-08-01'), event: 'Synthetic closed sale', price: 690000 },
      ],
    }),
    makeProperty({
      id: 'property-05',
      address: '418 Example Juniper Way',
      lat: 30.2024,
      lng: -97.7965,
      sqft: 2510,
      price: 745000,
      soldPrice: 730000,
      status: 'sold',
      soldAt: day('2026-08-24'),
      listedAt: day('2026-07-09'),
      dom: 46,
      lotSqft: 6800,
      history: [
        { date: day('2026-07-09'), event: 'Synthetic listing created', price: 745000 },
        { date: day('2026-08-24'), event: 'Synthetic closed sale', price: 730000 },
      ],
    }),
    makeProperty({
      id: 'property-06',
      address: '522 Example Orchard Bend',
      lat: 30.2188,
      lng: -97.8002,
      sqft: 2670,
      price: 779000,
      soldPrice: 766000,
      status: 'sold',
      soldAt: day('2026-09-06'),
      listedAt: day('2026-07-22'),
      dom: 46,
      condition: 4.5,
      lotSqft: 8100,
      yearBuilt: 2011,
      history: [
        { date: day('2026-07-22'), event: 'Synthetic listing created', price: 779000 },
        { date: day('2026-09-06'), event: 'Synthetic closed sale', price: 766000 },
      ],
    }),
    makeProperty({
      id: 'property-07',
      address: '624 Example Creek Hollow',
      lat: 30.199,
      lng: -97.7828,
      sqft: 2420,
      price: 725000,
      soldPrice: 709000,
      status: 'sold',
      soldAt: day('2026-09-18'),
      listedAt: day('2026-08-06'),
      dom: 43,
      condition: 3.5,
      history: [
        { date: day('2026-08-06'), event: 'Synthetic listing created', price: 725000 },
        { date: day('2026-09-18'), event: 'Synthetic closed sale', price: 709000 },
      ],
    }),
    makeProperty({
      id: 'property-08',
      address: '728 Example Laurel Court',
      lat: 30.21,
      lng: -97.773,
      sqft: 2470,
      price: 739000,
      soldPrice: 725000,
      status: 'sold',
      soldAt: day('2026-10-02'),
      listedAt: day('2026-08-22'),
      dom: 41,
      history: [
        { date: day('2026-08-22'), event: 'Synthetic listing created', price: 739000 },
        { date: day('2026-10-02'), event: 'Synthetic closed sale', price: 725000 },
      ],
    }),
    makeProperty({
      id: 'property-09',
      address: '832 Example Oak Terrace',
      lat: 30.2131,
      lng: -97.794,
      sqft: 2550,
      price: 769000,
      listedAt: day('2026-08-12'),
      dom: 64,
      history: [
        { date: day('2026-08-12'), event: 'Synthetic listing created', price: 799000 },
        { date: day('2026-09-28'), event: 'Synthetic asking-price revision', price: 769000 },
      ],
    }),
    makeProperty({
      id: 'property-10',
      address: '936 Example Sage Landing',
      lat: 30.2051,
      lng: -97.79,
      sqft: 2380,
      price: 719000,
      beds: 3,
      baths: 2.5,
      listedAt: day('2026-09-20'),
      dom: 25,
      history: [{ date: day('2026-09-20'), event: 'Synthetic listing created', price: 719000 }],
    }),
    makeProperty({
      id: 'property-11',
      address: '1040 Example Elm Crossing',
      lat: 30.2201,
      lng: -97.785,
      sqft: 2520,
      price: 735000,
      status: 'pending',
      listedAt: day('2026-08-28'),
      dom: 35,
      history: [
        { date: day('2026-08-28'), event: 'Synthetic listing created', price: 749000 },
        { date: day('2026-09-16'), event: 'Synthetic asking-price revision', price: 735000 },
        { date: day('2026-10-02'), event: 'Synthetic contract recorded; closing price unobserved' },
      ],
    }),
    makeProperty({
      id: 'property-12',
      address: '1144 Example Birch Vista',
      lat: 30.2014,
      lng: -97.7719,
      sqft: 2480,
      price: 799000,
      status: 'withdrawn',
      listedAt: day('2026-07-01'),
      dom: 96,
      history: [
        { date: day('2026-07-01'), event: 'Synthetic listing created', price: 825000 },
        { date: day('2026-08-15'), event: 'Synthetic asking-price revision', price: 799000 },
        { date: day('2026-10-05'), event: 'Synthetic listing withdrawn; outcome unknown' },
      ],
    }),
  ];
  const currentCma = calculateCma(properties[0], properties, {}, DEMO_AS_OF);
  const historicalForecastAt = day('2026-08-18');
  // Construct an input snapshot without later price/status events: the forecast cannot see its own outcome.
  const historicalProperties = properties
    .map((property): Property => {
      const history = property.history.filter(event => event.date <= historicalForecastAt);
      const alreadySold = Boolean(property.soldAt && property.soldAt < historicalForecastAt);
      return {
        ...property,
        history,
        sourceId: 'source-synthetic-historical',
        price: history.filter(event => event.price).at(-1)?.price ?? property.price,
        status: alreadySold ? 'sold' : 'active',
        dom: alreadySold
          ? property.dom
          : Math.floor((Date.parse(historicalForecastAt) - Date.parse(property.listedAt)) / 86400000),
        soldAt: alreadySold ? property.soldAt : undefined,
        soldPrice: alreadySold ? property.soldPrice : undefined,
      };
    })
    .filter(property => property.listedAt <= historicalForecastAt);
  const forecastSubject = historicalProperties.find(property => property.id === 'property-07')!;
  const historicalCma = calculateCma(forecastSubject, historicalProperties, {}, historicalForecastAt);
  const workspace: Workspace = {
    schemaVersion: 1,
    mode: 'demo',
    asOf: DEMO_AS_OF,
    properties,
    sources: [
      {
        id: 'source-synthetic-properties',
        label: 'Invented Austin-area property fixture · DEMO',
        kind: 'synthetic',
        observedAt: DEMO_AS_OF,
        license: 'Locally authored fictional data; demonstration use only. No MLS rights or live data implied.',
        confidence: 1,
      },
      {
        id: 'source-synthetic-contacts',
        label: 'Invented client and offer fixture · DEMO',
        kind: 'synthetic',
        observedAt: DEMO_AS_OF,
        license: 'Fictional people and contact details using reserved example.com domain; demonstration use only.',
        confidence: 1,
      },
      {
        id: 'source-synthetic-contract',
        label: 'Invented transaction milestones · DEMO',
        kind: 'synthetic',
        observedAt: day('2026-10-03'),
        license: 'Hand-authored fictional dates, not legal advice or extracted contract obligations.',
        confidence: 1,
      },
      {
        id: 'source-synthetic-historical',
        label: 'Invented frozen historical fixture · DEMO',
        kind: 'synthetic',
        observedAt: historicalForecastAt,
        license:
          'Synthetic historical snapshot with later events removed; fictional evaluation plumbing, not real historical data.',
        confidence: 1,
      },
    ],
    clients: [
      {
        id: 'client-01',
        name: 'Avery — demo seller',
        email: 'avery@example.com',
        phone: '(555) 010-0110',
        role: 'seller',
        stage: 'active',
        budget: 749000,
        preferences:
          'Seller: prioritize transparent net proceeds, a flexible November closing, and verified financing. Fictional client.',
        savedPropertyIds: ['property-01'],
        timeline: [
          {
            date: day('2026-08-18'),
            note: 'Synthetic listing consultation: agreed to review evidence and fees before authorizing a price.',
          },
          {
            date: day('2026-10-14'),
            note: 'Synthetic follow-up: compare three offers and confirm written seller priorities.',
          },
        ],
      },
      {
        id: 'client-02',
        name: 'Morgan — demo buyer',
        email: 'morgan@example.com',
        phone: '(555) 010-0121',
        role: 'buyer',
        stage: 'active',
        budget: 760000,
        preferences:
          'At least 3 bedrooms, 2.5 bathrooms, 2,300 sqft; needs a flexible closing. No demographic or protected-class criteria.',
        savedPropertyIds: ['property-01', 'property-10'],
        timeline: [
          {
            date: day('2026-09-25'),
            note: 'Synthetic consultation: record objective property preferences and lender verification to follow.',
          },
          {
            date: day('2026-10-12'),
            note: 'Synthetic showing follow-up: requested a sourced comparison of saved homes.',
          },
        ],
      },
      {
        id: 'client-03',
        name: 'Jordan — demo purchaser',
        email: 'jordan@example.com',
        phone: '(555) 010-0133',
        role: 'buyer',
        stage: 'under-contract',
        budget: 750000,
        preferences:
          'Fictional purchaser under contract; verify inspection and financing deadlines with signed documents.',
        savedPropertyIds: ['property-11'],
        timeline: [
          {
            date: day('2026-10-02'),
            note: 'Synthetic contract recorded. Milestones are examples requiring professional confirmation.',
          },
        ],
      },
    ],
    offers: [
      {
        id: 'offer-01',
        propertyId: 'property-01',
        buyer: 'Demo offer A',
        price: 745000,
        sellerCredit: 15000,
        financing: 'conventional',
        downPercent: 20,
        earnestMoney: 15000,
        contingencies: ['Inspection: 7 days after effective date', 'Financing approval: 21 days', 'Appraisal'],
        closeDate: day('2026-11-20'),
        expiresAt: '2026-10-18T23:59:00.000Z',
        status: 'received',
      },
      {
        id: 'offer-02',
        propertyId: 'property-01',
        buyer: 'Demo offer B',
        price: 722000,
        sellerCredit: 0,
        financing: 'cash',
        downPercent: 100,
        earnestMoney: 22000,
        contingencies: ['Inspection: 5 days after effective date'],
        closeDate: day('2026-11-06'),
        expiresAt: '2026-10-17T23:59:00.000Z',
        status: 'received',
      },
      {
        id: 'offer-03',
        propertyId: 'property-01',
        buyer: 'Demo offer C',
        price: 754000,
        sellerCredit: 20000,
        financing: 'fha',
        downPercent: 3.5,
        earnestMoney: 10000,
        contingencies: [
          'Inspection: 10 days after effective date',
          'Financing approval: 25 days',
          'Appraisal',
          'Sale of existing home',
        ],
        closeDate: day('2026-12-04'),
        expiresAt: '2026-10-19T23:59:00.000Z',
        status: 'received',
      },
    ],
    transactions: [
      {
        id: 'transaction-01',
        propertyId: 'property-01',
        clientId: 'client-01',
        stage: 'preparing',
        notes:
          'DEMO: offer review and preparation only. No offer has been accepted and no binding closing obligation is represented.',
        milestones: [
          {
            id: 'milestone-01',
            title: 'Review CMA assumptions and evidence with seller',
            dueAt: day('2026-10-16'),
            status: 'pending',
            sourceId: 'source-synthetic-contract',
          },
          {
            id: 'milestone-02',
            title: 'Confirm seller-approved offer priorities',
            dueAt: day('2026-10-16'),
            status: 'pending',
            sourceId: 'source-synthetic-contract',
          },
          {
            id: 'milestone-03',
            title: 'Review disclosures with licensed professional',
            dueAt: day('2026-10-19'),
            status: 'pending',
            sourceId: 'source-synthetic-contract',
          },
        ],
      },
      {
        id: 'transaction-02',
        propertyId: 'property-11',
        clientId: 'client-03',
        stage: 'under-contract',
        notes:
          'DEMO: dates are fictional task reminders. Replace with human-reviewed obligations from a signed contract before professional use.',
        milestones: [
          {
            id: 'milestone-04',
            title: 'Confirm executed contract and source dates',
            dueAt: day('2026-10-03'),
            status: 'complete',
            sourceId: 'source-synthetic-contract',
          },
          {
            id: 'milestone-05',
            title: 'Inspection review — verify contractual deadline',
            dueAt: day('2026-10-17'),
            status: 'pending',
            sourceId: 'source-synthetic-contract',
          },
          {
            id: 'milestone-06',
            title: 'Lender documentation review',
            dueAt: day('2026-10-22'),
            status: 'pending',
            sourceId: 'source-synthetic-contract',
          },
          {
            id: 'milestone-07',
            title: 'Tentative closing — confirm with title professional',
            dueAt: day('2026-11-06'),
            status: 'pending',
            sourceId: 'source-synthetic-contract',
          },
        ],
      },
    ],
    documents: [],
    cmas: [
      {
        id: 'cma-history-01',
        name: 'Synthetic frozen forecast · Creek Hollow',
        propertyId: 'property-07',
        createdAt: historicalForecastAt,
        result: historicalCma,
      },
      {
        id: 'cma-01',
        name: 'Willow Loop · evidence review',
        propertyId: 'property-01',
        createdAt: DEMO_AS_OF,
        result: currentCma,
      },
    ],
    savedSearches: [
      {
        id: 'search-01',
        name: 'Morgan · objective home criteria',
        query: 'Austin',
        maxPrice: 760000,
        clientId: 'client-02',
        createdAt: day('2026-09-25'),
      },
    ],
    alerts: [
      {
        id: 'alert-demo-01',
        propertyId: 'property-09',
        title: 'Recorded competitor price revision',
        explanation:
          'DEMO evidence: Example Oak Terrace changed its asking price from $799,000 to $769,000 on September 28. Review the current comp evidence; no causal effect on your property has been established.',
        severity: 'info',
        sourceIds: ['source-synthetic-properties'],
        createdAt: day('2026-09-28'),
        read: false,
        fingerprint: 'seed-property-09-price-769000',
      },
      {
        id: 'alert-demo-02',
        propertyId: 'property-12',
        title: 'Recorded competing listing withdrawal',
        explanation:
          'DEMO evidence: Example Birch Vista was withdrawn October 5. The final reason and outcome are unknown; do not treat this as a closed sale or proof of overpricing.',
        severity: 'review',
        sourceIds: ['source-synthetic-properties'],
        createdAt: day('2026-10-05'),
        read: false,
        fingerprint: 'seed-property-12-withdrawn',
      },
    ],
    nodes: [],
    edges: [],
    outcomes: [
      {
        id: 'outcome-demo-01',
        propertyId: 'property-07',
        cmaId: 'cma-history-01',
        forecastAt: historicalForecastAt,
        observedAt: day('2026-09-18'),
        actualPrice: 709000,
        notes:
          'Entirely synthetic retrospective fixture. Forecast constructed from a snapshot of sales closed before August 18. Cannot validate real-world accuracy or superiority.',
      },
    ],
    approvals: [],
    listingCheckIns: [
      checkIn(
        'checkin-01',
        'property-01',
        '2026-09-21',
        6,
        2,
        0,
        'Buyers liked the yard and light. Two asked about the kitchen age.',
      ),
      checkIn(
        'checkin-02',
        'property-01',
        '2026-09-28',
        5,
        2,
        0,
        'Second-showing couple wants to compare with Oak Terrace.',
      ),
      checkIn('checkin-03', 'property-01', '2026-10-05', 4, 2, 0, 'Feedback steady: layout works, kitchen is dated.'),
      checkIn('checkin-04', 'property-01', '2026-10-12', 4, 3, 3, 'Three written offers after the price revision.'),
    ],
    audit: [],
    settings: { retentionDays: 365, organization: 'Ascent Demonstration Studio' },
  };
  const graph = buildDecisionGraph(workspace);
  workspace.nodes = graph.nodes;
  workspace.edges = graph.edges;
  return workspace;
}

/**
 * Fictional Washington-area workflows for the default demo region. Runs once, after the DMV fixtures are projected,
 * and resolves fixture properties by address because canonical IDs are derived during ingestion.
 */
export function seedRegionalDemoWorkflows(workspace: Workspace): boolean {
  if (workspace.mode !== 'demo' || workspace.clients.some(client => client.id === 'client-dmv-01')) return false;
  const byAddress = (address: string) => workspace.properties.find(property => property.address === address)?.id;
  const listing = byAddress('100 Example Potomac Way'),
    second = byAddress('114 Example Potomac Way'),
    pending = byAddress('198 Example Potomac Way');
  if (!listing || !second || !pending) return false;
  workspace.clients.push(
    {
      id: 'client-dmv-01',
      name: 'Riley — demo seller',
      email: 'riley@example.com',
      phone: '(555) 010-0142',
      role: 'seller',
      stage: 'active',
      budget: 961000,
      preferences: 'Seller: wants a mid-November settlement and a clean inspection period. Fictional client.',
      savedPropertyIds: [listing],
      timeline: [
        { date: day('2026-07-16'), note: 'Synthetic listing consultation: reviewed comparable evidence and fees.' },
        {
          date: day('2026-10-13'),
          note: 'Synthetic call: three offers expected this week; seller prefers fewer contingencies.',
        },
      ],
      followUps: [
        {
          id: 'follow-up-dmv-01',
          title: 'Walk Riley through the three offers side by side',
          dueAt: day('2026-10-16'),
          status: 'pending',
          createdAt: day('2026-10-13'),
          propertyId: listing,
        },
      ],
    },
    {
      id: 'client-dmv-02',
      name: 'Sam — demo purchaser',
      email: 'sam@example.com',
      phone: '(555) 010-0156',
      role: 'buyer',
      stage: 'under-contract',
      budget: 975000,
      preferences: 'Fictional purchaser under contract; confirm every deadline against the signed agreement.',
      savedPropertyIds: [pending],
      timeline: [{ date: day('2026-10-03'), note: 'Synthetic ratified contract recorded for review.' }],
    },
    {
      id: 'client-dmv-03',
      name: 'Casey — demo buyer',
      email: 'casey@example.com',
      phone: '(555) 010-0187',
      role: 'buyer',
      stage: 'lead',
      budget: 900000,
      preferences: 'Four bedrooms, three baths, under $950k, Arlington ZIPs. Fictional lead.',
      savedPropertyIds: [second],
      timeline: [{ date: day('2026-10-09'), note: 'Synthetic open-house sign-in; asked for recent sales.' }],
      followUps: [
        {
          id: 'follow-up-dmv-02',
          title: 'Send Casey the recent Potomac Way sales',
          dueAt: day('2026-10-14'),
          status: 'pending',
          createdAt: day('2026-10-09'),
        },
      ],
    },
    {
      id: 'client-dmv-04',
      name: 'Taylor — demo lead',
      email: 'taylor@example.com',
      role: 'buyer',
      stage: 'lost',
      budget: 850000,
      preferences: 'Fictional lead who chose to keep renting for another year.',
      savedPropertyIds: [],
      timeline: [{ date: day('2026-09-02'), note: 'Synthetic note: decided to renew lease; revisit in spring.' }],
    },
  );
  workspace.offers.push(
    {
      id: 'offer-dmv-01',
      propertyId: listing,
      buyer: 'Demo offer A',
      price: 955000,
      sellerCredit: 5000,
      financing: 'conventional',
      downPercent: 20,
      earnestMoney: 25000,
      contingencies: ['Inspection: 7 days after ratification', 'Financing: 21 days', 'Appraisal'],
      closeDate: day('2026-11-20'),
      expiresAt: '2026-10-18T23:59:00.000Z',
      status: 'received',
    },
    {
      id: 'offer-dmv-02',
      propertyId: listing,
      buyer: 'Demo offer B',
      price: 940000,
      sellerCredit: 0,
      financing: 'cash',
      downPercent: 100,
      earnestMoney: 40000,
      contingencies: ['Inspection: 5 days after ratification'],
      closeDate: day('2026-11-06'),
      expiresAt: '2026-10-17T23:59:00.000Z',
      status: 'received',
    },
    {
      id: 'offer-dmv-03',
      propertyId: listing,
      buyer: 'Demo offer C',
      price: 968000,
      sellerCredit: 15000,
      financing: 'fha',
      downPercent: 3.5,
      earnestMoney: 10000,
      contingencies: [
        'Inspection: 10 days after ratification',
        'Financing: 30 days',
        'Appraisal',
        'Sale of existing home',
      ],
      closeDate: day('2026-12-10'),
      expiresAt: '2026-10-19T23:59:00.000Z',
      status: 'received',
    },
  );
  workspace.transactions.push({
    id: 'transaction-dmv-01',
    propertyId: pending,
    clientId: 'client-dmv-02',
    stage: 'under-contract',
    notes: 'DEMO: fictional deadlines. Replace with dates confirmed from the signed contract.',
    milestones: [
      {
        id: 'milestone-dmv-01',
        title: 'Earnest money deposit confirmed',
        dueAt: day('2026-10-08'),
        status: 'complete',
      },
      {
        id: 'milestone-dmv-02',
        title: 'Home inspection contingency ends',
        dueAt: day('2026-10-17'),
        status: 'pending',
      },
      { id: 'milestone-dmv-03', title: 'Appraisal due', dueAt: day('2026-10-21'), status: 'pending' },
      { id: 'milestone-dmv-04', title: 'Financing contingency ends', dueAt: day('2026-10-29'), status: 'pending' },
      { id: 'milestone-dmv-05', title: 'Settlement', dueAt: day('2026-11-12'), status: 'pending' },
    ],
  });
  (workspace.listingCheckIns ??= []).push(
    checkIn('checkin-dmv-01', listing, '2026-09-21', 3, 1, 0, 'Price feels high next to the August sales.'),
    checkIn('checkin-dmv-02', listing, '2026-09-28', 4, 1, 0, 'Liked the light; kitchen needs updating.'),
    checkIn('checkin-dmv-03', listing, '2026-10-05', 5, 2, 0, 'Two second showings; one buyer waiting on a home sale.'),
    checkIn('checkin-dmv-04', listing, '2026-10-12', 6, 3, 3, 'Three offers arrived after the weekend open house.'),
    checkIn('checkin-dmv-05', second, '2026-09-28', 4, 0, 0, 'Buyers said the price is high for the condition.'),
    checkIn('checkin-dmv-06', second, '2026-10-05', 2, 0, 0, 'Dated baths; price feels expensive versus recent sales.'),
    checkIn('checkin-dmv-07', second, '2026-10-12', 1, 0, 0, 'One showing. Feedback: needs work, priced too high.'),
  );
  return true;
}
