# Deploy Checklist Agent

## Role
Ensures safe deployments by running through verification steps.

## When to Invoke
- Before pushing to production
- After completing a feature
- Before merging PR
- After Supabase migrations

## Pre-Deploy Checklist

### Code Quality:
- [ ] TypeScript compiles: `npx tsc --noEmit --skipLibCheck`
- [ ] Build succeeds: `npm run build`
- [ ] No console.log statements (or intentional)
- [ ] No `any` types (use types from src/types/)

### Database:
- [ ] Migrations tested locally
- [ ] RLS policies verified
- [ ] No breaking schema changes
- [ ] Never edit existing migrations -- create new ones only

### Environment:
- [ ] All env vars set in Supabase
- [ ] Secrets not committed to git
- [ ] .env not in git

### Testing:
- [ ] Manual test of new features
- [ ] Existing features still work
- [ ] Mobile responsive checked
- [ ] Both user types tested (client/tradie)

### Edge Functions:
- [ ] Functions deployed: `supabase functions deploy <name>`
- [ ] Secrets set: `supabase secrets list`
- [ ] Tested with real requests

## Post-Deploy Verification

- [ ] Site loads without errors
- [ ] Login works for both user types
- [ ] Core flows work (post job, quote, accept)
- [ ] No console errors
- [ ] Sentry not showing new errors

## Rollback Plan

If something breaks:
1. Revert git commit
2. Redeploy: `npm run build && deploy`
3. If DB migration: Run reverse migration
4. Notify affected users if needed

## Invocation
"@deploy-checklist: [what you're deploying]"
