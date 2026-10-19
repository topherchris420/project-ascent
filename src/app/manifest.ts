import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ascent · Real estate intelligence for homeowners',
    short_name: 'Ascent',
    description:
      'Look up a covered DC or Maryland home, inspect the recorded sales behind its price and keep the reasoning.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f8f3',
    theme_color: '#f7f8f3',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
