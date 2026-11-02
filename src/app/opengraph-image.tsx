import { ImageResponse } from 'next/og';

/** Link preview for shared Ascent pages, in the landing page's palette and wordmark. */
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
        background: '#faf9f6',
        color: '#1a1714',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 52, fontWeight: 500, letterSpacing: -2, lineHeight: 1 }}>ascent</div>
        <div style={{ marginTop: 4, fontSize: 18, letterSpacing: 1, color: '#3f3a35' }}>DC·MD</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 24, color: '#6f6861' }}>
          <div style={{ width: 48, height: 2, background: '#6f6861' }} />
          Real estate intelligence for everyone
        </div>
        <div
          style={{ display: 'flex', fontSize: 84, lineHeight: 1, letterSpacing: -4, fontWeight: 400, maxWidth: 1000 }}
        >
          Real estate intelligence belongs to homeowners.
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.4, color: '#5f5952', maxWidth: 960 }}>
          Look up a covered DC or Maryland home and see the recorded sales behind its price.
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          paddingTop: 28,
          borderTop: '2px solid #e4e0d9',
          fontSize: 24,
          color: '#5f5952',
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#3f9a63' }} />
        Free · no account · public records with published accuracy, including misses
      </div>
    </div>,
    size,
  );
}
