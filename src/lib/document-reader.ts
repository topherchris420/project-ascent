import { MAX_CONTRACT_TEXT_CHARS, type ContractTextPage } from './contract-dates';
import type { DocumentRecord } from './types';

export type DocumentTextRead = { pages: ContractTextPage[]; metadata: NonNullable<DocumentRecord['textExtraction']> };
const MAX_PAGES = 100;

/** Local text extraction only. Output/page bounds are not a hard sandbox for a hostile PDF decoder. */
export async function readDocumentText(file: { name: string; bytes: Buffer }): Promise<DocumentTextRead> {
  if (file.name.toLowerCase().endsWith('.txt')) {
    const text = file.bytes.toString('utf8');
    const partial = text.length > MAX_CONTRACT_TEXT_CHARS;
    return {
      pages: [{ text: text.slice(0, MAX_CONTRACT_TEXT_CHARS) }],
      metadata: {
        status: partial ? 'partial' : text.trim() ? 'complete' : 'no-text',
        pagesRead: 1,
        warnings: partial
          ? [
              'Only the first 250,000 characters were read. Review the complete source before calculating relative deadlines.',
            ]
          : [],
      },
    };
  }
  const pages: ContractTextPage[] = [],
    warnings: string[] = [],
    textlessPages: number[] = [];
  let totalPages: number | undefined;
  let destroy: (() => Promise<void>) | undefined;
  try {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(file.bytes), {
      disableAutoFetch: true,
      useWorkerFetch: false,
      disableFontFace: true,
      useSystemFonts: false,
      enableXfa: false,
      stopAtErrors: true,
      maxImageSize: 0,
    });
    destroy = () => pdf.loadingTask.destroy();
    totalPages = pdf.numPages;
    let remaining = MAX_CONTRACT_TEXT_CHARS;
    for (let index = 1; index <= Math.min(pdf.numPages, MAX_PAGES) && remaining > 0; index++) {
      const page = await pdf.getPage(index);
      try {
        const content = await page.getTextContent();
        let text = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const next = item.str + (item.hasEOL ? '\n' : ' ');
          text += next.slice(0, remaining);
          remaining -= Math.min(next.length, remaining);
          if (!remaining) {
            warnings.push('The 250,000-character extraction limit was reached.');
            break;
          }
        }
        pages.push({ page: index, text });
        if (!text.trim()) textlessPages.push(index);
      } finally {
        page.cleanup();
      }
    }
    if (totalPages > MAX_PAGES) warnings.push('Only the first 100 pages were read.');
    const hasText = pages.some(page => page.text.trim());
    if (hasText && textlessPages.length)
      warnings.push(
        `Pages without readable text: ${textlessPages.join(', ')}. They may be blank or scanned; relative calculations are withheld until the complete contract is reviewed.`,
      );
    if (!hasText)
      warnings.push(
        'No machine-readable text was found. The file may be scanned or lack usable text; OCR is not connected.',
      );
    return {
      pages,
      metadata: {
        status:
          warnings.some(warning => /limit|first 100/.test(warning)) || (hasText && textlessPages.length > 0)
            ? 'partial'
            : hasText
              ? 'complete'
              : 'no-text',
        pagesRead: pages.length,
        totalPages,
        warnings,
      },
    };
  } catch {
    return {
      pages,
      metadata: {
        status: pages.length ? 'partial' : 'unreadable',
        pagesRead: pages.length,
        totalPages,
        warnings: [
          ...warnings,
          'Text extraction could not finish. The original file is preserved; check it manually. No missing text or deadlines were invented.',
        ],
      },
    };
  } finally {
    try {
      await destroy?.();
    } catch {
      /* Decoder cleanup must not discard the original private upload. */
    }
  }
}
