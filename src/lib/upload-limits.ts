// Decimal bytes leave room for multipart overhead below Vercel's 4.5 MB request/response limit.
export const MAX_DOCUMENT_BYTES = 4_000_000;
export const MAX_MULTIPART_BYTES = MAX_DOCUMENT_BYTES + 64_000;
export const DOCUMENT_LIMIT_LABEL = '4 MB';

export function documentSizeError(size: number): string | undefined {
  return size <= 0 || size > MAX_DOCUMENT_BYTES
    ? `Upload a nonempty document of at most ${DOCUMENT_LIMIT_LABEL}.`
    : undefined;
}
