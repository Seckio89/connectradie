// FormattedNotes — render free-text notes readably: lines that start with a dash
// or bullet become proper bullet points, "Heading:" lines become subheadings, and
// everything else is a paragraph. Line breaks are preserved. Read-only.

import type { ReactNode } from 'react';

interface FormattedNotesProps {
  text: string | null | undefined;
  className?: string;
}

export default function FormattedNotes({ text, className }: FormattedNotesProps) {
  const lines = (text ?? '').split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="space-y-1.5 my-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="mt-[0.5em] w-1.5 h-1.5 rounded-full bg-secondary-400 flex-shrink-0" />
            <span className="leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { flush(String(i)); return; }
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    if (bullet) { bullets.push(bullet[1].trim()); return; }
    flush(String(i));
    if (/:$/.test(line) && line.length <= 48) {
      blocks.push(<p key={i} className="text-sm font-semibold text-gray-800 mt-2 first:mt-0">{line}</p>);
    } else {
      blocks.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>);
    }
  });
  flush('end');

  if (blocks.length === 0) return null;
  return <div className={className}>{blocks}</div>;
}
