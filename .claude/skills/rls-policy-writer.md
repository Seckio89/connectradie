---
name: rls-policy-writer
description: Row Level Security policies for ConnecTradie. Multi-role access control for homeowner, tradie, and admin across all tables.
---

# RLS Policies

## Roles: homeowner (posts jobs, pays), tradie (quotes, gets paid), admin (full access)
## Naming: [table]_[role]_[action]

## Rules:
- jobs: homeowners see own, tradies see open jobs matching their trades
- quotes: tradies see own, homeowners see quotes on their jobs
- payments: own role only, service role for insert/update
- profiles: self read/edit, public can see tradie profiles
- reviews: public read, homeowners create on completed jobs

## Admin: EXISTS check on profiles.role = 'admin' for full access
## Always test: correct role succeeds, wrong role denied, no cross-user leaks
