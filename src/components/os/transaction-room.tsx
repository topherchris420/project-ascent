'use client';
import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { downloadJson } from '@/lib/browser-export';
import type { HomeDecisionBrief } from '@/lib/home-decision-brief';
import type { RoomSummary } from '@/lib/homeowner-os';
import type { OfferComparison } from '@/lib/offer-lab';
import type { RoomView } from '@/lib/rooms';
import { AccountGate, type AccountState } from './account';
import { newItemId, RoomViewer } from './room-view';
import { dateTime, OsPanel, requestJson } from './shared';

export type OwnedRoom = {
  room: RoomView | null;
  loading: boolean;
  error: string;
  setRoom: (room: RoomView | null) => void;
  open: () => Promise<void>;
};
/** The signed-in owner's room for this property, if one exists. Nothing is created until the owner asks. */
export function useOwnedRoom(account: AccountState, propertyKey: string, address: string): OwnedRoom {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!account.user) return setRoom(null);
    setLoading(true);
    setError('');
    try {
      const rooms = await requestJson<{ owned: { id: string; propertyKey: string }[] }>('/api/rooms');
      const mine = rooms.owned.find(item => item.propertyKey === propertyKey);
      setRoom(mine ? await requestJson<RoomView>(`/api/rooms/${mine.id}`) : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your Transaction Room could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [account.user, propertyKey]);
  useEffect(() => void load(), [load]);
  const open = async () => {
    setError('');
    try {
      const created = await requestJson<{ id: string }>('/api/rooms', {
        method: 'POST',
        json: { propertyKey, address },
      });
      setRoom(await requestJson<RoomView>(`/api/rooms/${created.id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The room could not be opened.');
    }
  };
  return { room, loading, error, setRoom, open };
}

export const roomSummary = (room: RoomView | null): RoomSummary | null =>
  room && room.access === 'owner'
    ? {
        stage: room.stage,
        milestones: room.milestones,
        tasks: room.tasks,
        deadlines: room.deadlines,
        inspection: room.inspection,
        financing: room.financing,
        settlement: room.settlement,
        documents: room.documents.map(({ id, name, section }) => ({ id, name, section })),
      }
    : null;

type AuditEntry = { sequence: number; at: string; action: string; detail: string };
export function TransactionRoom({
  account,
  owned,
  brief,
  offers,
}: {
  account: AccountState;
  owned: OwnedRoom;
  brief: HomeDecisionBrief;
  offers: OfferComparison | null;
}) {
  const [status, setStatus] = useState('');
  const [audit, setAudit] = useState<{ verified: boolean; entries: AuditEntry[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { room } = owned;
  if (!account.user)
    return (
      <OsPanel eyebrow="TRANSACTION ROOM" title="Keep the transaction in one place you control." id="os-room">
        <AccountGate
          account={account}
          purpose="A Transaction Room keeps milestones, deadlines, documents, inspection items, checklists and notes for this home, encrypted on Ascent’s server, so you can share chosen parts with your agent, attorney or lender. It needs an account so that only you control it."
        />
      </OsPanel>
    );
  const put = async (section: string, items: unknown[], done: string) => {
    if (!room) return;
    try {
      owned.setRoom(
        await requestJson<RoomView>(`/api/rooms/${room.id}/sections/${section}`, {
          method: 'PUT',
          json: { version: room.version, items },
        }),
      );
      setStatus(done);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'That could not be saved.');
    }
  };
  const reference = offers?.analyses.find(item => item.offerId === offers.referenceOfferId);
  const offerDeadlines = (reference?.deadlines ?? []).filter(item => item.date);
  return (
    <OsPanel
      eyebrow="TRANSACTION ROOM"
      title={room ? `Your room for ${room.address}.` : 'Open a Transaction Room.'}
      id="os-room"
    >
      {owned.error && (
        <p className="error-box" role="alert">
          {owned.error}
        </p>
      )}
      {owned.loading ? (
        <p role="status">Opening your room…</p>
      ) : !room ? (
        <>
          <p>
            Signed in as {account.user.email}. A room starts with your milestones empty and common financing and
            settlement checklists. Nobody else can see it until you share specific parts from Share With My Agent.
          </p>
          <button type="button" className="button primary" onClick={() => void owned.open()} data-testid="open-room">
            Open a Transaction Room
          </button>
        </>
      ) : room.access === 'owner' ? (
        <>
          <div className="os-actions">
            {reference && offerDeadlines.length > 0 && (
              <button
                type="button"
                className="button small"
                onClick={() => {
                  const known = new Set(room.deadlines.map(item => `${item.label}|${item.date}`));
                  const added = offerDeadlines
                    .map(item => ({
                      id: newItemId('deadlines'),
                      label: `${item.label} (${reference.label})`,
                      date: item.date!,
                      basis: 'offer-lab' as const,
                      note: item.note.slice(0, 300),
                    }))
                    .filter(item => !known.has(`${item.label}|${item.date}`));
                  void put(
                    'deadlines',
                    [...room.deadlines, ...added].slice(0, 60),
                    `${added.length} deadline(s) added from Compare Offers.`,
                  );
                }}
              >
                Add {reference.label}’s deadlines
              </button>
            )}
            <button
              type="button"
              className="button small"
              onClick={() =>
                void put(
                  'references',
                  [
                    ...room.references,
                    {
                      id: newItemId('references'),
                      kind: 'home-decision-brief',
                      label: `Home Decision Brief · ${brief.value.label}`,
                      calculationHash: brief.checksum.slice(0, 80),
                      savedAt: new Date().toISOString(),
                    },
                    ...(offers
                      ? [
                          {
                            id: newItemId('references'),
                            kind: 'offer-comparison',
                            label: `Offer comparison · ${offers.analyses.length} offer(s)`,
                            calculationHash: offers.calculationHash,
                            savedAt: new Date().toISOString(),
                          },
                        ]
                      : []),
                  ].slice(-60),
                  'Brief reference saved to the room.',
                )
              }
            >
              Save this brief’s reference
            </button>
            <button
              type="button"
              className="button small"
              onClick={async () => {
                try {
                  downloadJson(await requestJson(`/api/rooms/${room.id}/export`), 'ascent-transaction-room.json');
                } catch (e) {
                  setStatus(e instanceof Error ? e.message : 'The export failed.');
                }
              }}
            >
              <Download size={14} aria-hidden="true" /> Private export
            </button>
          </div>
          <p role="status" aria-live="polite" className="fine">
            {status}
          </p>
          <RoomViewer room={room} onChange={owned.setRoom} />
          <details
            onToggle={event => {
              if ((event.target as HTMLDetailsElement).open && !audit)
                requestJson<{ verified: boolean; entries: AuditEntry[] }>(`/api/rooms/${room.id}/audit`)
                  .then(setAudit)
                  .catch(e => setStatus(e instanceof Error ? e.message : 'The audit could not be loaded.'));
            }}
          >
            <summary>Activity log (only you can see this)</summary>
            {audit ? (
              <>
                <p className={audit.verified ? 'fine' : 'error-box'}>
                  {audit.verified
                    ? `${audit.entries.length} entries; the hash chain verifies, so none was edited or removed.`
                    : 'The hash chain does not verify: an entry was changed or removed outside Ascent.'}
                </p>
                <ol className="os-check-log">
                  {audit.entries.toReversed().map(entry => (
                    <li key={entry.sequence}>
                      {dateTime(entry.at)} · {entry.action.replace('room.', '').replace(/-/g, ' ')} · {entry.detail}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p role="status">Loading…</p>
            )}
          </details>
          <div className="os-actions">
            {confirmDelete ? (
              <>
                <button
                  type="button"
                  className="button danger"
                  onClick={async () => {
                    try {
                      await requestJson(`/api/rooms/${room.id}`, { method: 'DELETE' });
                      owned.setRoom(null);
                      setStatus(
                        'Room, documents, collaborators and activity log deleted. Downloaded copies are not recalled.',
                      );
                    } catch (e) {
                      setStatus(e instanceof Error ? e.message : 'The room could not be deleted.');
                    }
                    setConfirmDelete(false);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" /> Delete the room and every file in it
                </button>
                <button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className="text-button" onClick={() => setConfirmDelete(true)}>
                Delete room…
              </button>
            )}
          </div>
        </>
      ) : null}
    </OsPanel>
  );
}
