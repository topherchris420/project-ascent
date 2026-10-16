import type { Workspace } from './types';

const DAY = 86400000;
export type AgendaItem = {
  id: string;
  kind: 'milestone' | 'follow-up' | 'offer-expiry' | 'check-in';
  title: string;
  detail: string;
  dueAt: string;
  daysLeft: number;
  urgency: 'overdue' | 'urgent' | 'soon' | 'later';
  target: { page: 'transactions' | 'clients' | 'offers' | 'market'; id: string; propertyId?: string };
};

/** Whole calendar days from `now` to `due`, compared by UTC date so a same-day deadline is 0. */
export function daysUntil(due: string, now: string): number {
  const day = (value: string) => Math.floor(Date.parse(value) / DAY);
  return day(due) - day(now);
}

export function urgencyOf(daysLeft: number): AgendaItem['urgency'] {
  return daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'urgent' : daysLeft <= 7 ? 'soon' : 'later';
}

export function countdownLabel(daysLeft: number): string {
  if (daysLeft < -1) return `${-daysLeft} days overdue`;
  if (daysLeft === -1) return '1 day overdue';
  if (daysLeft === 0) return 'Due today';
  if (daysLeft === 1) return 'Due tomorrow';
  return `${daysLeft} days left`;
}

/** Everything with a date in the next `horizonDays`, plus anything overdue, across the workspace. */
export function buildAgenda(workspace: Workspace, now: string, horizonDays = 7): AgendaItem[] {
  const items: AgendaItem[] = [];
  const address = (id: string) => workspace.properties.find(property => property.id === id)?.address ?? 'Property';
  const push = (item: Omit<AgendaItem, 'daysLeft' | 'urgency'>) => {
    const daysLeft = daysUntil(item.dueAt, now);
    if (daysLeft <= horizonDays) items.push({ ...item, daysLeft, urgency: urgencyOf(daysLeft) });
  };
  for (const transaction of workspace.transactions)
    for (const milestone of transaction.milestones)
      if (milestone.status === 'pending')
        push({
          id: `milestone:${milestone.id}`,
          kind: 'milestone',
          title: milestone.title,
          detail: address(transaction.propertyId),
          dueAt: milestone.dueAt,
          target: { page: 'transactions', id: transaction.id, propertyId: transaction.propertyId },
        });
  for (const client of workspace.clients)
    for (const task of client.followUps ?? [])
      if (task.status === 'pending')
        push({
          id: `follow-up:${task.id}`,
          kind: 'follow-up',
          title: task.title,
          detail: client.name,
          dueAt: task.dueAt,
          target: { page: 'clients', id: client.id },
        });
  for (const offer of workspace.offers)
    if ((offer.status === 'received' || offer.status === 'counter-draft') && daysUntil(offer.expiresAt, now) >= 0)
      push({
        id: `offer:${offer.id}`,
        kind: 'offer-expiry',
        title: `${offer.buyer} offer expires`,
        detail: `${address(offer.propertyId)} · $${offer.price.toLocaleString('en-US')}`,
        dueAt: offer.expiresAt,
        target: { page: 'offers', id: offer.id, propertyId: offer.propertyId },
      });
  const latest = new Map<string, string>();
  for (const checkIn of workspace.listingCheckIns ?? [])
    if (!latest.has(checkIn.propertyId) || Date.parse(checkIn.weekOf) > Date.parse(latest.get(checkIn.propertyId)!))
      latest.set(checkIn.propertyId, checkIn.weekOf);
  for (const [propertyId, weekOf] of latest) {
    const property = workspace.properties.find(item => item.id === propertyId);
    if (property?.status !== 'active') continue;
    push({
      id: `check-in:${propertyId}`,
      kind: 'check-in',
      title: 'Weekly listing check-in',
      detail: property.address,
      dueAt: new Date(Date.parse(weekOf) + 7 * DAY).toISOString(),
      target: { page: 'market', id: propertyId, propertyId },
    });
  }
  return items.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.title.localeCompare(b.title));
}
