import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-origin';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/account/'] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
