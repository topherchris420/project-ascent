import { z } from 'zod';
import { analyzeOffer, offerLabSchema, offerScheduleIssues, type OfferLab } from './offer-lab';

export const MAX_OFFER_IMPORT_BYTES = 512_000;
const recordSchema = z.object({
  format: z.literal('ascent-offer-comparison-record-1'),
  property: z.object({ key: z.string().min(1).max(80), address: z.string().max(500) }),
  exportedAt: z.iso.datetime(),
  lab: offerLabSchema,
});

/** Read inputs only. Archived calculations and valuation claims are never trusted or restored. */
export function parseOfferImport(raw: string, propertyKey: string) {
  if (new TextEncoder().encode(raw).byteLength > MAX_OFFER_IMPORT_BYTES)
    throw new Error('Choose an Ascent offer export smaller than 512 KB.');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON. Choose an Ascent private offer export.');
  }
  const parsed = recordSchema.safeParse(data);
  if (!parsed.success)
    throw new Error('This offer export is incomplete, damaged or unsupported. Your comparison has not changed.');
  const record = parsed.data;
  if (record.property.key !== propertyKey || record.lab.propertyKey !== propertyKey)
    throw new Error('This export belongs to a different home. Open that home to restore its offers.');
  if (record.lab.referenceOfferId && !record.lab.offers.some(offer => offer.id === record.lab.referenceOfferId))
    throw new Error('This export refers to an offer it does not contain. Your comparison has not changed.');
  return { lab: record.lab, exportedAt: record.exportedAt };
}

// RFC 5545 sections 3.1 and 3.3.11: text escaping and 75-octet UTF-8 content lines.
const calendarText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
function foldLine(value: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let octets = 0;
  for (const char of value) {
    const size = encoder.encode(char).byteLength;
    if (octets + size > 75) {
      result += '\r\n ';
      octets = 1;
    }
    result += char;
    octets += size;
  }
  return result;
}

/** A download for ONE selected offer, never an invitation or an automatic calendar connection. */
export function offerCalendar(lab: OfferLab, offerId: string, exportedAt = new Date()): string {
  const checked = offerLabSchema.parse(lab);
  const offer = checked.offers.find(item => item.id === offerId);
  if (!offer) throw new Error('Choose an offer before downloading its dates.');
  const issues = offerScheduleIssues(offer, checked.settings);
  if (issues.length) throw new Error(`Resolve the conflicting dates before exporting: ${issues.join(' ')}`);
  const deadlines = analyzeOffer(offer, checked.settings).deadlines.filter(item => item.date !== null);
  if (!deadlines.length) throw new Error('Enter a date, or an acceptance date and a number of days, first.');
  const stamp = exportedAt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ascent//Offer date review//EN', 'CALSCALE:GREGORIAN'];
  for (const deadline of deadlines) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline.date!))
      throw new Error('A calculated date is outside the supported calendar range.');
    const description = [
      'Ascent offer-date review. Confirm the contract, time of day, time zone, holidays and day-count rules with your agent.',
      `Basis: ${offer.basis === 'what-if' ? 'what-if scenario' : 'terms entered from a written offer'}.`,
      `${deadline.basis === 'calculated' ? 'Calculated assumption' : 'Entered date'}: ${deadline.note}`,
      'Calendar days only. This all-day review marker is not a verified contractual deadline. No automatic updates or reminders are configured by Ascent.',
    ].join('\n');
    // Stable identity permits calendar clients to recognize repeats; no private price, payoff or notes in the file.
    const identity = `${encodeURIComponent(checked.propertyKey)}-${offer.id}-${deadline.key}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${identity}@ascent.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${deadline.date!.replace(/-/g, '')}`,
      'DURATION:P1D',
      `SUMMARY:${calendarText(`${offer.basis === 'what-if' ? 'What-if review' : 'Review'}: ${offer.label} — ${deadline.label}`)}`,
      `DESCRIPTION:${calendarText(description)}`,
      'CLASS:PRIVATE',
      'STATUS:TENTATIVE',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
