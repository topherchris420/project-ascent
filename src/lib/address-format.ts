/** District records are upper case; show them as people write addresses, keeping quadrants upper case. */
export const displayDcAddress = (address: string) =>
  address
    .toLowerCase()
    .replace(/\b([a-z])/g, c => c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, q => q.toUpperCase());
