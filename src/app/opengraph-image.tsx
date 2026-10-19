import { ImageResponse } from 'next/og';

/** Link preview for shared Ascent pages. */
export const alt = 'Ascent: real estate intelligence for homeowners. See the recorded sales behind a home price.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#f7f8f3',
        color: '#243d34',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 44, fontWeight: 600 }}>
        <svg width="44" height="48" viewBox="0 0 29 32">
          <path d="M14.5 0 29 32h-8.7L14.5 17.9 8.4 32H0z" fill="#243d34" />
        </svg>
        ascent.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ fontSize: 76, lineHeight: 1.08, letterSpacing: -2, fontWeight: 600, maxWidth: 980 }}>
          Real estate intelligence belongs to homeowners.
        </div>
        <div style={{ fontSize: 32, lineHeight: 1.4, color: '#3e5448', maxWidth: 960 }}>
          Look up a covered DC or Maryland home and see the recorded sales behind its price.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 24, color: '#596750' }}>
        Free · no account · public records with published accuracy, including misses
      </div>
    </div>,
    size,
  );
}
