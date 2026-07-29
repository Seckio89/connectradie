# ConnecTradie

Australian two-sided marketplace — homeowners post jobs, licensed tradies bid.
Escrow via Stripe Connect (Stripe holds funds, NOT us — AFSL compliance critical).

## Stack
- React 18 · TypeScript strict · Tailwind CSS · Vite
- Supabase: PostgreSQL + 68 Edge Functions (Deno) + RLS
- Stripe Connect escrow · Google Maps API · Sentry

## Key Directories
```
src/pages/          # 38 route pages
src/components/     # 90+ components
src/hooks/          # useAvailabilitySlots, useDashboardJobs, useToast, etc.
src/lib/            # Supabase client, notifications, analytics, email templates
src/contexts/       # AuthContext.tsx
supabase/functions/ # 68 Edge Functions
supabase/migrations/# 70+ migrations — never edit existing, always add new
```

## Edge Functions (68)
accept-and-pay · access-pin · adjust-quote-price ·
analyse-description-keywords · approve-invoice · approve-price-reduction ·
auto-confirm-sessions · auto-release-payments ·
auto-release-recurring-payouts · book-site-visit · buy-estimate-pack ·
calculate-job-fees · cancel-subscription · charge-becs-invoice ·
check-license-expiry · client-request-reduction · complete-site-visit ·
create-bonus-payment · create-checkout-session · create-job-deposit ·
create-job-payment-checkout · create-payment-session · delete-user ·
dispute-evidence-summary · estimate-quote · generate-auto-invoices ·
generate-recommendations · generate-recurring-invoice ·
generate-recurring-sessions · geofence-event · google-calendar-import ·
google-calendar-oauth · health · instant-payout · invoice-contact ·
issue-fee-invoices · mark-invoice-paid · migrate-payout-schedules ·
parse-invoice · pay-milestone · pay-price-increase · payout-reconciliation ·
process-refund · public-quote · reconcile-payments · release-escrow ·
remove-becs-payment · resolve-dispute-split · respond-to-dispute ·
send-email · send-invoice-approval-nudge · send-invoice-reminders ·
send-lead-reminders · send-recurring-reminders ·
send-scheduled-notifications · send-sms · setup-becs-payment ·
stripe-checkout · stripe-connect-account · stripe-connect-onboarding ·
stripe-identity-verification · stripe-payout-settings · stripe-webhook ·
submit-final-quote · sync-google-calendar · verify-abn · verify-license ·
verify-payment

Shared helpers live in `supabase/functions/_shared/` (not a function).

## Commands
```bash
npm run dev                        # dev server
npm run build                      # production build (vite does NOT type-check)
npm run typecheck                  # type check — run after every change
npm run test:run                   # vitest (add --no-file-parallelism if flaky)
supabase functions serve           # local edge function test
supabase functions deploy <name>   # deploy single function
supabase db push                   # apply migrations

# Regenerate DB types after any migration (writes src/types/supabase.ts):
npx supabase gen types typescript --project-id uoqygmizupdpanplpvor --schema public > src/types/supabase.ts

# Edge functions are Deno, NOT covered by npm run typecheck. Deno isn't installed
# locally; check them without installing it:
npx deno@2 check --node-modules-dir=auto supabase/functions/<name>/index.ts
```

⚠️ Do NOT use `npx tsc --noEmit` — the root tsconfig.json is solution-style
(`"files": []` + project references), so it checks NOTHING and exits 0. It has
silently passed while real bugs shipped. Always use `npm run typecheck`, which
targets tsconfig.app.json.

## Hard Rules
- Never commit .env or expose API keys
- Stripe webhooks MUST validate signatures
- Never edit existing migrations — create new ones only
- No `any` — use types from src/types/supabase.ts
- All Supabase calls in try/catch with structured errors
- Supabase inserts: safe destructuring over `as` casts
- Tailwind only — no custom CSS

## UI Patterns
- Max-width: `max-w-5xl` (ultrawide 3440×1440)
- Tabs: `border-b-2 border-warm-500 text-warm-600` active / `border-transparent text-gray-400` inactive
- Buttons: `inline-flex px-5 py-2` — never `w-full` unless explicit
- Modals: use src/components/Modal.tsx
- Status badges: `px-3 py-1 rounded-full text-xs font-medium border`
- Job lifecycle: `pending → accepted → funded → in_progress → completed`

## Large Files — Read Fully Before Editing
- src/components/JobDetailsCard.tsx — 1413 lines
- src/components/ChatDrawer.tsx — 1054 lines
- src/pages/Settings.tsx — 1190 lines
- src/pages/TradieDashboard.tsx — 1088 lines
- src/pages/Jobs.tsx — 988 lines

## Workflow: Plan → Execute → Verify → Iterate
1. Plan — read relevant files, trace full path (UI → edge fn → DB), state plan before coding
2. Execute — types first → backend → frontend, minimal changes, follow existing patterns
3. Verify — run `npm run typecheck`, fix all errors before moving on
   (NOT `npx tsc --noEmit` — see the warning above; it exits 0 without checking
   anything, and that is exactly how 239 real errors accumulated unnoticed)
   Also run `npm run check:columns` after touching any query. TypeScript CANNOT
   catch a column that doesn't exist in a `.select()`/`.update()`/`.insert()` —
   postgrest-js binds the payload to a naked generic, which erases the
   excess-property check. That gap silently shipped broken bonus payments, a
   broken price-reduction flow, a dead Google Calendar export, and ABN-less tax
   invoices. Edge functions aren't type-checked at all, so this is their only
   column-level safety net.
   Both commands are mandatory on every change — see Verification under Agent
   behaviour for how that squares with not verifying UI and copy work.
4. Iterate — if screenshot provided, compare and fix immediately

## Business Context
- HIA-aligned milestone payment templates
- Client-side escrow release (homeowner triggers, not platform)
- AUD, Australian state licensing, ABN verification
- Competitors: hipages, Airtasker, Oneflare, ServiceSeeking

---

## ConnecTradie Design System

⚠️ **Two systems are live at once during the rollout.** v2 is the target;
v1 is what most screens still render. Read "Which system applies" before
styling anything.

### Which system applies

| Situation | Use |
|---|---|
| Building a new shared primitive (Phase 2) | **v2** |
| Editing a screen already migrated to v2 (carries `ct-` classes) | **v2** |
| Editing any other existing screen | **v1** — match what's there |
| The three prioritised marketplace gaps | **v1** — they ship before the rollout reaches them |

Do not opportunistically migrate a screen while doing unrelated work. The
rollout is sequenced per primitive (Phase 2b), and a half-migrated screen
is worse than an unmigrated one.

---

## Design System v2 — target

Tokens are defined once as CSS custom properties in `src/index.css` and
mapped onto Tailwind under the `ct-` namespace. The marketing site does
not run Tailwind and consumes the same variables directly.

**Never hard-code a hex value.** The only place a colour literal may
appear is the token block in `src/index.css`. The sole exception is
PDF/print/email HTML-string generators (`LicenseCertificate.tsx`,
`InvoiceViewModal.tsx`, `Payouts.tsx`, `PaymentHistory.tsx`,
`Leads.tsx`, `JobTracking.tsx`), which render outside the DOM where CSS
variables do not resolve.

### v2 · Colour

| Token | Value | Tailwind | Meaning |
|---|---|---|---|
| `--ink` | `#07100F` | `ct-ink` | page background |
| `--ink-2` | `#0C1A17` | `ct-ink-2` | raised surface |
| `--surface` | `#0F211D` | `ct-surface` | cards |
| `--surface-2` | `#132A25` | `ct-surface-2` | hover / inset |
| `--line` | `#1B322C` | `ct-line` | borders, dividers |
| `--teal` | `#12D3B4` | `ct-teal` | primary action, money as agreed |
| `--teal-deep` | `#0A8C79` | `ct-teal-deep` | teal on light backgrounds |
| `--amber` | `#F5A524` | `ct-amber` | awaiting a human decision |
| `--rose` | `#F2617A` | `ct-rose` | error, declined, failed |
| `--paper` | `#F3F6F5` | `ct-paper` | primary text |
| `--mute` | `#7F958F` | `ct-mute` | tertiary text, meta |
| `--mute-2` | `#A9BDB8` | `ct-mute-2` | secondary text |

Tinted fills: `--teal-dim`, `--amber-dim`, `--rose-dim`. The semantic
colours never carry meaning at full strength on a surface — use the dim
form for fills, the solid form for text, icons and borders.
`--line-soft` is one step softer than `--line`, for dividers inside a card.

### v2 · The light band

The system is dark, with **one** deliberate exception: the landing page's
comparison section inverts to `--paper`. Text on that band needs its own
values — the dark-surface tokens are unreadable on it. Do not invert any
other section.

| Token | Tailwind | Use | On `--paper` |
|---|---|---|---|
| `--ink-on-paper` | `ct-ink-on-paper` | body text | 16.57:1 |
| `--mute-on-paper` | `ct-mute-on-paper` | muted text, table headers, fineprint | 4.69:1 |
| `--teal-ink` | `ct-teal-ink` | teal **text** on paper | 5.53:1 |
| `--amber-ink` | `ct-amber-ink` | amber **text** on paper | 5.09:1 |
| `--paper-2` | `ct-paper-2` | dividers on the light band | — |

`--teal-deep` keeps its non-text jobs only (hover borders on dark,
decorative rules). It measures **3.83:1** on `--paper` and fails AA for
text — use `--teal-ink` instead.

**The semantic rule is enforced, not advisory.**

- **Teal** — money moving as agreed, or the action to take.
- **Amber** — blocked on a person.
- **Rose** — failed or declined.

A component must not use a colour outside its meaning. This is what makes
a variation legible at a glance across a list of jobs. If amber starts
appearing decoratively, the signal dies. Rose exists because amber was
previously carrying both "waiting on you" and "something's wrong", which
are different states requiring different responses.

`ct-` colours support opacity modifiers (`bg-ct-teal/20`).

### v2 · Radius

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--r-xs` | 6px | `rounded-ct-xs` | chips, tags, small inline elements |
| `--r-sm` | 9px | `rounded-ct-sm` | buttons, pills, badges |
| `--r-md` | 12px | `rounded-ct-md` | inputs, selects, inline blocks, segmented controls |
| `--r-lg` | 14px | `rounded-ct-lg` | cards, tiles, list groups |
| `--r-xl` | 18px | `rounded-ct-xl` | modals, sheets, app shell |

**Nesting rule:** a nested element always steps down one level — a 9px
button inside a 14px card. Never equal to its parent, never larger. This
is what stops soft corners reading as mushy.

No arbitrary radius values. If something doesn't fit the scale, the scale
wins.

### v2 · Typography

- **Space Grotesk** (`font-ct-display`) — headings, card titles, button
  labels. Weight 600, letter-spacing −0.025em to −0.03em at display sizes.
- **Inter** (`font-sans`) — all body text, labels, form fields, help text.
- **JetBrains Mono** (`font-ct-mono`) — every dollar figure, job
  reference, date, and uppercase meta label (letter-spacing 0.1em–0.14em,
  ~10–11px).

The mono rule is not stylistic. Quotes, variations and invoices are
numeric documents, and mono makes amounts align and scan in tables —
which matters most on property manager screens with twelve properties in
view.

### v2 · Interface copy

These do as much work as the visual tokens.

1. **A button names what happens, and keeps that name.** `Release payment`
   produces a toast reading `Payment released`. Same verb through the
   whole flow.
2. **Sentence case everywhere.** Not Title Case, not ALL CAPS — except
   mono meta labels.
3. **Empty states name the next action.** Not "No data" — "When a tradie
   needs to change the scope or price, the request lands here for you to
   approve," with a button.
4. **Errors say what failed and how to fix it.** Never "Something went
   wrong." Never apologise.
5. **Name things as the user recognises them.** "Payment schedule", not
   "escrow milestone array".

### v2 · Accessibility

- Keyboard focus visible on every interactive element.
- `prefers-reduced-motion` respected.
- Body text meets WCAG AA on both `--ink` and `--surface`.
  Measured: `--mute` on `--surface` 5.25:1, on `--ink` 6.05:1, on
  `--surface-2` 4.76:1 — all pass, the last one narrowly.
- Placeholder text uses `--placeholder` (4.59:1). Do not use the
  reference file's `#4E635E`; it measures 3.00:1 and fails AA.

⚠️ **Do not lift colour literals out of the two reference HTML files.**
Both predate this contrast pass and six of their values fail AA:
`#4E635E` (3.00:1), `#98A8A5` (2.28:1), `#0A8C79` as text (3.83:1),
`#B07D12` (3.34:1), `#6B827D` (3.78:1), `#5C7772` (4.45:1). The tokens
in `src/index.css` are the corrected set and are the only source.
`connectradie-landing.html` also ships a corrupted `--line-soft`
(`#16292४`, trailing U+096A) that is silently overridden one line later.

---

## Design System v1 — legacy, being migrated

Still correct for every screen not yet migrated. Match it when editing
existing screens; do not use it for new shared primitives.

### Colours
- Primary action: teal/emerald — use Tailwind `emerald-500` (#06D6A0)
  for buttons, links, CTAs, success states, completion indicators
- Secondary: ocean blue — use Tailwind `secondary-500` (#2E86DE)
  for info panels, verification badges, in-progress/pending states,
  secondary buttons, form focus rings, job workflow states
- Background: `gray-50` for page, `white` for cards
- Text: `gray-900` headings, `gray-600` body, `gray-400` placeholder/muted
- Borders: `gray-200` only — no heavy borders
- Status badges: use existing pill pattern only
- Rule: emerald = positive/action/success, secondary = info/interactive/pending

⚠️ `tailwind.config.js` remaps Tailwind's built-in `teal`, `emerald` and
`green` ramps to #06D6A0. `teal-500` is **not** `--teal`. Do not assume
built-in Tailwind colour values.

### Layout & Spacing
- Page wrapper: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Cards: `bg-white rounded-xl shadow-sm p-6` — NOT full width unless
  it is a data table
- Card grids: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Stack spacing: `space-y-6` between sections
- NEVER use full-width cards for summary/info components —
  constrain with max-w-sm, max-w-md, or max-w-lg

### Typography
- Page title: `text-2xl font-bold text-gray-900`
- Section heading: `text-lg font-semibold text-gray-900`
- Body: `text-sm text-gray-600`
- Labels: `text-xs font-medium text-gray-500 uppercase tracking-wide`

### Buttons
- Primary: `bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2
  rounded-lg text-sm font-medium`
- Secondary: `border border-gray-200 text-gray-700 px-4 py-2
  rounded-lg text-sm font-medium hover:bg-gray-50`
- Destructive: `text-red-600 hover:text-red-700 text-sm font-medium`
- NEVER use full-width buttons unless inside a modal or mobile view

### Status Badges
- Use: `px-3 py-1 rounded-full text-xs font-medium`
- Active/success: `bg-emerald-100 text-emerald-700`
- Pending: `bg-amber-100 text-amber-700`
- Inactive/cancelled: `bg-gray-100 text-gray-600`
- Error: `bg-red-100 text-red-700`

### Empty States
- Icon (muted, medium size) + heading + subtext + ONE CTA button
- Container: `text-center py-12`
- Follow the pattern in TradieDashboard.tsx "No Active Jobs" empty state

### Cards — Size Rules
- Stats/summary cards: `max-w-xs` or `max-w-sm` — NEVER full width
- Info/alert cards: `max-w-md`
- Form cards: `max-w-lg`
- Content/list cards: full width is OK
- Usage bars/progress indicators: constrain to `max-w-sm`

### Modals
- Use existing ConfirmModal.tsx pattern
- Max width: `max-w-md`
- Always include: title, description, confirm button, cancel button

### Mobile
- All layouts must be responsive
- Stack to single column on mobile
- Touch targets minimum 44px height

### DO NOT
- Add heavy drop shadows (`shadow-lg` or above)
- Use colours outside the palette above
- Create full-width cards for summary information
- Add decorative borders or dividers unless they already exist nearby
- Use `text-base` or larger for body copy inside cards
- Invent new component patterns — reuse what exists in the codebase
- Modify sidebar or navigation styles

---

# Agent behaviour

## Scope

Deliver what was asked, at the scope intended. Make routine judgment calls
yourself, and check in only when different readings of the request would lead
to materially different work.

If the request seems mistaken or a better approach exists, say so in a sentence
and continue with the task as asked — do not quietly narrow, widen, or
transform it. Finish the whole task, and stop short of actions clearly beyond
what was asked.

Specifically:

- Work only the ticket in front of you. The feature-gap list is prioritised;
  do not fix gap 4 while implementing gap 1.
- Do not refactor adjacent code, rename things, or restructure directories
  unless that is the task.
- Do not alter visual design decisions. The "ConnecTradie Design System"
  section above is the authority on palette, type, spacing, and layout.
  Improving on it is out of scope.

## Verification

Verification means running something and reading the result. It does not mean
re-reading your own reasoning.

**Always verify, by execution, on these paths:**

- Escrow and Stripe Connect flows, payouts, platform-fee calculation
- Any migration: confirm RLS is enabled on new tables and policies match the
  table's security tier; run `supabase db diff` before committing
- Edge Function deploys: confirm the deploy succeeded and the function responds
- Auth and any query that crosses a user boundary

**Do not verify separately on:** UI components, copy changes, styling, docs,
and other non-money, non-security work. Write it and move on.

`npm run typecheck` is the exception, and it is not optional: run it after
every change, including UI, copy, and styling — and `npm run check:columns`
after any change to a query. Both are execution, not re-reading. Workflow step
3 explains what shipped the last time they were skipped. What this section
rules out is re-reading your own output and adding review passes nobody asked
for.

**Never do these:**

- Re-check or re-read your own output as a distinct step
- Spawn a subagent to review or double-check your work
- Add a "final verification pass" to a task that did not ask for one

You already catch and fix your own mistakes reliably. Instructed re-checking
compounds with that and burns tokens without improving the result.

## Subagents

Delegate only for large, genuinely independent, parallelisable tracks — a wide
multi-file investigation across the Edge Functions in `supabase/functions/`, or
competitive-intel collection across several sources.

Do not delegate work you can finish in a handful of tool calls. Do not use
subagents to verify or double-check anything. If one subagent can do the job,
use one. Keep spawn counts low; two is a lot, four needs a reason.

## Communication during a task

Before your first tool call, say in one sentence what you are about to do.

While working, give a brief update only when you find something important or
change direction — not before each step.

When you finish, lead with the outcome. Your first sentence answers "what
happened" or "what did you find." Supporting detail comes after, for readers
who want it.

## Corrections

Only correct an earlier statement when the error would change the code,
conclusions, or decisions. State the correction plainly and briefly, then
continue. For slips that change nothing, make the fix and move on without
noting it.

## Written deliverables

Match the length of any document written to disk — audit reports, competitive
analyses, migration notes, README updates — to what the task needs. Cover the
substance; do not pad with filler sections, redundant summaries, restatements
of the brief, or boilerplate headers.

A short report that a reader finishes beats a long one they skim.

## Code review and audits

When reviewing code or running an audit, report everything you find. Do not
pre-filter for severity, do not be conservative, and do not suppress findings
you judge minor.

Severity filtering and prioritisation happen in a separate pass, after the
full list exists.

## Effort

Default to `high`. Adjust deliberately:

| Work | Effort |
|---|---|
| Escrow, Stripe Connect, RLS policies, auth, payment state machines | `xhigh` |
| Multi-file features, larger refactors, end-to-end feature work | `high` |
| Component building, styling, copy, single-file edits, migration scaffolding | `low` – `medium` |
| First-pass code review (thorough pass later at higher effort) | `low` – `medium` |

Keep thinking enabled at all effort levels. Disabling it can leak tool calls
into visible text and emit internal XML tags. Thinking on at `low` effort beats
thinking off at comparable cost.

---

<!-- Keep this block as the last thing in CLAUDE.md -->

<tone_preference>
Keep outputs reasonably concise. Keep disclaimers and caveats short, and spend
most of the response on the main answer. When asked to explain something, give
a high-level summary unless an in-depth explanation is specifically requested.
</tone_preference>
