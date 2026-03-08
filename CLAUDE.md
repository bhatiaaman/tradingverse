# TradingVerse — Claude Instructions

## Git Workflow
- **Never auto-commit or auto-push to staging or master without explicitly asking the user first.**
- Always summarise what will be committed and ask for confirmation before running `git commit` or `git push`.
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
