import type { Property, SavedSearch } from './types';

/** Objective, explicit filters over caller-authorized inventory. No demographic inference or model call. */
export function evaluateSavedSearch(search: SavedSearch, properties: Property[]) {
  return properties.map(property => {
    const failed: string[] = [],
      missing: string[] = [],
      reasons: string[] = [];
    const criteria = search.criteria || {},
      status = criteria.status || 'active';
    if (status !== 'all' && property.status !== status)
      failed.push(`Status is ${property.status}, requires ${status}.`);
    const text = `${property.address} ${property.city} ${property.state} ${property.zip}`
      .normalize('NFKC')
      .toLowerCase();
    if (
      search.query
        .trim()
        .normalize('NFKC')
        .toLowerCase()
        .split(/\s+/)
        .some(token => !text.includes(token))
    )
      failed.push('Address, city, state or ZIP does not match the literal query.');
    if (criteria.state && property.state !== criteria.state) failed.push(`Outside selected state ${criteria.state}.`);
    if (criteria.zip && property.zip !== criteria.zip) failed.push(`Outside selected ZIP ${criteria.zip}.`);
    const amount = property.status === 'sold' ? property.soldPrice : property.price;
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) missing.push('Positive asking/recorded price');
    else if (amount > search.maxPrice)
      failed.push(`Price $${amount.toLocaleString('en-US')} exceeds $${search.maxPrice.toLocaleString('en-US')}.`);
    else reasons.push(`Price $${amount.toLocaleString('en-US')} is within the saved ceiling.`);
    for (const [field, value, minimum] of [
      ['bedrooms', property.beds, criteria.minBedrooms],
      ['bathrooms', property.baths, criteria.minBathrooms],
      ['living area (sqft)', property.sqft, criteria.minSqft],
    ] as const) {
      if (minimum === undefined) continue;
      if (value === undefined || !Number.isFinite(value)) missing.push(field);
      else if (value < minimum) failed.push(`${field}: ${value}; minimum ${minimum}.`);
      else reasons.push(`${field}: ${value}; satisfies minimum ${minimum}.`);
    }
    return {
      propertyId: property.id,
      matched: failed.length === 0 && missing.length === 0,
      needsEvidence: failed.length === 0 && missing.length > 0,
      reasons,
      failed,
      missing,
      sourceId: property.sourceId,
    };
  });
}
