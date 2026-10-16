import { authorized, endpoint, json } from '@/lib/api';
import { getWorkspace } from '@/lib/db';
import { HttpError } from '@/lib/auth';
import { portableCsv, portableExport } from '@/lib/migration';
export const runtime = 'nodejs';
export async function GET(request: Request) { return endpoint(async () => { const actor = await authorized(request); const format = new URL(request.url).searchParams.get('format') || 'json'; const workspace = await getWorkspace(actor.tenantId); if (format === 'json') return json(portableExport(workspace)); if (format !== 'csv') throw new HttpError(400, 'Choose JSON or contacts CSV.'); return new Response(portableCsv(workspace), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ascent-contacts.csv"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }); }); }
