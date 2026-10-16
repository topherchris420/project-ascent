import { z } from 'zod';
import { authorized, endpoint, json, readJson } from '@/lib/api';
import { changeMember, inviteMember, listTeam } from '@/lib/platform';
export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [z.object({ action: z.literal('invite'), email: z.email(), role: z.enum(['agent', 'viewer']) }), z.object({ action: z.literal('setRole'), userId: z.string().min(1).max(100), role: z.enum(['agent', 'viewer']) }), z.object({ action: z.literal('remove'), userId: z.string().min(1).max(100) })]);
const snapshot = async (actor: Parameters<typeof listTeam>[0]) => { const team = await listTeam(actor); return { members: team.members, invites: team.invitations, seatLimit: team.entitlements.seats, entitlements: team.entitlements }; };
export async function GET(request: Request) { return endpoint(async () => json(await snapshot(await authorized(request)))); }
export async function POST(request: Request) { return endpoint(async () => {
  const actor = await authorized(request, true); const input = await readJson(request, schema);
  if (input.action === 'invite') { const invitation = await inviteMember(actor, input); return json({ ...await snapshot(actor), ...invitation, inviteUrl: invitation.acceptanceUrl }); }
  await changeMember(actor, input.userId, input.action === 'remove' ? 'remove' : input.role); return json(await snapshot(actor));
}); }
