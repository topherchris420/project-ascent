/**
 * Word index over normalized address keys, shared by the public-record searches. It keeps their matching rule:
 * every typed word must equal a word of the address, except the last, which may be the start of one. Looking words
 * up instead of re-splitting every address keeps a keystroke fast on Maryland's 462,000 homes.
 */
export type AddressEntry = { key: string; parcelId: string };

const collator = new Intl.Collator('en', { numeric: true });
/** Same order as `a.localeCompare(b, 'en', { numeric: true })`, without building a collator per comparison. */
export const compareAddressKeys = (a: string, b: string) => collator.compare(a, b);

export class AddressIndex {
  private readonly postings = new Map<string, number[]>();
  private readonly vocabulary: string[];

  constructor(readonly entries: readonly AddressEntry[]) {
    entries.forEach((entry, position) => {
      for (const word of entry.key.split(' ')) {
        const list = this.postings.get(word);
        if (!list) this.postings.set(word, [position]);
        else if (list[list.length - 1] !== position) list.push(position);
      }
    });
    this.vocabulary = [...this.postings.keys()].sort();
  }

  /** Positions of matching entries, in index order. */
  matches(terms: string[]): number[] {
    const last = terms[terms.length - 1];
    const whole = [...new Set(terms.slice(0, -1))].map(term => this.postings.get(term) ?? []);
    if (whole.length) {
      const [smallest, ...rest] = whole.sort((a, b) => a.length - b.length);
      const shared = rest.reduce(intersect, smallest);
      return shared.filter(position => this.entries[position].key.split(' ').some(word => word.startsWith(last)));
    }
    const marked = new Uint8Array(this.entries.length);
    for (let i = lowerBound(this.vocabulary, last); i < this.vocabulary.length; i++) {
      if (!this.vocabulary[i].startsWith(last)) break;
      for (const position of this.postings.get(this.vocabulary[i])!) marked[position] = 1;
    }
    const found: number[] = [];
    marked.forEach((flag, position) => flag && found.push(position));
    return found;
  }
}

/** Builds the index on first search, so loading records to price a linked home does not pay for it. */
export function lazyAddressIndex(entries: () => AddressEntry[]) {
  let built: AddressIndex | undefined;
  return () => (built ??= new AddressIndex(entries()));
}

/** The first `limit` items under `compare`, keeping index order among ties exactly as a stable sort would. */
export function firstByOrder<T>(items: Iterable<T>, limit: number, compare: (a: T, b: T) => number): T[] {
  const best: T[] = [];
  if (limit <= 0) return best;
  for (const item of items) {
    if (best.length === limit && compare(item, best[best.length - 1]) >= 0) continue;
    let at = best.length;
    while (at > 0 && compare(item, best[at - 1]) < 0) at--;
    best.splice(at, 0, item);
    if (best.length > limit) best.pop();
  }
  return best;
}

function intersect(a: number[], b: number[]): number[] {
  const shared: number[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;)
    if (a[i] === b[j]) {
      shared.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  return shared;
}

function lowerBound(sorted: string[], value: string) {
  let low = 0,
    high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}
