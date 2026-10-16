import type { Property } from './types';

export type DescriptionTone = 'warm' | 'concise' | 'refined';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const baths = (count: number) => `${count % 1 ? count.toFixed(1) : count} bath${count === 1 ? '' : 's'}`;

/**
 * Drafts listing copy from recorded facts and the professional's own highlights. It describes the property, never who
 * should live there, and the result still goes through the fair-housing check before use.
 */
export function composeListingDescription(
  property: Pick<Property, 'address' | 'city' | 'state' | 'beds' | 'baths' | 'sqft' | 'lotSqft' | 'yearBuilt'>,
  highlights: string[],
  tone: DescriptionTone = 'warm',
): string {
  const features = highlights
    .map(item => item.trim().replace(/[.;]+$/, ''))
    .filter(Boolean)
    .slice(0, 6);
  const size = `${plural(property.beds, 'bedroom')}, ${baths(property.baths)} and ${property.sqft.toLocaleString('en-US')} square feet`;
  const lot = property.lotSqft ? ` on a ${property.lotSqft.toLocaleString('en-US')} sq ft lot` : '';
  const built = property.yearBuilt ? `Built in ${property.yearBuilt}, ` : '';
  const list = (items: string[]) =>
    items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
  if (tone === 'concise')
    return [
      `${property.address}, ${property.city}: ${size}${lot}.`,
      features.length ? `Highlights: ${list(features.map(item => item.toLowerCase()))}.` : '',
      'Schedule a showing to see it in person.',
    ]
      .filter(Boolean)
      .join(' ');
  if (tone === 'refined')
    return [
      `Presenting ${property.address} in ${property.city}, ${property.state}.`,
      `${built}this residence offers ${size}${lot}.`,
      features.length ? `Distinguishing details include ${list(features.map(item => item.toLowerCase()))}.` : '',
      'Private showings are available by appointment.',
    ]
      .filter(Boolean)
      .join(' ');
  return [
    `Welcome to ${property.address}, a ${property.beds}-bedroom home in ${property.city}.`,
    `${built}it offers ${size}${lot}.`,
    features.length ? `You'll notice ${list(features.map(item => item.toLowerCase()))}.` : '',
    'Come see it in person and picture your next chapter here.',
  ]
    .filter(Boolean)
    .join(' ');
}
