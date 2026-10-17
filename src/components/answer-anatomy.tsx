import type { AssistantResponse, AssistantStatement } from '@/lib/types';

const groups: [AssistantStatement['kind'], string, string][] = [
  [
    'interpretation',
    'Model interpretation',
    'Written by a language model from the evidence below. Review it before relying on it.',
  ],
  ['fact', 'Recorded facts', 'From stored records and their labeled sources.'],
  ['calculation', 'Deterministic calculations', 'Arithmetic Ascent computed. The same inputs give the same result.'],
  ['assumption', 'Analyst assumptions', 'Inputs a professional chose. Change them to test the result.'],
  ['draft', 'Draft for your review', 'Not sent. Fill the placeholders and check every figure yourself.'],
  ['boundary', 'Limits of this answer', ''],
];

/** Shows an answer grouped by how each part is known; older responses without labels render as plain text. */
export function AnswerAnatomy({ response }: { response: AssistantResponse }) {
  if (!response.statements?.length) return <div className="answer-text">{response.answer}</div>;
  return (
    <div className="answer-anatomy">
      {groups.map(([kind, label, hint]) => {
        const items = response.statements!.filter(statement => statement.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} className={`anatomy-group anatomy-${kind}`} aria-label={label}>
            <h4>
              <i aria-hidden="true" />
              {label}
            </h4>
            {hint && <small>{hint}</small>}
            {items.map((item, index) => (
              <div className="answer-text" key={index}>
                {item.text}
                {item.refs?.length ? <code className="anatomy-refs">{item.refs.join(' · ')}</code> : null}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
