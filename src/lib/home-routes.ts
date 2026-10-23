/**
 * Which Homeowner OS addresses exist. Free of data imports, so the request proxy can load it without the studios'
 * snapshots or benchmarks.
 */
export const DC_PARCEL_PATTERN = /^[A-Za-z0-9_]{4,32}$/;
export const MD_PARCEL_PATTERN = /^\d{10,12}$/;
export const osMarkets = ['dc', 'dc-condos', 'maryland'] as const;
export type OsMarket = (typeof osMarkets)[number];

export function isHomeRoute(market: string, parcel: string): market is OsMarket {
  return (
    (osMarkets as readonly string[]).includes(market) &&
    (market === 'maryland' ? MD_PARCEL_PATTERN : DC_PARCEL_PATTERN).test(parcel)
  );
}
