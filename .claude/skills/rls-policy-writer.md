# RLS Policy Writer Agent

## Role
Creates and manages Row Level Security policies for Supabase/PostgreSQL tables.

## When to Invoke
- Creating new tables
- Adding RLS policies
- Debugging permission errors (400/401/403)
- Auditing existing policies

## RLS Basics

### Enable RLS on table:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

### Policy Structure:
```sql
CREATE POLICY "policy_name"
ON table_name
FOR [SELECT | INSERT | UPDATE | DELETE | ALL]
TO [authenticated | anon | public]
USING (condition)        -- For SELECT, UPDATE, DELETE
WITH CHECK (condition);  -- For INSERT, UPDATE
```

## Common Patterns

### Users own their data:
```sql
CREATE POLICY "Users can view own data"
ON table_name FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own data"
ON table_name FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own data"
ON table_name FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own data"
ON table_name FOR DELETE TO authenticated
USING (user_id = auth.uid());
```

### Multi-party access (jobs):
```sql
CREATE POLICY "Users can view relevant jobs"
ON jobs FOR SELECT TO authenticated
USING (
  client_id = auth.uid()
  OR tradie_id = auth.uid()
  OR (status = 'open' AND tradie_id IS NULL)
);
```

### Insert with participant check:
```sql
CREATE POLICY "Allow notification inserts for job participants"
ON notifications FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM jobs WHERE id = job_id AND client_id = auth.uid())
  OR EXISTS (SELECT 1 FROM quotes WHERE job_id = notifications.job_id AND tradie_id = auth.uid())
  OR user_id = auth.uid()
);
```

## ConnecTradie Tables

| Table | Owner Column | Notes |
|-------|--------------|-------|
| profiles | id | User's own profile |
| jobs | client_id, tradie_id | Both can access |
| quotes | tradie_id | Tradie owns, client can view |
| notifications | user_id | User owns |
| recurring_services | client_id, agreed_tradie_id | Both can access |
| recurring_sessions | via recurring_jobs | Join required |
| payments | via job | Job participants |

## Debugging

### Check existing policies:
```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'table_name';
```

### Test as user:
```sql
SET request.jwt.claims = '{"sub": "user-uuid-here"}';
SELECT * FROM table_name;
```

### Common errors:
- 400: Bad request (wrong column name, constraint violation)
- 401: Not authenticated
- 403: RLS policy blocking
- 404: Row not found (could be RLS hiding it)

## Performance Notes

### Avoid per-row function calls:
```sql
-- BAD: Calls auth.uid() for every row
USING (user_id = auth.uid())

-- BETTER: Use subquery or join
USING (user_id IN (SELECT auth.uid()))
```

### Consolidate policies:
Multiple PERMISSIVE policies = ALL are evaluated
Combine into single policy when possible

## Invocation
"@rls-policy-writer: [table and requirement]"
