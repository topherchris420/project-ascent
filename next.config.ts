import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['pg', 'node:sqlite', 'unpdf'],
  // The DC public-record routes read bundled CC BY snapshots at runtime.
  outputFileTracingIncludes: {
    '/api/dc/*': ['./src/datasets/dc/**/*'],
    '/api/dc-condos/*': ['./src/datasets/dc-condos/**/*'],
    '/api/maryland/*': ['./src/datasets/maryland/**/*'],
  },
  outputFileTracingExcludes: {
    '/*': ['./.data/**/*', './evidence/**/*', './tests/**/*', './test-results/**/*', './playwright-report/**/*'],
  },
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
      {
        source: '/account/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};
export default config;
