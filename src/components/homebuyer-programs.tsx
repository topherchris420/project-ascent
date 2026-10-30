'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle2, CircleHelp, XCircle } from 'lucide-react';
import {
  PROGRAM_BOUNDARIES,
  areaLabels,
  blankProfile,
  lastOwnedLabels,
  lastOwnedOptions,
  programAreas,
  screenPrograms,
  type Answer,
  type BuyerProfile,
  type ProgramResult,
  type ProgramVerdict,
} from '@/lib/homebuyer-programs';
import '@/app/pricing-studio.css';
import '@/app/programs.css';

const verdictText: Record<ProgramVerdict, string> = {
  'worth-checking': 'Worth checking',
  ask: 'Questions to ask',
  'does-not-fit': 'Does not fit what you entered',
};
const outcomeIcon = {
  meets: <CheckCircle2 size={16} aria-hidden="true" className="programs-meets" />,
  fails: <XCircle size={16} aria-hidden="true" className="programs-fails" />,
  unknown: <CircleHelp size={16} aria-hidden="true" className="programs-unknown" />,
} as const;
const outcomeWords = { meets: 'Fits', fails: 'Does not fit', unknown: 'Unknown' } as const;

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

/**
 * Reads typed text as a whole number. Dollar fields accept "$75,000" and "75k". Out-of-range or unreadable text is
 * "not entered", never clamped to a limit the visitor did not type.
 */
function readNumber(raw: string, min: number, max: number, money: boolean) {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, '');
  if (!cleaned) return { value: null, error: null };
  const match = cleaned.match(money ? /^(\d+(?:\.\d+)?)(k|m)?$/ : /^\d+$/);
  if (!match) return { value: null, error: money ? 'Enter an amount, for example 75,000.' : 'Enter a whole number.' };
  const value = money
    ? Math.round(Number(match[1]) * (match[2] === 'k' ? 1e3 : match[2] === 'm' ? 1e6 : 1))
    : Number(cleaned);
  if (value < min || value > max)
    return {
      value: null,
      error: `Enter a number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`,
    };
  return { value, error: null };
}

/** A dollar or count field that keeps blank as "not entered" rather than zero, and checks its range after typing. */
function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  money = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  money?: boolean;
}) {
  const [text, setText] = useState(() => (value === null ? '' : value.toLocaleString('en-US')));
  const [left, setLeft] = useState(false);
  const { error } = readNumber(text, min, max, money);
  const shownError = left ? error : null;
  const echo = money && value !== null && /[km]/i.test(text) ? `Read as ${usd(value)}` : null;
  const described = [hint && `${id}-hint`, shownError && `${id}-error`, echo && `${id}-echo`].filter(Boolean).join(' ');
  return (
    <div className="programs-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <small id={`${id}-hint`} className="programs-hint">
          {hint}
        </small>
      )}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        aria-invalid={shownError ? true : undefined}
        aria-describedby={described || undefined}
        onChange={event => {
          setText(event.target.value);
          onChange(readNumber(event.target.value, min, max, money).value);
        }}
        onBlur={() => setLeft(true)}
      />
      {shownError && (
        <small id={`${id}-error`} className="programs-error">
          {shownError}
        </small>
      )}
      {echo && (
        <small id={`${id}-echo`} className="programs-hint">
          {echo}
        </small>
      )}
    </div>
  );
}

function Choice({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Answer;
  onChange: (value: Answer) => void;
}) {
  return (
    <fieldset className="programs-choice">
      <legend>{label}</legend>
      <div>
        {(['yes', 'no', 'unsure'] as const).map(option => (
          <label key={option}>
            <input type="radio" name={id} value={option} checked={value === option} onChange={() => onChange(option)} />
            {option === 'unsure' ? 'Not sure' : option === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProgramCard({ result }: { result: ProgramResult }) {
  return (
    <article className={`programs-card programs-${result.verdict}`} aria-labelledby={`program-${result.id}`}>
      <header>
        <span className="programs-verdict">{verdictText[result.verdict]}</span>
        <h3 id={`program-${result.id}`}>{result.name}</h3>
        <p className="programs-admin">{result.administrator}</p>
      </header>
      <p>{result.provides}</p>
      {result.amount && (
        <p className="programs-amount">
          <strong>Posted amount:</strong> {result.amount}
        </p>
      )}
      <h4>Rules compared with your answers</h4>
      <ul className="programs-checks">
        {result.checks.map(check => (
          <li key={check.rule}>
            {outcomeIcon[check.outcome]}
            <span className="sr-only">{outcomeWords[check.outcome]}: </span>
            <span>
              <strong>{check.rule}.</strong> {check.detail}
            </span>
          </li>
        ))}
      </ul>
      {result.alsoRequired.length > 0 && (
        <>
          <h4>Also required (Ascent cannot check these)</h4>
          <ul>
            {result.alsoRequired.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <p className="programs-status">
        <strong>Status:</strong> {result.status}
      </p>
      <p className="programs-source">
        {result.source}{' '}
        <a href={result.url} target="_blank" rel="noopener noreferrer">
          Official page <ArrowUpRight size={13} aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </article>
  );
}

export function HomebuyerPrograms() {
  const [profile, setProfile] = useState<BuyerProfile>(() => blankProfile());
  // Remounts the form on "Clear answers", so each field's typed text resets with the profile.
  const [formKey, setFormKey] = useState(0);
  const set = <K extends keyof BuyerProfile>(key: K, value: BuyerProfile[K]) =>
    setProfile(current => ({ ...current, [key]: value }));
  const results = useMemo(() => screenPrograms(profile), [profile]);
  const counts = results.reduce<Record<ProgramVerdict, number>>(
    (total, result) => ({ ...total, [result.verdict]: total[result.verdict] + 1 }),
    { 'worth-checking': 0, ask: 0, 'does-not-fit': 0 },
  );
  const tally = `${counts['worth-checking']} worth checking · ${counts.ask} with questions to ask · ${counts['does-not-fit']} not fitting your answers`;
  // Screen readers hear the counts once typing pauses, not after every digit.
  const [announced, setAnnounced] = useState(tally);
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(tally), 800);
    return () => clearTimeout(timer);
  }, [tally]);
  return (
    <div className="studio-page programs-page">
      <a className="skip-link" href="#programs-main">
        Skip to the program screener
      </a>
      <header className="studio-header">
        <Link className="brand" href="/" aria-label="Ascent home">
          <span className="brand-mark">A</span>ascent<span className="brand-dot">.</span>
        </Link>
        <span className="studio-header-label">BUYING HELP</span>
        <Link href="/" className="button small">
          <ArrowLeft size={15} aria-hidden="true" /> Ascent
        </Link>
      </header>
      <main id="programs-main" className="programs-main">
        <section className="programs-intro" aria-labelledby="programs-title">
          <h1 id="programs-title">Which homebuyer programs should you ask about?</h1>
          <p>
            Answer a few questions. Ascent compares them with the rules DC, Maryland and county programs publish, and
            shows which rules fit, which do not and what is still unknown. Leave anything blank you would rather not
            enter. Nothing leaves this page.
          </p>
        </section>
        <div className="programs-layout">
          <form
            key={formKey}
            className="programs-form"
            aria-label="Your situation"
            onSubmit={event => event.preventDefault()}
          >
            <fieldset className="programs-choice">
              <legend>Where are you buying?</legend>
              <div>
                {programAreas.map(area => (
                  <label key={area}>
                    <input
                      type="radio"
                      name="area"
                      value={area}
                      checked={profile.area === area}
                      onChange={() => set('area', area)}
                    />
                    {areaLabels[area]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="programs-field">
              <label htmlFor="programs-last-owned">When did you last own a home?</label>
              <select
                id="programs-last-owned"
                value={profile.lastOwned}
                onChange={event => set('lastOwned', event.target.value as BuyerProfile['lastOwned'])}
              >
                {lastOwnedOptions.map(option => (
                  <option key={option} value={option}>
                    {lastOwnedLabels[option]}
                  </option>
                ))}
              </select>
            </div>
            <NumberField
              id="programs-size"
              label="People in your household"
              value={profile.householdSize}
              onChange={value => set('householdSize', value)}
              min={1}
              max={12}
            />
            <NumberField
              id="programs-income"
              label="Yearly household income before taxes ($)"
              hint="Everyone in the household who earns income."
              value={profile.householdIncome}
              onChange={value => set('householdIncome', value)}
              min={0}
              max={5_000_000}
              money
            />
            {profile.area === 'dc' && (
              <NumberField
                id="programs-borrower-income"
                label="Income of the people on the loan ($), if different"
                hint="DC Open Doors counts only the borrowers’ income."
                value={profile.borrowerIncome}
                onChange={value => set('borrowerIncome', value)}
                min={0}
                max={5_000_000}
                money
              />
            )}
            <NumberField
              id="programs-price"
              label="Price you expect to pay ($)"
              value={profile.price}
              onChange={value => set('price', value)}
              min={0}
              max={20_000_000}
              money
            />
            <NumberField
              id="programs-credit"
              label="Credit score, if you know it"
              value={profile.creditScore}
              onChange={value => set('creditScore', value)}
              min={300}
              max={850}
            />
            <Choice
              id="programs-residence"
              label="Will you live in the home?"
              value={profile.primaryResidence}
              onChange={value => set('primaryResidence', value)}
            />
            {profile.area === 'dc' ? (
              <>
                <Choice
                  id="programs-dc-resident"
                  label="Do you live in DC now?"
                  value={profile.dcResident}
                  onChange={value => set('dcResident', value)}
                />
                <Choice
                  id="programs-dc-employee"
                  label="Do you work for the DC government?"
                  value={profile.dcGovernmentEmployee}
                  onChange={value => set('dcGovernmentEmployee', value)}
                />
              </>
            ) : (
              <Choice
                id="programs-veteran"
                label="Are you a veteran?"
                value={profile.veteran}
                onChange={value => set('veteran', value)}
              />
            )}
            <button
              type="button"
              className="button programs-clear"
              onClick={() => {
                setProfile(blankProfile(profile.area));
                setFormKey(key => key + 1);
              }}
            >
              Clear answers
            </button>
          </form>
          <section className="programs-results" aria-labelledby="programs-results-title">
            <h2 id="programs-results-title">
              {areaLabels[profile.area]}: {results.length} published programs
            </h2>
            <p className="programs-tally">{tally}</p>
            <p className="sr-only" aria-live="polite">
              {announced}
            </p>
            {results.map(result => (
              <ProgramCard key={result.id} result={result} />
            ))}
            <section className="programs-limits" aria-labelledby="programs-limits-title">
              <h2 id="programs-limits-title">Before you rely on this</h2>
              <ul>
                {PROGRAM_BOUNDARIES.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p>
                Want to see what homes sold for where you are looking? <Link href="/sales">Search recorded sales</Link>.
              </p>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
