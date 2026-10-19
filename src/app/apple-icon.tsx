import { ImageResponse } from 'next/og';

/** Home-screen icon: the Ascent peak on a full-bleed square, which iOS rounds itself. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#213f33',
      }}
    >
      <svg width="96" height="106" viewBox="0 0 29 32">
        <path d="M14.5 0 29 32h-8.7L14.5 17.9 8.4 32H0z" fill="#f7f8f3" />
      </svg>
    </div>,
    size,
  );
}
