/**
 * Draw the study's subject homes at random from every District single-family parcel, so nobody picks homes that
 * happen to suit one product.
 *   npx tsx scripts/study/draw-subjects.ts --seed 20261017 --count 3
 * Record the seed in the pre-registration before running. A drawn home that a product cannot price is scored as
 * "unsupported" for that product; it is never swapped for an easier one.
 */
import { dcData, dcValuationInputs } from '../../src/lib/providers/dc-public-records';
import { distanceMiles } from '../../src/lib/analytics';
import { STUDY_PROTOCOL_ID } from '../../src/lib/study-analysis';

const args = process.argv.slice(2);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const seed = Number(option('--seed'));
const count = Number(option('--count') ?? 3);
if (!Number.isInteger(seed) || seed <= 0)
  throw new Error('Pass a positive integer --seed recorded in the pre-registration.');
let state = seed >>> 0;
const random = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
const parcels = [...dcData().parcels.values()].sort((a, b) => a.parcelId.localeCompare(b.parcelId));
const drawn = new Set<number>();
while (drawn.size < Math.min(count, parcels.length)) drawn.add(Math.floor(random() * parcels.length));
console.log(
  JSON.stringify(
    {
      protocol: STUDY_PROTOCOL_ID,
      seed,
      population: `${parcels.length} District single-family parcels (dc-residential-properties snapshot)`,
      subjects: [...drawn].map((index, i) => {
        const parcel = parcels[index];
        // T6's new sale: the subject's size at 8% above the median $/sq ft of the five nearest recorded sales in the
        // prior 180 days, 0.2 miles away, dated the snapshot day. Hypothetical and labeled as such.
        const inputs = dcValuationInputs(parcel.parcelId)!;
        const asOf = Date.parse(inputs.asOf);
        const recent = inputs.candidates
          .filter(sale => asOf - Date.parse(sale.soldAt!) <= 180 * 86400000)
          .sort((x, y) => distanceMiles(inputs.subject, x) - distanceMiles(inputs.subject, y))
          .slice(0, 5)
          .map(sale => sale.soldPrice! / sale.sqft)
          .sort((x, y) => x - y);
        const median = recent.length ? recent[Math.floor(recent.length / 2)] : null;
        return {
          label: `Subject ${String.fromCharCode(65 + i)}`,
          address: parcel.address,
          zip: parcel.zip,
          parcelId: parcel.parcelId,
          beds: parcel.beds,
          baths: parcel.baths,
          sqft: parcel.sqft,
          t6NewSale: median
            ? {
                note: 'Hypothetical sale for task T6; not a real record.',
                address: 'Hypothetical sale on the same block',
                soldOn: inputs.asOf.slice(0, 10),
                price: Math.round((median * parcel.sqft * 1.08) / 1000) * 1000,
                beds: parcel.beds,
                baths: parcel.baths,
                sqft: parcel.sqft,
                distanceMiles: 0.2,
              }
            : null,
        };
      }),
    },
    null,
    2,
  ),
);
