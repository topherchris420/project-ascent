'use client';
import { useEffect, useRef, useState } from 'react';
import { questionBarVisible, readingIndex } from '@/lib/brief-progress';

type Question = readonly [id: string, title: string, short: string];

/**
 * The brief runs to dozens of screens on a phone, and its question links sit
 * at the top. Once they scroll away this bar takes their place: all seven
 * questions in one row, the one being read marked and kept in view. It sticks
 * inside the brief, so it leaves with the last question.
 */
export function BriefQuestionBar({ questions }: { questions: readonly Question[] }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLOListElement>(null);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const anchor = anchorRef.current;
    const section = anchor?.closest('.home-brief');
    if (!anchor || !section) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const jump = section.querySelector('.brief-jump');
      const list = section.querySelector('.brief-questions');
      if (!jump || !list) return;
      const topOffset = Number.parseFloat(getComputedStyle(anchor).top) || 0;
      const barHeight = anchor.firstElementChild?.getBoundingClientRect().height || 52;
      const tops = questions.map(([id]) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity);
      setActive(readingIndex(tops, topOffset + barHeight + window.innerHeight * 0.2));
      setVisible(
        questionBarVisible({
          jumpBottom: jump.getBoundingClientRect().bottom,
          listBottom: list.getBoundingClientRect().bottom,
          topOffset,
          barHeight,
        }),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [questions]);

  // On a narrow screen the row scrolls sideways: keep the current question centred in it.
  useEffect(() => {
    const row = rowRef.current;
    const current = row?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2;
  }, [active, visible]);

  return (
    <div ref={anchorRef} className="brief-bar-anchor">
      {/* Hidden with visibility (not display) so it can slide in and still be measured; hidden content leaves the tab order. */}
      <nav className="brief-bar" data-visible={visible || undefined} aria-label="Brief progress">
        <span className="brief-bar-count" aria-hidden="true">
          {active + 1}
          <span>/{questions.length}</span>
        </span>
        <ol ref={rowRef}>
          {questions.map(([id, title, short], index) => (
            <li key={id}>
              <a
                className="brief-bar-link"
                href={`#${id}`}
                data-index={index}
                aria-current={index === active ? 'location' : undefined}
                title={title}
              >
                {short}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
