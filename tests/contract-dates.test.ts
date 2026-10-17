import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  analyzeContractDates,
  extractContractDates,
  labelFor,
  MAX_CONTRACT_TEXT_CHARS,
} from '../src/lib/contract-dates';
import { documentText, executeAction, uploadDocument, verifyAudit } from '../src/lib/service';
import { readDocumentText } from '../src/lib/document-reader';
import { register } from '../src/lib/auth';
import { closeDatabase, getWorkspace, mutateWorkspace, readDocument } from '../src/lib/db';
import type { Actor } from '../src/lib/types';
process.env.SQLITE_PATH = resolve('.data', `contract-dates-${randomUUID()}.sqlite`);
delete process.env.DATABASE_URL;
after(closeDatabase);

const contract = `
RESIDENTIAL SALES CONTRACT (FICTIONAL SAMPLE)
Date of Ratification: October 3, 2026.
Purchaser shall deliver an earnest money deposit of $25,000 within 5 business days after ratification.
Purchaser may conduct a home inspection within 10 days after ratification.
The appraisal must be completed by 10/21/2026.
Financing contingency: loan approval within twenty-one (21) days after ratification.
Settlement shall occur on or before 12 November 2026.
A final walk-through may occur within 2 days prior to settlement.
Seller's response is due 2026-02-30, which is not a real date.
`;

/** Small synthetic PDF, with real page boundaries and uncompressed Helvetica text. */
function makePdf(lines: string[], additionalPages: string[][] = []): Buffer {
  const pages = [lines, ...additionalPages];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  pages.forEach((page, index) => {
    const content = `BT /F1 11 Tf 50 750 Td 14 TL ${page.map(line => `(${line.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ')} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + index * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

test('stated dates in ISO, US numeric and written formats are labeled from nearby contract wording', () => {
  const dates = extractContractDates(contract);
  const stated = dates.filter(item => item.basis === 'stated');
  assert.deepEqual(
    stated.map(item => [item.date, item.label]),
    [
      ['2026-10-03', 'Ratification / effective date'],
      ['2026-10-21', 'Appraisal deadline'],
      ['2026-11-12', 'Settlement / closing'],
    ],
  );
  assert.ok(!dates.some(item => item.date === '2026-02-30'), 'impossible dates are rejected');
  assert.ok(dates.every(item => item.approved === false));
});

test('relative terms are computed from stated anchors with the rule shown', () => {
  const computed = extractContractDates(contract).filter(item => item.basis === 'computed');
  const byLabel = Object.fromEntries(computed.map(item => [item.label, item]));
  assert.equal(byLabel['Inspection contingency ends'].date, '2026-10-13');
  assert.match(byLabel['Inspection contingency ends'].rule!, /10 calendar days after ratification \(2026-10-03\)/);
  // October 3, 2026 is a Saturday; five business days later is Friday, October 9.
  assert.equal(byLabel['Earnest money deposit due'].date, '2026-10-09');
  assert.match(byLabel['Earnest money deposit due'].rule!, /weekends skipped/);
  assert.equal(byLabel['Financing contingency ends'].date, '2026-10-24');
  assert.equal(byLabel['Final walk-through'].date, '2026-11-10');
});

test('relative terms without a stated anchor propose nothing', () => {
  assert.deepEqual(extractContractDates('Inspection within 10 days after ratification.'), []);
});

test('labels prefer the nearest preceding keyword', () => {
  const text = 'The inspection report is attached. Settlement date: ';
  assert.equal(labelFor(text, text.length, 0), 'Settlement / closing');
});

test('text-based PDFs are read and their dates proposed on upload; unreadable PDFs say so', async () => {
  const pdf = makePdf(['Date of Ratification: October 3, 2026.', 'Settlement shall occur on November 12, 2026.']);
  const text = await documentText({ name: 'contract.pdf', bytes: pdf });
  assert.match(text, /October 3, 2026/);
  const { user } = await register({
    seed: 'demo',
    name: 'Contract reader',
    email: `${randomUUID()}@example.test`,
    password: 'contract reader private passphrase 123',
  });
  const result = await uploadDocument(user, 'transaction-02', {
    name: 'contract.pdf',
    type: 'application/pdf',
    bytes: pdf,
  });
  const document = result.workspace.documents[0];
  assert.ok(document.textLength! > 20);
  assert.deepEqual(
    document.extractedDates.map(item => item.label),
    ['Ratification / effective date', 'Settlement / closing'],
  );
  const empty = await documentText({ name: 'scan.pdf', bytes: Buffer.from('%PDF-1.4\nnot really a pdf') });
  assert.equal(empty, '');
});

test('business-day arithmetic skips weekends forwards and backwards without claiming holiday support', () => {
  const result = analyzeContractDates(
    'Closing: November 9, 2026.\nWalk-through: 2 business days before closing.\nRatification: November 6, 2026.\nDeposit: 2 banking days after ratification.',
  );
  const computed = result.candidates.filter(item => item.basis === 'computed');
  assert.deepEqual(
    computed.map(item => item.date),
    ['2026-11-05', '2026-11-10'],
  );
  assert.ok(
    computed.every(item => item.warnings?.some(warning => /no jurisdiction, bank or holiday calendar/.test(warning))),
  );
  assert.ok(computed.every(item => item.warnings?.some(warning => /excludes the named anchor day/.test(warning))));
});

test('conflicting anchors are surfaced with evidence, while identical repetitions do not create a conflict', () => {
  const disputed = analyzeContractDates([
    { page: 1, text: 'Ratification: October 3, 2026.' },
    { page: 2, text: 'Ratification: October 5, 2026.\nInspection within 10 days after ratification.' },
  ]);
  assert.equal(disputed.candidates.filter(item => item.basis === 'computed').length, 0);
  const issue = disputed.issues.find(item => item.code === 'conflicting-anchors')!;
  assert.deepEqual(
    issue.anchors?.map(anchor => [anchor.date, anchor.evidence.page]),
    [
      ['2026-10-03', 1],
      ['2026-10-05', 2],
    ],
  );
  const repeated = analyzeContractDates(
    'Ratification: October 3, 2026.\nRatification: October 3, 2026.\nInspection within 10 days after ratification.',
  );
  assert.equal(repeated.candidates.find(item => item.basis === 'computed')?.date, '2026-10-13');
  assert.equal(repeated.issues.length, 0);
});

test('ratification, acceptance, execution and effective dates stay separate rather than silently substituting anchors', () => {
  const result = analyzeContractDates(
    'Effective date: October 1, 2026.\nDate of acceptance: October 2, 2026.\nExecution: October 3, 2026.\nInspection: 5 days after ratification.\nDeposit: 5 days after acceptance.\nAppraisal: 5 days after effective date.\nFinancing: 5 days after execution.',
  );
  assert.deepEqual(
    result.candidates.filter(item => item.basis === 'computed').map(item => [item.anchor?.kind, item.date]),
    [
      ['acceptance', '2026-10-07'],
      ['effective date', '2026-10-06'],
      ['execution', '2026-10-08'],
    ],
  );
  assert.ok(result.issues.some(item => item.code === 'missing-anchor' && item.message.includes('ratification')));
  const closing = analyzeContractDates('Closing: October 10, 2026.\nWalk-through: 2 days before settlement.');
  assert.equal(closing.candidates.filter(item => item.basis === 'computed').length, 0);
  assert.ok(closing.issues.some(item => item.code === 'missing-anchor'));
});

test('ambiguous counting and inconsistent written/numeric periods require manual resolution', () => {
  const result = analyzeContractDates(
    'Ratification: October 3, 2026.\nInspection: ten (7) days after ratification.\nFinancing: 5 days from ratification.\nDeposit: 5 days of ratification.\nAppraisal: 0 days after ratification.',
  );
  assert.equal(result.candidates.filter(item => item.basis === 'computed').length, 0);
  assert.deepEqual(
    result.issues.map(issue => issue.code),
    ['conflicting-period', 'ambiguous-direction', 'ambiguous-direction', 'unsupported-period'],
  );
});

test('written day counts are parsed as whole phrases and never as a shorter suffix', () => {
  const result = analyzeContractDates(
    'Ratification: October 3, 2026.\nInspection: twenty-two (22) days after ratification.\nAppraisal: one hundred twenty-one days after ratification.\nFinancing: 1000 days after ratification.\nDeposit: 1.5 days after ratification.\nOther term: 1,000 days after ratification.',
  );
  assert.deepEqual(
    result.candidates.filter(item => item.basis === 'computed').map(item => item.date),
    ['2026-10-25'],
  );
  assert.equal(result.issues.filter(item => item.code === 'unsupported-period').length, 2);
  const repeatedWords = analyzeContractDates(
    'Ratification: October 3, 2026.\nInspection: ' + 'one '.repeat(30000) + 'days after ratification.',
  );
  assert.equal(repeatedWords.candidates.filter(item => item.basis === 'computed').length, 0);
  assert.ok(repeatedWords.issues.some(item => item.code === 'unsupported-period'));
});

test('evidence offsets refer to the exact date or relative phrase in normalized page text', () => {
  const normalized = 'Ratification: October 3, 2026.\nInspection: 10 days after ratification.';
  const result = analyzeContractDates([{ page: 4, text: normalized.replaceAll(' ', '  ').replace('\n', '\r\n') }]);
  for (const candidate of result.candidates) {
    const evidence = candidate.evidence!;
    assert.equal(evidence.page, 4);
    assert.equal(evidence.offsetBasis, 'normalized-page-text');
    assert.equal(normalized.slice(evidence.start, evidence.end), evidence.quote);
  }
  assert.equal(result.candidates[1].anchor?.evidence.quote, 'October 3, 2026');
  assert.equal(result.candidates[1].evidence?.quote, '10 days after ratification');
});

test('partial text and bounded analyses withhold relative calculations instead of trusting an incomplete anchor set', () => {
  for (const result of [
    analyzeContractDates(contract, { complete: false }),
    analyzeContractDates(contract + ' '.repeat(MAX_CONTRACT_TEXT_CHARS)),
    analyzeContractDates(Array.from({ length: 101 }, (_, index) => ({ page: index + 1, text: index ? '' : contract }))),
    analyzeContractDates(
      'Ratification: October 3, 2026.\n' +
        'Inspection: October 4, 2026.\n'.repeat(100) +
        'Inspection 5 days after ratification.',
    ),
  ]) {
    assert.ok(result.issues.some(item => item.code === 'analysis-limit'));
    assert.equal(result.candidates.filter(item => item.basis === 'computed').length, 0);
    assert.ok(result.candidates.length <= 100);
  }
});

test('PDF page evidence and private original bytes survive upload; unreadable files expose their limitation', async () => {
  const { user } = await account();
  const pdf = makePdf(['Ratification: October 3, 2026.'], [['Inspection: 10 calendar days after ratification.']]);
  const { result: document } = await uploadDocument(user, 'transaction-02', {
    name: 'two-page.pdf',
    type: 'application/pdf',
    bytes: pdf,
  });
  assert.equal(document.textExtraction?.status, 'complete');
  assert.equal(document.textExtraction?.totalPages, 2);
  const computed = document.extractedDates.find(item => item.basis === 'computed')!;
  assert.equal(computed.evidence?.page, 2);
  assert.equal(computed.anchor?.evidence.page, 1);
  assert.equal(computed.date, '2026-10-13');
  assert.deepEqual(await readDocument(user.tenantId, document.id), pdf);
  const unreadable = await uploadDocument(user, 'transaction-02', {
    name: 'unreadable.pdf',
    type: 'application/pdf',
    bytes: Buffer.from('%PDF-1.4\nnot a valid document'),
  });
  assert.equal(unreadable.result.textExtraction?.status, 'unreadable');
  assert.equal(unreadable.result.extractedDates.length, 0);
  assert.ok(unreadable.result.textExtraction?.warnings.some(warning => warning.includes('original file is preserved')));
  const truncated = await readDocumentText({
    name: 'long.txt',
    bytes: Buffer.from('x'.repeat(MAX_CONTRACT_TEXT_CHARS + 1)),
  });
  assert.equal(truncated.metadata.status, 'partial');
  assert.equal(truncated.pages[0].text.length, MAX_CONTRACT_TEXT_CHARS);
  assert.equal((await readDocumentText({ name: 'empty.pdf', bytes: makePdf([]) })).metadata.status, 'no-text');
});

const account = () =>
  register({
    seed: 'demo',
    name: 'Deadline reviewer',
    email: `${randomUUID()}@example.test`,
    password: 'private deadline review passphrase 123',
  });

test('mixed readable and textless PDF pages withhold relative dates instead of assuming missing pages are irrelevant', async () => {
  const { user } = await account();
  const pdf = makePdf(['Ratification: October 3, 2026.', 'Inspection: 10 days after ratification.'], [[]]);
  const { result: document } = await uploadDocument(user, 'transaction-02', {
    name: 'mixed-pages.pdf',
    type: 'application/pdf',
    bytes: pdf,
  });
  assert.equal(document.textExtraction?.status, 'partial');
  assert.ok(document.textExtraction?.warnings.some(warning => /Pages without readable text: 2/.test(warning)));
  assert.ok(document.extractedDates.some(item => item.basis === 'stated'));
  assert.equal(document.extractedDates.filter(item => item.basis === 'computed').length, 0);
  assert.ok(document.dateAnalysis?.issues.some(issue => issue.code === 'analysis-limit'));
});

async function restrictTransaction(user: Actor, transactionId: string) {
  await mutateWorkspace(user, workspace => {
    const property = {
      ...workspace.properties[0],
      id: `restricted-${randomUUID()}`,
      sourceId: 'restricted-contract-source',
    };
    workspace.sources.push({
      id: property.sourceId,
      label: 'Restricted synthetic test source',
      kind: 'licensed',
      observedAt: workspace.asOf,
      license: 'No entitlement',
      confidence: 0,
    });
    workspace.properties.push(property);
    workspace.transactions.find(transaction => transaction.id === transactionId)!.propertyId = property.id;
  });
}

test('upload rejects viewers, foreign transactions and unavailable source contexts before decoding', async () => {
  const { user } = await account(),
    foreign = await account();
  const foreignTransaction = await executeAction(foreign.user, {
    type: 'saveTransaction',
    propertyId: 'property-01',
    clientId: 'client-01',
  });
  const foreignId = foreignTransaction.workspace.transactions[0].id;
  const file = { name: 'private.txt', type: 'text/plain', bytes: Buffer.from('Inspection: October 20, 2026.') };
  let reads = 0;
  const reader: typeof readDocumentText = async file => {
    reads++;
    return readDocumentText(file);
  };
  await assert.rejects(uploadDocument({ ...user, role: 'viewer' }, 'transaction-02', file, reader), { status: 403 });
  await assert.rejects(uploadDocument(user, foreignId, file, reader), { status: 404 });
  await restrictTransaction(user, 'transaction-02');
  await assert.rejects(uploadDocument(user, 'transaction-02', file, reader), { status: 403 });
  assert.equal(reads, 0);
  assert.equal((await getWorkspace(user.tenantId)).documents.length, 0);
});

test('permission changes during text extraction prevent storage at the final authorization check', async () => {
  const { user } = await account();
  let reads = 0;
  const reader: typeof readDocumentText = async file => {
    reads++;
    await restrictTransaction(user, 'transaction-02');
    return readDocumentText(file);
  };
  await assert.rejects(
    uploadDocument(
      user,
      'transaction-02',
      { name: 'race.txt', type: 'text/plain', bytes: Buffer.from(contract) },
      reader,
    ),
    { status: 403 },
  );
  assert.equal(reads, 1);
  assert.equal((await getWorkspace(user.tenantId)).documents.length, 0);
});

test('computed proposals require acknowledged review; corrections preserve original evidence, reviewer and audit history', async () => {
  const { user } = await account();
  const { result: document } = await uploadDocument(user, 'transaction-02', {
    name: 'review.txt',
    type: 'text/plain',
    bytes: Buffer.from(
      'Ratification: October 3, 2026.\nPRIVATE CONTRACT DETAIL\nInspection: 10 days after ratification.',
    ),
  });
  const index = document.extractedDates.findIndex(item => item.basis === 'computed');
  const action = {
    type: 'approveExtractedDate',
    documentId: document.id,
    index,
    title: 'Reviewed inspection deadline',
  };
  await assert.rejects(executeAction(user, action), { status: 422 });
  await assert.rejects(executeAction(user, { ...action, assumptionsReviewed: true, reviewedDate: '2026-10-14' }), {
    status: 422,
  });
  await assert.rejects(
    executeAction(user, { ...action, assumptionsReviewed: true, reviewedDate: '2026-02-30', reviewNote: 'Invalid' }),
  );
  const before = await getWorkspace(user.tenantId);
  assert.equal(before.documents[0].extractedDates[index].approved, false);
  const corrected = await executeAction(user, {
    ...action,
    assumptionsReviewed: true,
    reviewedDate: '2026-10-14',
    reviewNote: 'PRIVATE REVIEW NOTE: signed extension checked.',
  });
  const saved = corrected.workspace.documents[0].extractedDates[index];
  assert.equal(saved.date, '2026-10-13');
  assert.equal(saved.approvedDate, '2026-10-14');
  assert.equal(saved.approvedBy, user.id);
  assert.ok(saved.approvedAt);
  assert.equal(saved.evidence?.quote, '10 days after ratification');
  const milestone = corrected.workspace.transactions
    .find(item => item.id === 'transaction-02')!
    .milestones.find(item => item.id === saved.milestoneId)!;
  assert.equal(milestone.dueAt, '2026-10-14');
  assert.equal(milestone.dateEvidence?.proposedDate, '2026-10-13');
  assert.equal(milestone.sourceId, document.id);
  assert.ok(!JSON.stringify(milestone).includes('PRIVATE'));
  const audit = corrected.workspace.audit.at(-1)!;
  assert.equal(audit.action, 'approveExtractedDate');
  assert.equal(JSON.parse(audit.details).corrected, true);
  assert.ok(!JSON.stringify(corrected.workspace.audit).includes('PRIVATE'));
  assert.ok(verifyAudit(corrected.workspace));
  await assert.rejects(executeAction(user, { ...action, assumptionsReviewed: true }), { status: 409 });
  const restored = await getWorkspace(user.tenantId);
  assert.equal(restored.documents[0].extractedDates[index].milestoneId, milestone.id);
});

test('date approval is tenant-scoped, read-only for viewers and blocked after source access is lost', async () => {
  const { user } = await account(),
    foreign = await account();
  const { result: document } = await uploadDocument(user, 'transaction-02', {
    name: 'stated.txt',
    type: 'text/plain',
    bytes: Buffer.from('Inspection: October 20, 2026.'),
  });
  const action = { type: 'approveExtractedDate', documentId: document.id, index: 0, title: 'Inspection' };
  await assert.rejects(executeAction(foreign.user, action), { status: 404 });
  await assert.rejects(executeAction({ ...user, role: 'viewer' }, action), { status: 403 });
  await restrictTransaction(user, 'transaction-02');
  await assert.rejects(executeAction(user, action), { status: 403 });
  assert.equal((await getWorkspace(user.tenantId)).documents[0].extractedDates[0].approved, false);
});
