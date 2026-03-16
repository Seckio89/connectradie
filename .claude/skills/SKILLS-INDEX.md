# ConnecTradie Agent Skills Index

## Available Agents

| Agent | Purpose | Invoke With |
|-------|---------|-------------|
| @product-advisor | Evaluate features before building | "@product-advisor: [feature idea]" |
| @task-router | Break down complex tasks | "@task-router: [complex request]" |
| @component-builder | Create React components | "@component-builder: [component spec]" |
| @edge-function-deployer | Create/deploy edge functions | "@edge-function-deployer: [function need]" |
| @rls-policy-writer | Write RLS policies | "@rls-policy-writer: [table + requirement]" |
| @test-writer | Create verification tests | "@test-writer: [feature to test]" |
| @deploy-checklist | Pre-deploy verification | "@deploy-checklist: [what deploying]" |

## Workflow

### For New Features:
1. @product-advisor -> Evaluate if worth building
2. @task-router -> Break into subtasks
3. @component-builder / @edge-function-deployer -> Build
4. @rls-policy-writer -> Add security policies
5. @test-writer -> Verify
6. @deploy-checklist -> Ship

### For Bug Fixes:
1. Reproduce issue
2. @task-router -> Identify root cause
3. Fix
4. @test-writer -> Verify fix
5. @deploy-checklist -> Ship

### For Database Changes:
1. Create migration file
2. @rls-policy-writer -> Add policies
3. Test locally
4. @deploy-checklist -> Ship

## Quick Commands

Start a session:
"Read CLAUDE.md and the skills in .claude/skills/ before starting"

Evaluate a feature:
"@product-advisor: Should we add [X]?"

Complex task:
"@task-router: I need to [complex requirement]"

Build UI:
"@component-builder: Create a [component description]"

Ship it:
"@deploy-checklist: Ready to deploy [feature]"
