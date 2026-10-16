import type { CmaRecord, ValuationProperty } from '../types';

export type NarrativeSection = { text: string; citationIds: string[] };
export type GroundingIssue = 'comparable-count' | 'valuation-method' | 'property-area';
const countWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const normalize = (text: string) => text.normalize('NFKC').replace(/[\u2010-\u2015]/g, '-').toLowerCase();
const number = (text: string) => Number(text.replaceAll(',', ''));

/** Bounded checks for known factual regressions. This is not general semantic entailment. */
export function checkNarrativeFacts(sections: NarrativeSection[], cmas: CmaRecord[], properties: ValuationProperty[]): GroundingIssue | undefined {
  for (const section of sections) {
    const text = normalize(section.text);
    const directCmas = cmas.filter(cma => section.citationIds.includes(cma.id));
    const compLinks = cmas.map(cma => ({ cma, matches: cma.result.comps.filter(comp => section.citationIds.includes(comp.propertyId)).length }));
    const mostMatches = Math.max(0, ...compLinks.map(link => link.matches));
    const linkedCmas = directCmas.length ? directCmas : compLinks.filter(link => link.matches > 0 && link.matches === mostMatches).map(link => link.cma);
    if (linkedCmas.length === 1) {
      const cma = linkedCmas[0];
      const count = /\b(?:the|these|all|using|uses|contains|includes|from|based on)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:(?:selected|eligible|recent|closed)\s+){0,2}comparables?\b/g;
      for (const match of text.matchAll(count)) {
        const prefix = text.slice(0, match.index).split(/[.!?;\n]/).at(-1) || '';
        if (/\b(?:if|assuming|hypothetical|recommend|minimum|at least|fewer than|more than)\b/.test(prefix)) continue;
        if ((countWords[match[1]] ?? Number(match[1])) !== cma.result.comps.length) return 'comparable-count';
      }
      for (const match of text.matchAll(/\bmedian\b[^.!?;\n]{0,45}?\$\s*(\d[\d,]*(?:\.\d+)?)/g)) {
        const prefix = text.slice(Math.max(0, match.index - 35), match.index);
        if (/\b(?:not|rather than|instead of|unadjusted|baseline)\b/.test(prefix)) continue;
        if (number(match[1]) === cma.result.estimate) return 'valuation-method';
      }
    }
    const candidates = new Map(properties.map(property => [property.id, property]));
    cmas.forEach(cma => { if (cma.result.inputSnapshot) { candidates.set(cma.result.inputSnapshot.subject.id, cma.result.inputSnapshot.subject); cma.result.inputSnapshot.candidates.forEach(property => candidates.set(property.id, property)); } });
    const linkedProperties = [...candidates.values()].filter(property => section.citationIds.includes(property.id));
    // Do not guess which property's measurement a multi-property comparison describes.
    if (linkedProperties.length === 1) {
      const property = linkedProperties[0];
      const areaText = text.replaceAll('-', ' ');
      const areas: [RegExp, number | undefined][] = [
        [/\blot\s+(?:size\s*|area\s*)?(?:(?:of|is)\s*)?[:=]?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:sq\s*(?:ft|feet)|square\s*(?:feet|foot))\b/g, property.lotSqft],
        [/\b(\d[\d,]*(?:\.\d+)?)\s*(?:sq\s*(?:ft|feet)|square\s*(?:feet|foot))\s+lot\b/g, property.lotSqft],
        [/\b(?:interior|living|floor)\s+(?:area\s*)?(?:(?:of|is)\s*)?[:=]?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:sq\s*(?:ft|feet)|square\s*(?:feet|foot))\b/g, property.sqft],
      ];
      for (const [pattern, expected] of areas) for (const match of areaText.matchAll(pattern)) if (expected === undefined || number(match[1]) !== expected) return 'property-area';
    }
  }
}
