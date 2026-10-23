'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import type { RoomView } from '@/lib/rooms';
import {
  roomSectionLabels,
  roomSections,
  roomStages,
  ROOM_LIMITS,
  type EditableSection,
  type RoomSection,
} from '@/lib/room-model';
import { DOCUMENT_LIMIT_LABEL } from '@/lib/upload-limits';
import { dateTime, requestJson, shortDay } from './shared';

type Item = Record<string, unknown> & { id: string };
type Field = {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'checkbox' | 'textarea';
  options?: readonly string[];
  max?: number;
};
const STATUS = ['planned', 'in-progress', 'done', 'blocked'] as const;
/** The fields each editable section shows, in the order of the section's schema. */
export const SECTION_FIELDS: Record<Exclude<EditableSection, 'references'>, Field[]> = {
  milestones: [
    { key: 'title', label: 'Milestone', type: 'text', max: 120 },
    { key: 'due', label: 'Due', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS },
  ],
  tasks: [
    { key: 'done', label: 'Done', type: 'checkbox' },
    { key: 'title', label: 'Task', type: 'text', max: 160 },
    { key: 'assignee', label: 'Who', type: 'text', max: 80 },
    { key: 'due', label: 'Due', type: 'date' },
  ],
  deadlines: [
    { key: 'label', label: 'Deadline', type: 'text', max: 160 },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'basis', label: 'From', type: 'select', options: ['entered', 'offer-lab', 'contract'] },
    { key: 'note', label: 'Note', type: 'text', max: 300 },
  ],
  quotes: [
    { key: 'vendor', label: 'Vendor', type: 'text', max: 120 },
    { key: 'scope', label: 'Work', type: 'text', max: 300 },
    { key: 'amount', label: 'Amount ($)', type: 'number' },
    { key: 'receivedOn', label: 'Received', type: 'date' },
  ],
  inspection: [
    { key: 'item', label: 'Item', type: 'text', max: 200 },
    { key: 'severity', label: 'Severity', type: 'select', options: ['safety', 'major', 'minor', 'information'] },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: ['open', 'repair-requested', 'credit-requested', 'accepted-as-is', 'resolved'],
    },
    { key: 'note', label: 'Note', type: 'text', max: 500 },
  ],
  financing: [
    { key: 'done', label: 'Done', type: 'checkbox' },
    { key: 'label', label: 'Step', type: 'text', max: 160 },
    { key: 'note', label: 'Note', type: 'text', max: 300 },
  ],
  settlement: [
    { key: 'done', label: 'Done', type: 'checkbox' },
    { key: 'label', label: 'Step', type: 'text', max: 160 },
    { key: 'note', label: 'Note', type: 'text', max: 300 },
  ],
  decisions: [
    { key: 'title', label: 'Decision', type: 'text', max: 160 },
    { key: 'decision', label: 'What was decided', type: 'textarea', max: 1000 },
    { key: 'rationale', label: 'Why', type: 'textarea', max: 2000 },
  ],
};
export const newItemId = (section: string) =>
  `${section.slice(0, 4)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function blank(section: Exclude<EditableSection, 'references'>): Item {
  const item: Item = { id: newItemId(section) };
  for (const field of SECTION_FIELDS[section])
    item[field.key] =
      field.type === 'checkbox'
        ? false
        : field.type === 'select'
          ? field.options![0]
          : field.type === 'number' || field.type === 'date'
            ? null
            : '';
  if (section === 'deadlines') item.date = new Date().toISOString().slice(0, 10);
  if (section === 'decisions') item.at = new Date().toISOString();
  return item;
}

function SectionEditor({
  section,
  items,
  editable,
  onSave,
}: {
  section: Exclude<EditableSection, 'references'>;
  items: Item[];
  editable: boolean;
  onSave: (items: Item[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState(items);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setDraft(items), [items]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(items);
  const fields = SECTION_FIELDS[section];
  const edit = (index: number, key: string, value: unknown) =>
    setDraft(current => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This section could not be saved.');
    } finally {
      setSaving(false);
    }
  };
  if (!editable)
    return items.length ? (
      <ul className="os-room-list">
        {items.map(item => (
          <li key={item.id}>
            {fields
              .map(field =>
                field.type === 'checkbox'
                  ? item[field.key]
                    ? '✓'
                    : '○'
                  : item[field.key] === null || item[field.key] === ''
                    ? null
                    : field.type === 'date'
                      ? shortDay(String(item[field.key]))
                      : String(item[field.key]),
              )
              .filter(Boolean)
              .join(' · ')}
          </li>
        ))}
      </ul>
    ) : (
      <p className="fine">Nothing here yet.</p>
    );
  return (
    <div className="os-room-editor">
      {draft.map((item, index) => (
        <fieldset key={item.id} className="os-room-row">
          <legend className="sr-only">
            {roomSectionLabels[section]} item {index + 1}
          </legend>
          {fields.map(field => {
            const id = `${item.id}-${field.key}`;
            const value = item[field.key];
            return (
              <label key={field.key} htmlFor={id} className={`os-field os-field-${field.type}`}>
                <span>{field.label}</span>
                {field.type === 'checkbox' ? (
                  <input
                    id={id}
                    type="checkbox"
                    checked={!!value}
                    onChange={event => edit(index, field.key, event.target.checked)}
                  />
                ) : field.type === 'select' ? (
                  <select id={id} value={String(value)} onChange={event => edit(index, field.key, event.target.value)}>
                    {field.options!.map(option => (
                      <option key={option} value={option}>
                        {option.replace(/-/g, ' ')}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    id={id}
                    maxLength={field.max}
                    value={String(value ?? '')}
                    onChange={event => edit(index, field.key, event.target.value)}
                  />
                ) : (
                  <input
                    id={id}
                    type={field.type}
                    maxLength={field.max}
                    value={value === null || value === undefined ? '' : String(value)}
                    onChange={event =>
                      edit(
                        index,
                        field.key,
                        field.type === 'number'
                          ? event.target.value === ''
                            ? null
                            : Number(event.target.value)
                          : field.type === 'date'
                            ? event.target.value || (section === 'deadlines' ? item[field.key] : null)
                            : event.target.value,
                      )
                    }
                  />
                )}
              </label>
            );
          })}
          <button
            type="button"
            className="text-button"
            aria-label={`Remove ${roomSectionLabels[section].toLowerCase()} item ${index + 1}`}
            onClick={() => setDraft(current => current.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </fieldset>
      ))}
      <div className="os-actions">
        <button
          type="button"
          className="button small"
          onClick={() => setDraft(current => [...current, blank(section)])}
        >
          <Plus size={14} aria-hidden="true" /> Add
        </button>
        <button type="button" className="button small primary" disabled={!dirty || saving} onClick={() => void save()}>
          <Save size={14} aria-hidden="true" /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One room, for its owner (editable) or a collaborator (only what the grant covers). Every write goes through the
 * room API, which re-checks the permission; this view only hides controls the server would refuse.
 */
export function RoomViewer({ room, onChange }: { room: RoomView; onChange: (room: RoomView) => void }) {
  const owner = room.access === 'owner';
  const permissions = room.access === 'collaborator' ? room.permissions : null;
  const [note, setNote] = useState('');
  const [shareNote, setShareNote] = useState(false);
  const [status, setStatus] = useState('');
  const [uploadSection, setUploadSection] = useState<RoomSection>('documents');
  const fileInput = useRef<HTMLInputElement>(null);
  const base = `/api/rooms/${room.id}`;
  const run = async (action: () => Promise<RoomView | { room: RoomView }>, done: string) => {
    setStatus('');
    try {
      const next = await action();
      onChange('room' in next ? next.room : next);
      setStatus(done);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'That did not work.');
    }
  };
  const saveSection = async (section: EditableSection, items: unknown[]) => {
    const next = await requestJson<RoomView>(`${base}/sections/${section}`, {
      method: 'PUT',
      json: { version: room.version, items },
    });
    onChange(next);
    setStatus(`${roomSectionLabels[section]} saved.`);
  };
  const visible = (section: RoomSection) => owner || permissions!.sections.includes(section);
  const editable = Object.keys(SECTION_FIELDS) as Exclude<EditableSection, 'references'>[];
  return (
    <div className="os-room" data-testid="room-view">
      {!owner && (
        <p className="os-callout">
          Shared with you as {room.access === 'collaborator' ? room.role : ''} until{' '}
          {room.access === 'collaborator' && room.accessExpiresAt
            ? shortDay(room.accessExpiresAt)
            : 'the owner revokes it'}
          . You see only what the owner chose to share{permissions?.download ? '' : ', and files cannot be downloaded'}.
        </p>
      )}
      <p>
        Stage: <strong>{room.stage.replace('-', ' ')}</strong>
        {owner && room.access === 'owner' && (
          <label className="os-inline">
            <span className="sr-only">Change stage</span>
            <select
              value={room.stage}
              onChange={event =>
                void run(
                  () =>
                    requestJson(`${base}/stage`, {
                      method: 'POST',
                      json: { version: room.version, stage: event.target.value },
                    }),
                  'Stage updated.',
                )
              }
            >
              {roomStages.map(stage => (
                <option key={stage} value={stage}>
                  {stage.replace('-', ' ')}
                </option>
              ))}
            </select>
          </label>
        )}
      </p>
      {room.access === 'owner' && (
        <p className="fine">
          New documents are deleted after{' '}
          <label className="os-inline">
            <span className="sr-only">Keep new documents for</span>
            <select
              value={room.retentionDays}
              onChange={event =>
                void run(
                  () =>
                    requestJson(`${base}/stage`, {
                      method: 'POST',
                      json: { version: room.version, stage: room.stage, retentionDays: Number(event.target.value) },
                    }),
                  'Retention updated for documents uploaded from now on.',
                )
              }
            >
              {[...new Set([30, 90, 365, 730, 1825, 3650, room.retentionDays])]
                .sort((a, b) => a - b)
                .map(days => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
            </select>
          </label>
          . Files already uploaded keep their date.
        </p>
      )}
      {editable.filter(visible).map(section => {
        const items = ((room as Record<string, unknown>)[section] as Item[] | undefined) ?? [];
        return (
          <details
            key={section}
            className="os-room-section"
            open={['milestones', 'tasks', 'deadlines'].includes(section)}
          >
            <summary>
              {roomSectionLabels[section]} <span className="os-count">{items.length}</span>
            </summary>
            {(section === 'financing' || section === 'settlement') && (
              <p className="fine">
                Common steps to start from. Your contract and your settlement agent define the actual ones.
              </p>
            )}
            <SectionEditor
              section={section}
              items={items}
              editable={owner}
              onSave={next => saveSection(section, next)}
            />
          </details>
        );
      })}
      {visible('references') && (
        <details className="os-room-section">
          <summary>
            {roomSectionLabels.references} <span className="os-count">{room.references?.length ?? 0}</span>
          </summary>
          {room.references?.length ? (
            <ul className="os-room-list">
              {room.references.map(item => (
                <li key={item.id}>
                  {item.label} · {item.kind.replace(/-/g, ' ')} · saved {dateTime(item.savedAt)} ·{' '}
                  <code>{item.calculationHash}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">No briefs saved here yet.</p>
          )}
        </details>
      )}
      {visible('documents') && (
        <details className="os-room-section" open>
          <summary>
            Documents <span className="os-count">{room.documents?.length ?? 0}</span>
          </summary>
          {room.documents?.length ? (
            <ul className="os-room-list" data-testid="room-documents">
              {room.documents.map(document => (
                <li key={document.id}>
                  <strong>{document.name}</strong> · {roomSectionLabels[document.section]} ·{' '}
                  {Math.ceil(document.size / 1024)} KB · deleted after {shortDay(document.deleteAfter)}
                  {(owner || permissions?.download) && (
                    <>
                      {' '}
                      <a className="text-button" href={`${base}/documents/${document.id}`} download>
                        <Download size={14} aria-hidden="true" /> Download
                      </a>
                    </>
                  )}
                  {owner && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        void run(
                          () => requestJson(`${base}/documents/${document.id}`, { method: 'DELETE' }),
                          'Document deleted.',
                        )
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" /> Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">No documents{owner ? ' yet' : ' shared with you'}.</p>
          )}
          {owner && (
            <form
              className="os-form os-upload"
              onSubmit={event => {
                event.preventDefault();
                const file = fileInput.current?.files?.[0];
                if (!file) return setStatus('Choose a PDF or text file first.');
                const form = new FormData();
                form.append('file', file);
                form.append('section', uploadSection);
                void run(async () => {
                  const result = await requestJson<{ room: RoomView }>(`${base}/documents`, {
                    method: 'POST',
                    body: form,
                  });
                  if (fileInput.current) fileInput.current.value = '';
                  return result;
                }, `${file.name} uploaded and encrypted.`);
              }}
            >
              <label className="os-field">
                <span>
                  PDF or plain text, up to {DOCUMENT_LIMIT_LABEL}; up to {ROOM_LIMITS.documents} per room
                </span>
                <input ref={fileInput} type="file" accept=".pdf,.txt,application/pdf,text/plain" />
              </label>
              <label className="os-field">
                <span>File it under</span>
                <select value={uploadSection} onChange={event => setUploadSection(event.target.value as RoomSection)}>
                  {roomSections
                    .filter(section => section !== 'notes' && section !== 'references')
                    .map(section => (
                      <option key={section} value={section}>
                        {roomSectionLabels[section]}
                      </option>
                    ))}
                </select>
              </label>
              <button type="submit" className="button small">
                <FileUp size={14} aria-hidden="true" /> Upload
              </button>
              <p className="fine">
                Files are encrypted in storage and deleted after {room.access === 'owner' ? room.retentionDays : ''}{' '}
                days. Only people you share them with can see them.
              </p>
            </form>
          )}
        </details>
      )}
      {visible('notes') && (
        <details className="os-room-section" open>
          <summary>
            Notes <span className="os-count">{room.notes?.length ?? 0}</span>
          </summary>
          <ul className="os-notes">
            {(room.notes ?? []).map(item => (
              <li key={item.id}>
                <strong>{item.authorName}</strong> · {dateTime(item.at)}{' '}
                {owner && !item.shared && <span className="os-badge">Private</span>}
                <p>{item.text}</p>
              </li>
            ))}
          </ul>
          {(owner || permissions?.addNotes) && (
            <form
              className="os-form"
              onSubmit={event => {
                event.preventDefault();
                if (!note.trim()) return;
                void run(async () => {
                  const next = await requestJson<RoomView>(`${base}/notes`, {
                    method: 'POST',
                    json: { text: note, shared: owner ? shareNote : true },
                  });
                  setNote('');
                  return next;
                }, 'Note added.');
              }}
            >
              <label className="os-field">
                <span>Add a note</span>
                <textarea maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
              </label>
              {owner && (
                <label className="os-check-row">
                  <input type="checkbox" checked={shareNote} onChange={event => setShareNote(event.target.checked)} />
                  <span>Visible to collaborators who can see notes (otherwise only you)</span>
                </label>
              )}
              <button type="submit" className="button small">
                Add note
              </button>
            </form>
          )}
        </details>
      )}
      <p role="status" aria-live="polite" className="fine">
        {status}
      </p>
    </div>
  );
}
