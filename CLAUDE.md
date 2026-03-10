# ConnecTradie Project Context

## Stack
- **Frontend:** React 18, TypeScript, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, 19 Edge Functions)
- **Payments:** Stripe Connect (escrow model)
- **Dev Environment:** VS Code + Claude Code extension, local git repo

## Project Structure
```
/src
  /components    # React components
  /pages         # Route pages
  /hooks         # Custom React hooks
  /lib           # Utilities, Supabase client
  /types         # TypeScript interfaces
/supabase
  /functions     # Edge Functions (19 total)
  /migrations    # Database migrations
```

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `supabase functions serve` — Local Edge Function testing
- `supabase functions deploy <name>` — Deploy single function
- `supabase db push` — Apply migrations

## Code Conventions
- TypeScript strict mode, avoid `any`
- Named exports preferred
- Use Supabase types from `/src/types/supabase.ts`
- Tailwind for all styling, no custom CSS files
- Error handling: always wrap Supabase calls in try/catch
- For type mismatches on Supabase inserts, prefer safe destructuring over `as` casts

## Edge Functions
- Located in `/supabase/functions/`
- Use Deno runtime
- Environment variables via `Deno.env.get()`
- Stripe webhooks require signature validation

## Testing Approach
- Test critical paths: auth, payments, job lifecycle
- Run `npm test` before committing

## Important Notes
- NEVER commit `.env` or expose API keys
- Stripe webhook handlers MUST validate signatures
- Database types regenerate via `supabase gen types typescript`
- For production deploys, verify all 19 Edge Functions are deployed with correct env vars

## Workflow Loop (Plan → Execute → Verify → Iterate)

Every task MUST follow this loop:

### 1. Plan
- Read all relevant files before making changes
- Identify every file that will be affected
- For UI changes: understand the component tree and data flow
- For backend changes: trace the full request path (frontend → edge function → database)
- State your plan before writing code

### 2. Execute
- Make changes in logical order (types → backend → frontend)
- Keep changes minimal — only touch what's needed
- Follow existing patterns in the codebase (check nearby code first)
- Use trade-specific Australian context where relevant (AUD, AU standards, state licensing)

### 3. Verify
- Run `npx tsc --noEmit --skipLibCheck` after every set of changes
- Fix all TypeScript errors before moving on
- For UI: consider how it looks on ultrawide (3440x1440) — use max-w-5xl for content areas
- For data: verify Supabase column names match the actual schema

### 4. Iterate
- If the user provides a screenshot, compare against what was implemented
- Address feedback immediately — don't defer
- If something doesn't work, investigate the root cause rather than guessing

## Key Patterns
- **Tabs:** Underline style — `border-b-2 border-warm-500 text-warm-600` active, `border-transparent text-gray-400` inactive
- **Buttons:** `inline-flex` with `px-5 py-2`, never `w-full` unless explicitly needed
- **Modals:** Use `Modal` component from `src/components/Modal.tsx`
- **Status badges:** `px-3 py-1 rounded-full text-xs font-medium border` + status color
- **Job lifecycle:** `pending → accepted → funded → in_progress → completed`
- **Card max-width:** `max-w-5xl` for single-column layouts on ultrawide monitors

## Workflow Preferences
- Verify TypeScript compilation before committing
- Prefer small, focused commits with conventional commit messages
- When editing a page, always check if the same pattern exists elsewhere that needs updating
