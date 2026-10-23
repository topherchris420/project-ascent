'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, Printer, UserPlus } from 'lucide-react';
import { downloadJson, openHtmlReport } from '@/lib/browser-export';
import {
  agentPacket,
  DEFAULT_PACKET_PARTS,
  packetPartLabels,
  packetParts,
  type AgentPacketInput,
  type PacketPart,
} from '@/lib/agent-packet';
import { agentPacketHtml } from '@/lib/os-reports';
import {
  collaboratorRoles,
  ROOM_LIMITS,
  roomSectionLabels,
  roomSections,
  type RoomPermissions,
  type RoomSection,
} from '@/lib/room-model';
import type { AccountState } from './account';
import type { OwnedRoom } from './transaction-room';
import { dateTime, NumberField, OsPanel, requestJson, SelectField, shortDay, TextField } from './shared';

type Grant = {
  id: string;
  email: string;
  role: string;
  permissions: RoomPermissions;
  status: string;
  inviteExpiresAt: string;
  accessExpiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
type Created = { email: string; acceptanceUrl: string; inviteExpiresAt: string; accessExpiresAt: string; note: string };
type MlsStatus = {
  enabled: boolean;
  reason: string | null;
  requiredPermission: string;
  arrangements: { kind: string; label: string; consumer: string; requires: string }[];
};

function Packet({ input }: { input: Omit<AgentPacketInput, 'include' | 'createdAt'> }) {
  const [include, setInclude] = useState<PacketPart[]>([...DEFAULT_PACKET_PARTS]);
  const packet = useMemo(
    () => agentPacket({ ...input, include, createdAt: new Date().toISOString() }),
    [input, include],
  );
  const unavailable: Partial<Record<PacketPart, string>> = {
    offers: input.offers ? undefined : 'No offers entered',
    transaction: input.room ? undefined : 'No Transaction Room',
    records: input.timeline ? undefined : 'No timeline yet',
  };
  return (
    <OsPanel eyebrow="AGENT PACKET" title="Prepare a packet you send yourself." id="os-packet">
      <p>
        Choose what goes in. Ascent builds the packet on this device; it does not email, upload or send it to anyone.
        Private parts are off until you turn them on.
      </p>
      <fieldset className="os-form" data-testid="packet-parts">
        <legend>Include</legend>
        {packetParts.map(part => (
          <label key={part} className="os-check-row">
            <input
              type="checkbox"
              checked={include.includes(part)}
              disabled={!!unavailable[part]}
              onChange={() =>
                setInclude(current =>
                  current.includes(part) ? current.filter(item => item !== part) : [...current, part],
                )
              }
            />
            <span>
              <strong>{packetPartLabels[part].label}</strong>
              {packetPartLabels[part].private && <span className="os-badge os-private">Private</span>}{' '}
              {packetPartLabels[part].detail}
              {unavailable[part] && <em> ({unavailable[part]})</em>}
            </span>
          </label>
        ))}
      </fieldset>
      <p className="fine">Never included: {packet.excluded.at(-1)}.</p>
      <div className="os-actions">
        <button
          type="button"
          className="button"
          onClick={() => openHtmlReport(agentPacketHtml(packet))}
          data-testid="print-packet"
        >
          <Printer size={16} aria-hidden="true" /> Printable packet
        </button>
        <button type="button" className="button" onClick={() => downloadJson(packet, 'ascent-agent-packet.json')}>
          <Download size={16} aria-hidden="true" /> Download packet
        </button>
      </div>
    </OsPanel>
  );
}

const DEFAULT_SECTIONS: RoomSection[] = ['milestones', 'tasks', 'deadlines'];
function Invitations({ room }: { room: NonNullable<OwnedRoom['room']> }) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof collaboratorRoles)[number]>('agent');
  const [sections, setSections] = useState<RoomSection[]>(DEFAULT_SECTIONS);
  const [documentIds, setDocumentIds] = useState<string[] | 'all'>([]);
  const [download, setDownload] = useState(false);
  const [addNotes, setAddNotes] = useState(false);
  const [days, setDays] = useState<number | null>(30);
  const [created, setCreated] = useState<Created | null>(null);
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const base = `/api/rooms/${room.id}/grants`;
  const load = useCallback(
    () =>
      requestJson<Grant[]>(base)
        .then(setGrants)
        .catch(e => setStatus(e instanceof Error ? e.message : 'Collaborators could not be loaded.')),
    [base],
  );
  useEffect(() => void load(), [load]);
  const documents = room.access === 'owner' ? room.documents : [];
  const toggleSection = (section: RoomSection) =>
    setSections(current =>
      current.includes(section) ? current.filter(item => item !== section) : [...current, section],
    );
  const submit = async () => {
    setStatus('');
    setCreated(null);
    setCopied(false);
    try {
      const permissions: RoomPermissions = {
        sections,
        documents: sections.includes('documents') ? documentIds : [],
        download: sections.includes('documents') && download,
        addNotes: sections.includes('notes') && addNotes,
      };
      const result = await requestJson<Created>(base, {
        method: 'POST',
        json: { email, role, permissions, accessDays: days ?? 0 },
      });
      setCreated(result);
      setEmail('');
      void load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'The invitation could not be created.');
    }
  };
  return (
    <OsPanel eyebrow="ROOM ACCESS" title="Invite someone to see part of your room." id="os-invite">
      <p>
        Each person sees only the sections you choose, until the date you set or until you revoke access. Ascent creates
        a private link and shows it once; you send it yourself. No email is sent.
      </p>
      <form
        className="os-form"
        onSubmit={event => {
          event.preventDefault();
          void submit();
        }}
        data-testid="invite-form"
      >
        <div className="os-grid">
          <TextField
            label="Their email (they sign in with it to accept)"
            type="email"
            value={email}
            onChange={setEmail}
            maxLength={254}
            required
          />
          <SelectField
            label="Role"
            value={role}
            options={collaboratorRoles.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
            onChange={setRole}
          />
          <NumberField
            label={`Access lasts (days, up to ${ROOM_LIMITS.maxAccessDays})`}
            value={days}
            step="1"
            min={1}
            onChange={setDays}
          />
        </div>
        <fieldset>
          <legend>Sections they can see</legend>
          <div className="os-check-grid">
            {roomSections.map(section => (
              <label key={section} className="os-check-row">
                <input type="checkbox" checked={sections.includes(section)} onChange={() => toggleSection(section)} />
                <span>{roomSectionLabels[section]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {sections.includes('documents') && (
          <fieldset>
            <legend>Documents</legend>
            <label className="os-check-row">
              <input type="radio" name="docs" checked={documentIds === 'all'} onChange={() => setDocumentIds('all')} />
              <span>Every document filed under the sections above, including ones you add later</span>
            </label>
            <label className="os-check-row">
              <input type="radio" name="docs" checked={documentIds !== 'all'} onChange={() => setDocumentIds([])} />
              <span>Only the documents I select</span>
            </label>
            {documentIds !== 'all' &&
              (documents.length ? (
                documents.map(document => (
                  <label key={document.id} className="os-check-row os-indent">
                    <input
                      type="checkbox"
                      checked={documentIds.includes(document.id)}
                      onChange={() =>
                        setDocumentIds(current =>
                          current === 'all'
                            ? [document.id]
                            : current.includes(document.id)
                              ? current.filter(id => id !== document.id)
                              : [...current, document.id],
                        )
                      }
                    />
                    <span>{document.name}</span>
                  </label>
                ))
              ) : (
                <p className="fine os-indent">No documents in the room yet.</p>
              ))}
            <label className="os-check-row">
              <input type="checkbox" checked={download} onChange={event => setDownload(event.target.checked)} />
              <span>Allow downloads (otherwise they see names only)</span>
            </label>
          </fieldset>
        )}
        {sections.includes('notes') && (
          <label className="os-check-row">
            <input type="checkbox" checked={addNotes} onChange={event => setAddNotes(event.target.checked)} />
            <span>Let them add notes. They see only notes you mark as visible to collaborators.</span>
          </label>
        )}
        <button type="submit" className="button primary" disabled={!sections.length}>
          <UserPlus size={16} aria-hidden="true" /> Create private link
        </button>
      </form>
      {created && (
        <div className="os-callout" role="status" data-testid="invite-link">
          <p>
            <strong>Link for {created.email}</strong>, valid until {dateTime(created.inviteExpiresAt)}; access ends{' '}
            {shortDay(created.accessExpiresAt)}.
          </p>
          <label className="os-field">
            <span>Private link (shown once)</span>
            <input readOnly value={created.acceptanceUrl} onFocus={event => event.target.select()} />
          </label>
          <button
            type="button"
            className="button small"
            onClick={() =>
              navigator.clipboard
                .writeText(created.acceptanceUrl)
                .then(() => setCopied(true))
                .catch(() => setStatus('Copying is blocked here; select the link and copy it.'))
            }
          >
            <Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="fine">{created.note}</p>
        </div>
      )}
      {status && (
        <p className="error-box" role="alert">
          {status}
        </p>
      )}
      <h3>People with access</h3>
      {grants === null ? (
        <p role="status">Loading…</p>
      ) : grants.length ? (
        <ul className="os-grants" data-testid="grants">
          {grants.toReversed().map(grant => (
            <li key={grant.id} data-status={grant.status}>
              <strong>{grant.email}</strong> · {grant.role} · <span className="os-status">{grant.status}</span>
              <br />
              <small>
                {grant.permissions.sections.map(section => roomSectionLabels[section]).join(', ')}; downloads{' '}
                {grant.permissions.download ? 'allowed' : 'not allowed'}; access until {shortDay(grant.accessExpiresAt)}
              </small>
              {(grant.status === 'active' || grant.status === 'invited') && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    void requestJson(`${base}/${grant.id}`, { method: 'DELETE' })
                      .then(load)
                      .catch(e => setStatus(e instanceof Error ? e.message : 'Access could not be revoked.'))
                  }
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine">Nobody else can see this room.</p>
      )}
    </OsPanel>
  );
}

function MlsPanel() {
  const [status, setStatus] = useState<MlsStatus | null>(null);
  useEffect(() => {
    requestJson<MlsStatus>('/api/mls/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  return (
    <OsPanel eyebrow="MLS LISTINGS" title="Listings are not connected." id="os-mls">
      <p data-testid="mls-status">
        {status?.enabled === false || !status
          ? (status?.reason ??
            'Disabled: no MLS agreement is on file. Ascent shows recorded public transactions, which are not listings.')
          : 'An MLS agreement is on file.'}
      </p>
      <p className="fine">
        Ascent never presents recorded sales as homes for sale. Your agent has MLS access through their brokerage.
      </p>
      {status && (
        <details>
          <summary>What it would take</summary>
          <p>{status.requiredPermission}</p>
          <ul>
            {status.arrangements.map(item => (
              <li key={item.kind}>
                <strong>{item.label}</strong>: {item.consumer} {item.requires}
              </li>
            ))}
          </ul>
        </details>
      )}
    </OsPanel>
  );
}

export function ShareWithAgent({
  account,
  owned,
  packetInput,
  onOpenRoom,
}: {
  account: AccountState;
  owned: OwnedRoom;
  packetInput: Omit<AgentPacketInput, 'include' | 'createdAt'>;
  onOpenRoom: () => void;
}) {
  return (
    <>
      <Packet input={packetInput} />
      {owned.room?.access === 'owner' ? (
        <Invitations room={owned.room} />
      ) : (
        <OsPanel eyebrow="ROOM ACCESS" title="Share part of a Transaction Room." id="os-invite">
          <p>
            {account.user
              ? 'Open a Transaction Room first; then you can invite your agent, attorney or lender to see the sections you choose.'
              : 'Sharing a room needs a free account, so that only you control who sees it. The packet above works without one.'}
          </p>
          <button type="button" className="button" onClick={onOpenRoom}>
            Go to Transaction Room
          </button>
        </OsPanel>
      )}
      <MlsPanel />
    </>
  );
}
