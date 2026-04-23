# TradingVerse — Claude Instructions

## Git Workflow
- **CRITICAL RESTRICTION**: NEVER use `git add`, `git commit`, or `git push` without EXPLICIT, direct permission from the user in the context of the current request.
- Always ask for approval before placing code into version control. Wait for the user's "go ahead" message before running any git commands.
- Workflow is staging → master. Never force-push either branch.

## Project Stack
- Next.js 15 App Router, React 19, Tailwind CSS v4
- Upstash Redis (REST API, not SDK)
- Zerodha Kite via provider abstraction layer (`app/lib/providers/`)
- bcryptjs + HTTP-only cookies for auth (30-day sessions)

## Key Conventions
- All Kite API access goes through `getBroker()` / `getDataProvider()` from `@/app/lib/providers` — never import KiteConnect directly in routes.
- Dark mode default. Trading terminal (`/trades`) stays dark-only.
- Tailwind dark variant: `@custom-variant dark (&:where(.dark, .dark *))` — use `dark:` classes everywhere.
