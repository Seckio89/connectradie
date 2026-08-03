import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

/*
  Landing page for the Google Calendar OAuth popup.

  google-calendar-oauth redirects here with ?status=ok|expired|failed once the
  consent round-trip finishes. Until 2026-08-03 this route did not exist, so
  every connect attempt — successful or not — ended on the 404 page, and the
  popup never closed itself. The dashboard polls `authWindow.closed`, so the
  tradie had to close it by hand before anything happened.

  On success the popup closes itself after a beat. On failure it stays open and
  names the next step, because a window that vanishes tells the tradie nothing
  about what went wrong.
*/

const AUTO_CLOSE_MS = 1200;

type Status = 'ok' | 'expired' | 'failed';

const COPY: Record<Status, { title: string; body: string }> = {
  ok: {
    title: 'Google Calendar connected',
    body: 'You can close this window — your calendar is syncing now.',
  },
  expired: {
    title: 'That took too long',
    body: 'The connection request timed out for security. Close this window and press the calendar button again.',
  },
  failed: {
    title: 'Google Calendar was not connected',
    body: 'Google turned down the request. Close this window and try again, making sure you allow calendar access when asked.',
  },
};

export default function CalendarConnected() {
  const [params] = useSearchParams();
  const raw = params.get('status');
  const status: Status = raw === 'ok' || raw === 'expired' ? raw : 'failed';
  const [closeBlocked, setCloseBlocked] = useState(false);

  useEffect(() => {
    if (status !== 'ok') return;
    const timer = setTimeout(() => {
      window.close();
      // window.close() is a no-op unless the window was opened by script. If the
      // tradie landed here in a normal tab, say so rather than leaving them on a
      // page that looks stuck.
      setCloseBlocked(true);
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const { title, body } = COPY[status];
  const Icon = status === 'ok' ? CheckCircle2 : status === 'expired' ? Clock : XCircle;
  const tone = status === 'ok' ? 'text-ct-teal' : status === 'expired' ? 'text-ct-amber' : 'text-ct-rose';
  const fill = status === 'ok' ? 'bg-ct-teal/[0.14]' : status === 'expired' ? 'bg-ct-amber/[0.13]' : 'bg-ct-rose/[0.13]';

  return (
    <div className="min-h-screen bg-ct-ink flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-ct-surface border border-ct-line rounded-ct-lg p-8">
        <div className={`w-14 h-14 mx-auto rounded-ct-md ${fill} inline-flex items-center justify-center`}>
          <Icon className={`w-7 h-7 ${tone}`} />
        </div>
        <h1 className="mt-5 text-xl font-ct-display font-semibold text-ct-paper">{title}</h1>
        {/* --mute-2, not --mute: this sits on a tinted panel over a card, where
            --mute drops under AA. See the contrast table in CLAUDE.md. */}
        <p className="mt-3 text-sm text-ct-mute-2">{body}</p>

        {(status !== 'ok' || closeBlocked) && (
          <button
            onClick={() => window.close()}
            className="mt-6 inline-flex px-5 py-2 bg-ct-teal text-ct-ink font-semibold rounded-ct-sm hover:brightness-110 transition-colors"
          >
            Close window
          </button>
        )}
      </div>
    </div>
  );
}
