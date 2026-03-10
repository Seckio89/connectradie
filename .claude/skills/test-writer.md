---
name: test-writer
description: Write tests for ConnecTradie with Vitest + React Testing Library. Covers components, hooks, Edge Functions, RLS policies, and payment flows.
---

# Test Writer

## Stack: Vitest + React Testing Library, vi.mock() for Supabase, MSW for APIs
## Files: ComponentName.test.tsx (same dir), function-name.test.ts in __tests__/

## Priority targets:
1. Payment flows (90%+ coverage): create intent, hold, release, refund, webhooks
2. Auth (85%+): login, signup, reset, sessions, role redirects
3. Job lifecycle (80%+): post, quote, accept, complete, review
4. RLS policies: verify role access, deny cross-user, no data leaks

## Pattern: describe/it, mock supabase, test all states, fireEvent for interactions, waitFor for async
