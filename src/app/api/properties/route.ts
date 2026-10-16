import { z } from 'zod';
import { authorized, endpoint, json } from '@/lib/api';
import { getWorkspace, nearbyPropertyIds } from '@/lib/db';
import { scopeWorkspaceForAccess } from '@/lib/fabric';
export const runtime = 'nodejs';
const schema = z.object({ q: z.string().max(200).optional(), status: z.enum(['active', 'sold', 'pending', 'withdrawn']).optional(), maxPrice: z.coerce.number().min(0).max(1e9).optional(), lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(), radiusMiles: z.coerce.number().min(0.1).max(100).default(5) }).refine((value) => (value.lat === undefined) === (value.lng === undefined), 'Provide both latitude and longitude.');
function milesBetween(a: number, b: number, c: number, d: number) { const radians = Math.PI / 180; const x = Math.sin((c - a) * radians / 2) ** 2 + Math.cos(a * radians) * Math.cos(c * radians) * Math.sin((d - b) * radians / 2) ** 2; return 3958.7613 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
export async function GET(request: Request) { return endpoint(async () => {
  const actor = await authorized(request); const query = schema.parse(Object.fromEntries(new URL(request.url).searchParams)); const workspace = scopeWorkspaceForAccess(await getWorkspace(actor.tenantId));
  const nearby = query.lat !== undefined && query.lng !== undefined ? await nearbyPropertyIds(actor.tenantId, query.lat, query.lng, query.radiusMiles) : null;
  const properties = workspace.properties.filter((property) => (!query.q || `${property.address} ${property.city} ${property.zip}`.toLowerCase().includes(query.q.toLowerCase())) && (!query.status || property.status === query.status) && (query.maxPrice === undefined || property.price <= query.maxPrice) && (query.lat === undefined || query.lng === undefined || (nearby ? nearby.includes(property.id) : milesBetween(query.lat, query.lng, property.lat, property.lng) <= query.radiusMiles)));
  return json({ properties, mode: workspace.mode, asOf: workspace.asOf, spatialEngine: process.env.DATABASE_URL ? 'PostGIS' : 'haversine', sources: workspace.sources.filter((source) => properties.some((property) => property.sourceId === source.id)) });
}); }
