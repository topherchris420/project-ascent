'use client';

import { useId, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { DocumentRecord } from '@/lib/types';
import { date, number } from './format';

type ReviewProps = {
  document: DocumentRecord;
  readonly: boolean;
  busy: boolean;
  onAction: (type: string, values: Record<string, unknown>) => Promise<unknown>;
};

function DateReview({ document, index, readonly, busy, onAction }: ReviewProps & { index: number }) {
  const candidate = document.extractedDates[index];
  const [title, setTitle] = useState((candidate.label ?? 'Review contract date').slice(0, 150));
  const [reviewedDate, setReviewedDate] = useState(candidate.date);
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const warningId = useId();
  const corrected = reviewedDate !== candidate.date;
  const computed = candidate.basis === 'computed';
  const disabled = readonly || busy;
  return (
    <div
      className="extracted-date deadline-review"
      role="group"
      aria-label={`${candidate.label ?? 'Contract date'} ${candidate.date}`}
    >
      <div className="deadline-review-heading">
        <strong>
          {candidate.label ?? 'Unclassified contract date'} · {date(candidate.date)}
        </strong>
        <span className={`badge ${computed ? 'peach' : 'neutral'}`}>
          {computed ? 'Computed proposal' : 'Stated date'}
        </span>
      </div>
      {candidate.rule && <small className="date-rule">{candidate.rule}</small>}
      <small className="deadline-source">
        {candidate.evidence?.page ? `Source page ${candidate.evidence.page}` : 'Source text'}: “
        {candidate.evidence?.quote ?? candidate.context}”
      </small>
      {candidate.anchor && (
        <small>
          Anchor: {candidate.anchor.kind} · {candidate.anchor.date}
          {candidate.anchor.evidence.page ? ` · page ${candidate.anchor.evidence.page}` : ''}
          {' · '}“{candidate.anchor.evidence.quote}”
        </small>
      )}
      <details className="deadline-context">
        <summary>Read surrounding text</summary>
        <p>{candidate.context}</p>
      </details>
      {candidate.warnings?.length ? (
        <ul id={warningId} className="deadline-warnings">
          {candidate.warnings.map(warning => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {candidate.approved ? (
        <div className="deadline-approval">
          <span className="badge green">Added to timeline</span>
          <small>
            Reviewed date: {candidate.approvedDate ?? candidate.date}
            {candidate.approvedAt ? ` · recorded ${date(candidate.approvedAt)}` : ''}
          </small>
          {candidate.approvedDate && candidate.approvedDate !== candidate.date && (
            <small>
              Original proposal: {candidate.date}. Correction: {candidate.reviewNote}
            </small>
          )}
        </div>
      ) : (
        <form
          onSubmit={event => {
            event.preventDefault();
            void onAction('approveExtractedDate', {
              documentId: document.id,
              index,
              title,
              reviewedDate,
              reviewNote: note,
              assumptionsReviewed: acknowledged,
            });
          }}
        >
          <details className="deadline-correction">
            <summary>Edit title or correct proposed date</summary>
            <div className="form-grid">
              <label>
                Deadline title
                <input
                  required
                  maxLength={200}
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  disabled={disabled}
                />
              </label>
              <label>
                Reviewed date
                <input
                  required
                  type="date"
                  value={reviewedDate}
                  onChange={event => setReviewedDate(event.target.value)}
                  disabled={disabled}
                />
              </label>
            </div>
            <label>
              Reason for correction{corrected ? ' (required)' : ' (optional)'}
              <textarea
                maxLength={1000}
                required={corrected}
                value={note}
                onChange={event => setNote(event.target.value)}
                disabled={disabled}
              />
            </label>
          </details>
          {computed && (
            <label className="deadline-acknowledgment">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={event => setAcknowledged(event.target.checked)}
                disabled={disabled}
                aria-describedby={candidate.warnings?.length ? warningId : undefined}
              />
              <span>
                I reviewed the source, anchor date and counting assumptions, including any holiday or extension rules.
              </span>
            </label>
          )}
          <button
            className="button small"
            disabled={
              disabled || (computed && !acknowledged) || !reviewedDate || !title.trim() || (corrected && !note.trim())
            }
          >
            Review & add deadline
          </button>
        </form>
      )}
    </div>
  );
}

export function DocumentDeadlineReview(props: ReviewProps) {
  const { document } = props;
  return (
    <section className="document-row" aria-label={`Document ${document.name}`}>
      <div className="document-heading">
        <FileText size={20} />
        <div>
          <strong>{document.name}</strong>
          <small>
            {number(document.size)} bytes · Uploaded {date(document.uploadedAt)} · SHA-256{' '}
            {document.sha256.slice(0, 12)} · {document.extractedDates.length} date proposals
          </small>
        </div>
        <a className="button small" href={`/api/documents/${document.id}`}>
          <Download size={14} />
          Download
        </a>
      </div>
      {document.textExtraction && (
        <p className="fine deadline-extraction">
          Text extraction: {document.textExtraction.status} · {document.textExtraction.pagesRead}
          {document.textExtraction.totalPages ? ` of ${document.textExtraction.totalPages}` : ''} pages read.{' '}
          {document.textExtraction.warnings.join(' ')}
        </p>
      )}
      {!document.textExtraction && document.textLength === 0 && (
        <p className="fine">No machine-readable text was found; OCR is not connected.</p>
      )}
      {!document.dateAnalysis && document.extractedDates.length > 0 && (
        <p className="fine deadline-extraction">
          These saved proposals predate page-level analysis. Check the original file or upload it again to run the
          current extraction.
        </p>
      )}
      {document.dateAnalysis?.issues.length ? (
        <div className="deadline-issues" role="group" aria-label="Unresolved contract terms">
          <h3>Terms requiring manual review</h3>
          <p>
            These terms did not create a computed deadline. Read the original contract and confirm them with the
            appropriate professional.
          </p>
          <ul>
            {document.dateAnalysis.issues.map((issue, index) => (
              <li key={index}>
                <strong>{issue.message}</strong>
                {issue.evidence && (
                  <small>
                    {issue.evidence.page ? `Page ${issue.evidence.page}` : 'Source text'}: “{issue.evidence.quote}”
                  </small>
                )}
                {issue.anchors?.map((anchor, index) => (
                  <small key={index}>
                    {anchor.kind}: {anchor.date}
                    {anchor.evidence.page ? ` · page ${anchor.evidence.page}` : ''}
                  </small>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {document.extractedDates.map((_, index) => (
        <DateReview {...props} key={index} index={index} />
      ))}
      {!document.extractedDates.length && !document.dateAnalysis?.issues.length && (
        <p className="fine deadline-extraction">
          No supported date expressions were identified. Check the original file and enter any deadlines manually.
        </p>
      )}
    </section>
  );
}
