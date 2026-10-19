import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES, siteOrigin } from '@/lib/site-origin';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return PUBLIC_PAGES.map(path => ({
    url: `${origin}${path === '/' ? '' : path}`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }));
}
