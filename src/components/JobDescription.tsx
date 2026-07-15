// JobDescription — renders a job/quote description as a clean bulleted scope of
// work, with any site notes shown separately below. Use wherever the FULL
// description is displayed (detail views, quote pages) instead of a text blob.

import { formatDescription } from '../lib/jobDescription';

interface JobDescriptionProps {
  text: string | null | undefined;
  className?: string;
  /** Muted style for compact contexts. */
  compact?: boolean;
  /** Client-facing views: show only the scope of work, never notes/assumptions. */
  hideNotes?: boolean;
  /** Card previews: cap the scope bullets, with a "+N more" hint. */
  maxItems?: number;
}

export default function JobDescription({ text, className, compact, hideNotes, maxItems }: JobDescriptionProps) {
  const { scope: allScope, notes: parsedNotes } = formatDescription(text);
  const notes = hideNotes ? [] : parsedNotes;
  const scope = maxItems != null ? allScope.slice(0, maxItems) : allScope;
  const moreCount = maxItems != null ? allScope.length - scope.length : 0;
  if (scope.length === 0 && notes.length === 0) return null;

  return (
    <div className={className}>
      {scope.length > 0 && (
        <ul className={compact ? 'space-y-1' : 'space-y-1.5'}>
          {scope.map((item, i) => (
            <li key={i} className={`flex items-start gap-2 ${compact ? 'text-xs' : 'text-sm'} text-gray-700`}>
              <span className="mt-[0.45em] w-1.5 h-1.5 rounded-full bg-secondary-400 flex-shrink-0" />
              <span className={`leading-relaxed ${compact ? 'truncate' : ''}`}>{item}</span>
            </li>
          ))}
          {moreCount > 0 && (
            <li className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400 pl-3.5`}>+{moreCount} more…</li>
          )}
        </ul>
      )}
      {notes.length > 0 && (
        <div className={scope.length > 0 ? 'mt-3' : ''}>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Site notes</p>
          <ul className="space-y-1">
            {notes.map((n, i) => (
              <li key={i} className="text-sm text-gray-500 leading-relaxed">{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
