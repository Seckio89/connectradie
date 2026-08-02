import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  MilestoneList,
  VariationBlock,
  VariationAction,
  VariationAmount,
  Pill,
  buttonClasses,
  cx,
  META,
} from '../ui';

/**
 * Landing page, rebuilt from connectradie-landing.html (Phase 4).
 *
 * Structure and copy are approved — they match the reference. The three
 * deliberate constraints from the brief:
 *
 * 1. The audience switch is functional, not decorative. Three views rewrite
 *    the hero headline, sub-head, CTA label and the job card's framing —
 *    same job, three perspectives.
 * 2. The hero card is the signature element: two milestones released, one
 *    held, one amber variation pending. Everything else stays quiet around
 *    it. It is built from MilestoneList and VariationBlock — the same
 *    primitives the app's job detail uses, which is the whole point.
 * 3. No background animation. Considered and rejected in the brief.
 *
 * The comparison section is the system's ONE light band. Text on it uses the
 * AA-corrected on-paper tokens, not the reference file's literals — six of
 * those fail WCAG AA (see CLAUDE.md), and this section carries the
 * competitor comparison and its ACL disclaimer.
 *
 * Navbar/Footer are page-local here: the shared Navbar/Footer components
 * serve three other public pages and are not touched by this rebuild.
 */

type Audience = 'owner' | 'tradie' | 'pm';

interface VariationCopy {
  pre: string;
  amountCents: number;
  post: string;
}

interface AudienceView {
  head: [string, string];
  lede: string;
  cta: string;
  ctaHref: string;
  pill: string;
  totalLabel: string;
  varBody: VariationCopy;
  foot: string;
  actions: Array<{ label: string; primary?: boolean }>;
}

// Same job, three lenses — copy verbatim from the approved reference.
const VIEWS: Record<Audience, AudienceView> = {
  owner: {
    head: ["The bathroom's $14,000.", "Don't pay it all up front."],
    lede: 'Post the job, compare quotes from licensed tradies, then release payment in stages as the work is finished. If the scope changes, it gets agreed in writing before anyone picks up a tool.',
    cta: 'Post a job — free',
    ctaHref: '/register?type=client',
    pill: 'In progress',
    totalLabel: 'Held safely until jobs complete',
    varBody: {
      pre: 'Rot found in the subfloor during strip-out. Replace bearer and re-sheet before waterproofing — ',
      amountCents: 120000,
      post: ', adds 2 days.',
    },
    foot: 'Nothing moves until you approve it',
    actions: [{ label: 'Approve variation', primary: true }, { label: 'Ask a question' }],
  },
  tradie: {
    head: ['Found rot in the subfloor?', 'Bill for it properly.'],
    lede: "Quote without paying a lead fee. The client funds the job before you start, so the money's already there — and when the scope changes, you raise a variation instead of having an awkward conversation and eating the cost.",
    cta: 'Join as a tradie',
    ctaHref: '/register?type=tradie',
    pill: 'Awaiting client',
    totalLabel: 'Funded by client',
    varBody: {
      pre: "You've requested ",
      amountCents: 120000,
      post: " and 2 extra days for the subfloor repair. Sent to the client 14 minutes ago — work stays paused until it's approved.",
    },
    foot: 'Approved variations are locked to the job',
    actions: [{ label: 'Send reminder' }, { label: 'Edit request' }],
  },
  pm: {
    head: ['Twelve properties.', 'One approval trail.'],
    lede: 'Route maintenance to your preferred tradies, set the spend threshold that triggers your sign-off, and give owners a record of every quote, variation and payment — per property, without rebuilding it at month-end.',
    cta: 'Set up your portfolio',
    ctaHref: '/register?type=client',
    pill: 'Needs approval',
    totalLabel: 'Committed against 14 Rowe St',
    varBody: {
      pre: 'Variation exceeds the $1,000 threshold for this property. ',
      amountCents: 120000,
      post: ' — held for portfolio manager sign-off before work resumes.',
    },
    foot: 'Logged against the property and the owner report',
    actions: [{ label: 'Approve and notify owner', primary: true }, { label: 'Decline' }],
  },
};

const MILESTONES = [
  { id: 'strip-out', label: 'Strip-out and waste removal', amountCents: 240000, state: 'released' as const },
  { id: 'rough-in', label: 'Rough-in and waterproofing', amountCents: 510000, state: 'released' as const },
  { id: 'tiling', label: 'Tiling and fit-off', amountCents: 670000, state: 'held' as const },
];

/** Mono eyebrow with the leading rule, per the reference. */
function Eyebrow({ children, onPaper = false, center = false }: { children: string; onPaper?: boolean; center?: boolean }) {
  const tone = onPaper ? 'text-ct-teal-ink' : 'text-ct-teal';
  const rule = onPaper ? 'bg-ct-teal-ink' : 'bg-ct-teal';
  return (
    <p className={cx('font-ct-mono text-[11px] font-medium uppercase tracking-[0.16em] mb-4 flex items-center gap-2.5', tone, center && 'justify-center')}>
      <span aria-hidden="true" className={cx('inline-block h-px w-[22px] flex-none', rule)} />
      {children}
    </p>
  );
}

export default function LandingV2() {
  const { user } = useAuth();
  const [audience, setAudience] = useState<Audience>('owner');
  const view = VIEWS[audience];
  const postJobHref = user ? '/dashboard' : '/register?type=client';

  return (
    <div className="bg-ct-ink text-ct-paper font-sans overflow-x-hidden">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-ct-ink/85 backdrop-blur-md border-b border-ct-line">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)] flex items-center gap-7 h-[62px]">
          <Link to="/" className="font-ct-display text-lg font-bold tracking-tight whitespace-nowrap">
            Connec<span className="text-ct-teal">Tradie</span>
            <sup className="text-[9px] text-ct-mute ml-0.5 font-sans">™</sup>
          </Link>
          <div className="hidden md:flex gap-6 ml-auto text-sm text-ct-mute-2">
            <a href="#difference" className="py-1.5 border-b border-transparent hover:text-ct-paper hover:border-ct-teal transition-colors">How it works</a>
            <a href="#difference" className="py-1.5 border-b border-transparent hover:text-ct-paper hover:border-ct-teal transition-colors">What's different</a>
            <a href="#compare" className="py-1.5 border-b border-transparent hover:text-ct-paper hover:border-ct-teal transition-colors">Compare</a>
            <a href="#tradies" className="py-1.5 border-b border-transparent hover:text-ct-paper hover:border-ct-teal transition-colors">For tradies</a>
            <a href="#managers" className="py-1.5 border-b border-transparent hover:text-ct-paper hover:border-ct-teal transition-colors">Property managers</a>
          </div>
          <Link to={postJobHref} className={cx(buttonClasses('primary', 'sm'), 'ml-auto md:ml-0 whitespace-nowrap')}>
            Post a job
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="relative pt-[clamp(44px,7vw,86px)] overflow-hidden">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)]">
          <div className="grid lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)] gap-[clamp(28px,4.6vw,68px)] items-end">
            <div className="pb-[clamp(40px,6vw,96px)] max-lg:pb-3">
              {/* Audience switch — functional, not decorative. */}
              <div
                role="group"
                aria-label="Choose your view"
                className="inline-flex max-sm:flex max-sm:w-full gap-0.5 rounded-ct-md border border-ct-line bg-ct-ink-2 p-[3px]"
              >
                {([
                  ['owner', 'I need work done'],
                  ['tradie', "I'm a tradie"],
                  ['pm', 'I manage property'],
                ] as Array<[Audience, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={audience === value}
                    onClick={() => setAudience(value)}
                    className={cx(
                      META,
                      'px-3.5 py-2 rounded-ct-xs whitespace-nowrap transition-colors max-sm:flex-1 max-sm:px-1.5 max-sm:text-[10px]',
                      audience === value
                        ? 'bg-ct-teal text-ct-ink font-bold'
                        : 'text-ct-mute hover:text-ct-paper',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <h1 className="font-ct-display font-semibold tracking-[-0.03em] leading-[1.04] text-[clamp(38px,6.4vw,74px)] mt-5">
                {view.head[0]}
                <em className="not-italic text-ct-teal block">{view.head[1]}</em>
              </h1>
              <p className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ct-mute-2 max-w-[53ch] mt-5">
                {view.lede}
              </p>

              <div className="flex flex-wrap gap-3 mt-8">
                <Link to={user ? '/dashboard' : view.ctaHref} className={buttonClasses('primary')}>
                  {view.cta}
                </Link>
                <a href="#difference" className={buttonClasses('ghost')}>
                  See how it works
                </a>
              </div>
            </div>

            {/* Signature: a real job, mid-flight. Same primitives as the app. */}
            <div
              aria-label="Example job in progress"
              className="bg-ct-surface border border-ct-line rounded-ct-xl shadow-[0_30px_70px_-30px_rgba(0,0,0,0.85)] lg:translate-y-[clamp(0px,3vw,34px)] max-lg:mb-8"
            >
              <div className="flex items-center justify-between gap-3.5 px-5 py-4 border-b border-ct-line">
                <div>
                  <div className={cx(META, 'text-ct-mute tracking-[0.08em]')}>JOB #CT-4471 · MOSMAN NSW</div>
                  <div className="font-ct-display font-semibold tracking-tight mt-1">Main bathroom renovation</div>
                </div>
                <Pill tone={audience === 'owner' ? 'teal' : 'amber'}>{view.pill}</Pill>
              </div>

              <div className="flex items-baseline justify-between px-5 py-4 border-b border-ct-line">
                <span className={cx(META, 'text-ct-mute tracking-[0.08em]')}>{view.totalLabel}</span>
                <strong className="font-ct-mono text-2xl font-bold tracking-tight">$14,200</strong>
              </div>

              <div className="px-5 pt-1.5 pb-3.5">
                <MilestoneList milestones={MILESTONES} />
              </div>

              <div className="mx-3.5 mb-3.5">
                <VariationBlock
                  actions={view.actions.map((a) => (
                    <VariationAction key={a.label} primary={a.primary}>
                      {a.label}
                    </VariationAction>
                  ))}
                >
                  <p>
                    {view.varBody.pre}
                    <VariationAmount amountCents={view.varBody.amountCents} />
                    {view.varBody.post}
                  </p>
                </VariationBlock>
              </div>

              <div className={cx(META, 'flex justify-between gap-2.5 flex-wrap px-5 py-3 border-t border-ct-line text-ct-mute tracking-[0.05em] normal-case')}>
                <span>{view.foot}</span>
                <span>ABN &amp; licence verified</span>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="flex flex-wrap border-y border-ct-line mt-[clamp(34px,5vw,66px)]">
            {[
              ['Licence checked', 'Verified before quoting'],
              ['Staged payments', 'Released per milestone'],
              ['Scope in writing', 'Variations approved in-app'],
              ['Clear cancellation', 'Terms set before you start'],
            ].map(([title, sub], i, arr) => (
              <div key={title} className={cx('flex-1 basis-[190px] px-5 py-4', i < arr.length - 1 && 'sm:border-r border-ct-line')}>
                <b className="block font-ct-display text-[15px] font-semibold text-ct-paper mb-0.5">{title}</b>
                <span className={cx(META, 'text-ct-mute tracking-[0.08em]')}>{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Difference ──────────────────────────────────────────────────── */}
      <section id="difference" className="py-[clamp(64px,9vw,120px)]">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)]">
          <div className="max-w-[60ch] mb-[clamp(34px,4.6vw,58px)]">
            <Eyebrow>Funded → Varied → Released</Eyebrow>
            <h2 className="font-ct-display font-semibold tracking-[-0.03em] leading-tight text-[clamp(30px,4.4vw,50px)] mb-4">
              Built for jobs that take weeks, not afternoons.
            </h2>
            <p className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ct-mute-2">
              Task marketplaces pay in one lump at the end. That works for flat-pack assembly.
              It falls apart on a job with three trades, a five-week timeline and a subfloor
              nobody knew was rotten.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            {[
              {
                span: 'lg:col-span-3', tag: true, title: 'Milestone payments, not one lump sum',
                body: 'Split the job into stages both sides agree on. The client funds the whole job up front so the tradie knows the money is real — but it releases stage by stage as work is signed off. Nobody carries the whole risk.',
              },
              {
                span: 'lg:col-span-3', tag: true, title: 'Scope changes handled properly',
                body: "The tradie raises a variation in-app with a price and a time impact. The client approves or asks a question. It's recorded against the job before the work happens — so it isn't a difficult phone call and a disputed invoice three weeks later.",
              },
              {
                span: 'lg:col-span-2', tag: false, title: 'Guided job briefs',
                body: 'Trade-specific prompts, so a quote request for a rewire asks the questions a sparky actually needs answered.',
              },
              {
                span: 'lg:col-span-2', tag: false, title: 'Licence and insurance on file',
                body: 'Checked before a tradie can quote, with expiry tracked. Not a badge someone typed in themselves.',
              },
              {
                span: 'lg:col-span-2', tag: false, title: 'Cancellation you agree in advance',
                body: 'Both sides see the terms before the job starts. No penalty invented after the fact.',
              },
            ].map((tile) => (
              <div
                key={tile.title}
                className={cx(
                  'border border-ct-line rounded-ct-lg p-6 bg-gradient-to-br from-ct-ink-2 to-ct-ink',
                  'transition-[border-color,transform] duration-200 hover:border-ct-teal-deep hover:-translate-y-0.5',
                  tile.span,
                )}
              >
                {tile.tag && (
                  <span className={cx(META, 'inline-block text-ct-teal border border-ct-teal/30 bg-ct-teal/[0.14] px-2 py-1 rounded-ct-xs mb-3.5 tracking-[0.11em] text-[9.5px]')}>
                    Only here
                  </span>
                )}
                <h3 className={cx('font-ct-display font-semibold tracking-tight mb-2.5', tile.tag ? 'text-[clamp(21px,2.3vw,27px)]' : 'text-[clamp(19px,2vw,23px)]')}>
                  {tile.title}
                </h3>
                <p className={cx('leading-relaxed text-ct-mute-2', tile.tag ? 'text-[15.5px]' : 'text-[14.5px]')}>{tile.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compare — the system's ONE light band ───────────────────────── */}
      <section id="compare" className="py-[clamp(64px,9vw,120px)] bg-ct-paper text-ct-ink-on-paper">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)]">
          <div className="max-w-[60ch] mb-[clamp(34px,4.6vw,58px)]">
            <Eyebrow onPaper>Where we actually differ</Eyebrow>
            <h2 className="font-ct-display font-semibold tracking-[-0.03em] leading-tight text-[clamp(30px,4.4vw,50px)] mb-4">
              An honest comparison.
            </h2>
            <p className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ct-mute-on-paper">
              Plenty of platforms hold your money until a job's done — that part isn't new,
              and we're not going to pretend it is. The difference shows up on jobs big
              enough to have stages and surprises.
            </p>
          </div>

          {/* The table concedes what competitors also do. Do not "improve" it —
              an inaccurate comparison is misleading conduct under the ACL. */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14.5px] mt-2 max-md:text-[13px]">
              <thead>
                <tr>
                  {['Feature', 'ConnecTradie', 'Task marketplaces', 'Lead-fee directories'].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={cx(
                        META,
                        'text-left px-3.5 py-4 border-b-[1.5px] border-ct-ink-on-paper tracking-[0.11em] text-[10.5px] font-medium',
                        i === 0 && 'w-[38%]',
                        i === 1 ? 'text-ct-teal-ink font-bold bg-ct-teal-deep/[0.07] border-l-2 border-l-ct-teal-deep' : 'text-ct-mute-on-paper',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['Funds held until work is done', ['yes', 'Yes'], ['yes', 'Yes'], ['no', 'No']],
                  ['Tradies pay per lead to quote', ['yes', 'Never'], ['yes', 'No'], ['no', 'Yes']],
                  ['Payment released in stages', ['yes', 'Yes'], ['no', 'One lump at completion'], ['no', 'Not applicable']],
                  ['In-app scope variation requests', ['yes', 'Yes'], ['no', 'Handled between you'], ['no', 'No']],
                  ['Trade-specific guided briefs', ['yes', 'Yes'], ['no', 'Generic task form'], ['part', 'Varies']],
                  ['Licence & insurance verified', ['yes', 'Before quoting'], ['part', 'Varies'], ['part', 'Varies']],
                  ['Multi-property management tier', ['yes', 'Yes'], ['no', 'No'], ['no', 'No']],
                ] as Array<[string, [string, string], [string, string], [string, string]]>).map(([feature, us, task, lead]) => {
                  const toneCls = (t: string) =>
                    t === 'yes' ? 'text-ct-teal-ink font-bold' : t === 'part' ? 'text-ct-amber-ink' : 'text-ct-mute-on-paper';
                  return (
                    <tr key={feature}>
                      <td className="px-3.5 py-4 border-b border-ct-paper-2 font-medium">{feature}</td>
                      <td className={cx('px-3.5 py-4 border-b border-ct-paper-2 bg-ct-teal-deep/[0.07] border-l-2 border-l-ct-teal-deep', toneCls(us[0]))}>{us[1]}</td>
                      <td className={cx('px-3.5 py-4 border-b border-ct-paper-2', toneCls(task[0]))}>{task[1]}</td>
                      <td className={cx('px-3.5 py-4 border-b border-ct-paper-2', toneCls(lead[0]))}>{lead[1]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[12.5px] text-ct-mute-on-paper mt-4 max-w-[72ch] leading-relaxed">
            Comparison reflects publicly documented features of category competitors at the time
            of writing, grouped by business model rather than named individually. Features change —
            check current terms before deciding.
          </p>
        </div>
      </section>

      {/* ── Tradies ─────────────────────────────────────────────────────── */}
      <section id="tradies" className="py-[clamp(64px,9vw,120px)] bg-ct-ink-2 border-y border-ct-line">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)] grid lg:grid-cols-2 gap-[clamp(30px,5vw,72px)] items-center">
          <div>
            <Eyebrow>For tradies</Eyebrow>
            <h2 className="font-ct-display font-semibold tracking-[-0.03em] leading-tight text-[clamp(30px,4.4vw,50px)]">
              Get paid for the extra work. In writing. Before you do it.
            </h2>
            <p className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ct-mute-2 mt-4">
              Every tradie knows the job where the scope crept, the client swore they never
              agreed to it, and you ate the difference to keep the peace. That's the problem
              we built the platform around.
            </p>
            <blockquote className="border-l-2 border-ct-teal pl-5 py-1 my-6 text-base leading-relaxed text-ct-mute-2">
              Scope bait is the whole game on those sites. You quote one thing, turn up to
              another, and there's no record of what was agreed.
              <cite className={cx(META, 'block not-italic text-ct-mute mt-2.5 tracking-[0.08em]')}>
                Recurring theme — tradie feedback on existing platforms
              </cite>
            </blockquote>
          </div>

          <ul className="grid gap-px bg-ct-line border border-ct-line rounded-ct-lg overflow-hidden list-none m-0 p-0">
            {[
              ['01', 'Quote without paying for the privilege.', "No lead fees, ever. You don't pay to find out a job isn't real."],
              ['02', "The money's already there.", 'The client funds the job before you start. No chasing an invoice for six weeks.'],
              ['03', 'Raise a variation in thirty seconds.', 'Price it, add the time impact, send it. Approved in-app, recorded against the job.'],
              ['04', 'Get paid per stage.', 'Finish the rough-in, get paid for the rough-in. Cash flow that matches the work.'],
              ['05', 'Cancellation terms you saw first.', 'Agreed before the job, not applied to you afterwards.'],
            ].map(([num, strong, rest]) => (
              <li key={num} className="bg-ct-ink px-5 py-4 flex gap-3.5 items-start">
                <b className="font-ct-mono text-[11px] text-ct-teal tracking-[0.08em] flex-none pt-[3px] w-6">{num}</b>
                <span className="text-[14.5px] text-ct-mute-2 leading-relaxed">
                  <strong className="text-ct-paper font-semibold">{strong}</strong> {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Property managers ───────────────────────────────────────────── */}
      <section id="managers" className="py-[clamp(64px,9vw,120px)]">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)]">
          <div className="max-w-[60ch] mb-[clamp(34px,4.6vw,58px)]">
            <Eyebrow>For property managers</Eyebrow>
            <h2 className="font-ct-display font-semibold tracking-[-0.03em] leading-tight text-[clamp(30px,4.4vw,50px)] mb-4">
              Twelve properties, one panel of tradies, one audit trail.
            </h2>
            <p className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ct-mute-2">
              Maintenance across a portfolio is the same three problems repeated: finding
              someone available, approving the spend, and proving to the owner what was
              actually done and why.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3.5">
            {[
              ['01', 'Your preferred tradies, per trade', "Build a panel you trust and route jobs to them first, with the open marketplace as backup when nobody's free."],
              ['02', 'Approval thresholds that hold', 'Variations above your limit stop and wait for sign-off. Below it, work continues. The owner sees the same trail you do.'],
              ['03', 'Owner reporting that writes itself', 'Every job, quote, variation and release recorded per property. Month-end stops being a reconstruction exercise.'],
            ].map(([num, title, body]) => (
              <div key={num} className="border border-ct-line rounded-ct-lg p-5 bg-ct-ink-2">
                <span className="block font-ct-mono text-[11px] text-ct-teal tracking-[0.1em] mb-3">{num}</span>
                <h4 className="font-ct-display text-[15px] font-semibold tracking-tight mb-2">{title}</h4>
                <p className="text-sm text-ct-mute-2 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ───────────────────────────────────────────────────────── */}
      <section className="py-[clamp(64px,9vw,120px)] text-center border-t border-ct-line">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)]">
          <Eyebrow center>Ready when you are</Eyebrow>
          <h2 className="font-ct-display font-semibold tracking-[-0.03em] leading-tight text-[clamp(30px,4.4vw,50px)] max-w-[19ch] mx-auto mb-4">
            Post the job. See who's licensed. Pay as it gets done.
          </h2>
          <p className="text-[clamp(16px,1.6vw,19px)] leading-relaxed text-ct-mute-2">
            Free to post. No obligation to hire anyone.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <Link to={postJobHref} className={buttonClasses('primary')}>Post a job</Link>
            <Link to={user ? '/dashboard' : '/register?type=tradie'} className={buttonClasses('ghost')}>Join as a tradie</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ct-line py-6 text-[13px] text-ct-mute">
        <div className="max-w-[1240px] mx-auto px-[clamp(20px,4vw,64px)] flex flex-wrap gap-4 items-center justify-between">
          <span>© ConnecTradie™ · Australia</span>
          <div className="flex gap-5 flex-wrap">
            <Link to="/terms" className="hover:text-ct-paper transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-ct-paper transition-colors">Privacy</Link>
            <Link to="/contact" className="hover:text-ct-paper transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
