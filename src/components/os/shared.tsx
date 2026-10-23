'use client';
import { useId, type ReactNode } from 'react';

/** Reads browser storage without throwing; storage can be blocked, full or cleared. */
export function readLocal<T>(key: string, parse: (raw: string) => T): { value: T | null; error: string } {
  try {
    const raw = localStorage.getItem(key);
    return { value: raw ? parse(raw) : null, error: '' };
  } catch {
    return { value: null, error: 'Saved data on this device could not be read. It has been left as it was.' };
  }
}
export function writeLocal(key: string, value: unknown): string {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return '';
  } catch {
    return 'Device storage is unavailable or full, so this was not saved. Export a copy to keep it.';
  }
}

/** Same-origin JSON request; the error text of a failed response is surfaced, never replaced with a guess. */
export async function requestJson<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(url, {
    ...rest,
    headers: { ...(json === undefined ? {} : { 'content-type': 'application/json' }), ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error((body as { error?: string }).error || `The request failed (${response.status}).`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export const numberOrNull = (raw: string) => {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(/[$,%\s]/g, ''));
  return Number.isFinite(value) ? value : null;
};

export function NumberField({
  label,
  value,
  onChange,
  hint,
  step = 'any',
  min = 0,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  step?: string;
  min?: number;
}) {
  const id = useId();
  return (
    <div className="os-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value ?? ''}
        placeholder="Not entered"
        onChange={event => onChange(numberOrNull(event.target.value))}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <small id={`${id}-hint`} className="os-hint">
          {hint}
        </small>
      )}
    </div>
  );
}
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  maxLength = 200,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'email' | 'password';
  maxLength?: number;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="os-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        required={required}
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : undefined}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="os-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The provenance label every figure carries: entered, assumed or calculated. */
export function Kind({ kind }: { kind: 'entered' | 'assumption' | 'calculation' }) {
  return <span className={`os-kind os-kind-${kind}`}>{kind === 'calculation' ? 'calculated' : kind}</span>;
}

export function OsPanel({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="panel os-panel" aria-labelledby={id ? `${id}-title` : undefined} id={id}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
      {children}
    </section>
  );
}

export const shortDay = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
