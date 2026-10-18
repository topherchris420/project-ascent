/** Shared sale arithmetic. Percentages are negotiable assumptions, never prescribed fees. */
export function saleNetBeforePayoff(
  price: number,
  costs: { commissionPercent: number; closingPercent: number; concessions: number },
) {
  const values = [price, costs.commissionPercent, costs.closingPercent, costs.concessions];
  if (values.some(value => !Number.isFinite(value) || value < 0))
    throw new Error('Sale inputs must be finite and nonnegative.');
  if (costs.commissionPercent + costs.closingPercent > 100)
    throw new Error('Combined percentage costs cannot exceed 100%.');
  return price * (1 - (costs.commissionPercent + costs.closingPercent) / 100) - costs.concessions;
}
