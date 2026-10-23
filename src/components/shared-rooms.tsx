'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { RoomView } from '@/lib/rooms';
import { AccountGate, useAccount } from './os/account';
import { RoomViewer } from './os/room-view';
import { OsPanel, requestJson, shortDay } from './os/shared';
import '@/app/pricing-studio.css';
import '@/app/homeowner-os.css';

type Shared = { id: string; address: string; role: string; accessExpiresAt: string | null };

/** Rooms other homeowners shared with the signed-in account, and acceptance of an invitation link. */
export function SharedRooms() {
  const account = useAccount();
  const [token, setToken] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Shared[] | null>(null);
  const [open, setOpen] = useState<RoomView | null>(null);
  const [status, setStatus] = useState('');
  useEffect(() => {
    // The token travels in the fragment, which browsers never send to a server; it is cleared from the address bar.
    const invite = new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if (invite) {
      setToken(invite);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const load = useCallback(() => {
    if (!account.user) return;
    requestJson<{ shared: Shared[] }>('/api/rooms')
      .then(body => setRooms(body.shared))
      .catch(e => setStatus(e instanceof Error ? e.message : 'Shared rooms could not be loaded.'));
  }, [account.user]);
  useEffect(load, [load]);
  const accept = async () => {
    if (!token) return;
    setStatus('');
    try {
      const accepted = await requestJson<{ roomId: string; address: string }>('/api/rooms/accept', {
        method: 'POST',
        json: { token },
      });
      setToken(null);
      setStatus(`You can now see the parts of ${accepted.address} that were shared with you.`);
      load();
      setOpen(await requestJson<RoomView>(`/api/rooms/${accepted.roomId}`));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'The invitation could not be accepted.');
    }
  };
  return (
    <div className="studio-page os-page">
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">SHARED ROOMS</span>
        <Link href="/home" className="button small">
          <ArrowLeft size={15} aria-hidden="true" /> My homes
        </Link>
      </header>
      <main id="os-main" className="os-main">
        <OsPanel eyebrow="TRANSACTION ROOMS SHARED WITH YOU" title="Rooms you were invited to." id="shared-rooms">
          {!account.user ? (
            <AccountGate
              account={account}
              purpose={
                token
                  ? 'Sign in or create a free account with the email address the invitation was sent to. Then accept it here.'
                  : 'Sign in to see Transaction Rooms that homeowners shared with you.'
              }
            />
          ) : (
            <>
              {token && (
                <div className="os-callout" data-testid="accept-invite">
                  <p>
                    You have an invitation. Accepting it lets you see only the sections the homeowner chose, until they
                    revoke it or it expires. They can see when you view the room.
                  </p>
                  <button type="button" className="button primary" onClick={() => void accept()}>
                    Accept as {account.user.email}
                  </button>
                </div>
              )}
              {status && (
                <p role="status" aria-live="polite">
                  {status}
                </p>
              )}
              {rooms === null ? (
                <p role="status">Loading…</p>
              ) : rooms.length ? (
                <ul className="os-grants">
                  {rooms.map(room => (
                    <li key={room.id}>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          requestJson<RoomView>(`/api/rooms/${room.id}`)
                            .then(setOpen)
                            .catch(e => setStatus(e instanceof Error ? e.message : 'The room could not be opened.'))
                        }
                      >
                        {room.address}
                      </button>{' '}
                      · {room.role}
                      {room.accessExpiresAt && <> · until {shortDay(room.accessExpiresAt)}</>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fine">No rooms are shared with this account.</p>
              )}
            </>
          )}
        </OsPanel>
        {open && (
          <OsPanel eyebrow="SHARED ROOM" title={open.address} id="shared-room">
            <RoomViewer room={open} onChange={setOpen} />
          </OsPanel>
        )}
      </main>
    </div>
  );
}
