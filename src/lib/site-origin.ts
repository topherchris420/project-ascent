/** Public origin for absolute URLs in the sitemap, robots file and link previews. */
export function siteOrigin() {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const configured = process.env.APP_ORIGIN || (production ? `https://${production}` : '');
  return configured ? new URL(configured).origin : 'http://localhost:3040';
}

/** Account-free public pages, in the order a homeowner meets them. */
export const PUBLIC_PAGES = [
  '/',
  '/dc',
  '/maryland',
  '/dc/condos',
  '/sales',
  '/programs',
  '/demo',
  '/home',
  '/accuracy',
  '/free',
] as const;
