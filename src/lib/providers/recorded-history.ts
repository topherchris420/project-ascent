/** Bounded qualified-transfer history from the already authorized snapshot, never a full title history. */
export function recordedHistory(
  parcelId: string,
  sales: readonly { saleId: string; parcelId: string; soldOn: string; price: number }[],
  asOf: string,
) {
  const seen = new Set<string>();
  return sales
    .filter(s => {
      if (
        s.parcelId !== parcelId ||
        seen.has(s.saleId) ||
        !Number.isFinite(s.price) ||
        s.price <= 0 ||
        !Number.isFinite(Date.parse(s.soldOn)) ||
        Date.parse(s.soldOn) > Date.parse(asOf)
      )
        return false;
      seen.add(s.saleId);
      return true;
    })
    .toSorted((a, b) => b.soldOn.localeCompare(a.soldOn) || a.saleId.localeCompare(b.saleId))
    .slice(0, 20)
    .map(s => ({ date: `${s.soldOn}T00:00:00.000Z`, event: 'Qualified recorded transfer', price: s.price }));
}
