# Kulode — Developer Workflows & Reference

> This file is the **verbose reference vault**. Read it when performing environment setup,
> Git operations, or making architectural decisions. It is NOT loaded on every message.

---

## 1. Local Development Startup

Always use the custom PowerShell script to start all services:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

**What it does automatically:**
- Removes stale PostgreSQL PID files
- Starts PostgreSQL 18 on port `5433` (local cluster: `postgres_data`)
- Opens separate `cmd.exe` windows for each service

**Service Port Map:**

| Service | Directory | Port | URL |
|---|---|---|---|
| PostgreSQL | `postgres_data/` | `5433` | — |
| NestJS API | `api/` | `3003` | http://localhost:3003 |
| Vite Client | `client/` | `5173` | http://localhost:5173 |
| Astro Marketing | `marketing/` | `4321` | http://localhost:4321 |

**Manual start (if the script fails):**
```powershell
# API
cd api && npm run start:dev

# Client
cd client && npm run dev

# Marketing
cd marketing && npm run dev
```

---

## 2. Build & Lint Verification

Run these before finalizing any code change. Fix all errors before committing.

```powershell
# API
cd api && npm run build && npm run lint

# Client
cd client && npm run build && npm run lint

# Marketing
cd marketing && npm run build
```

**Fix-on-Failure Rule:** If build/lint fails, fix the root cause and re-run. After 3 failed attempts, stop and present a Blocker Report to the user.

---

## 3. Git Workflow

1. **Branch:** Always branch off `main` or `dev`. Use conventional branch names:
   - `feat/feature-name`, `fix/bug-description`, `chore/task-name`

2. **Secrets check:** Never commit `.env` files. Use `.env.example` for documentation.

3. **Commit messages:** Follow Conventional Commits:
   ```
   feat(api): add Paystack webhook signature verification
   fix(client): resolve invoice form Zod validation error
   chore(marketing): update pricing page copy
   ```

4. **Before pushing:** Confirm build + lint pass in the modified component's directory.

---

## 4. Architectural Responsibilities (Detailed)

### `client/` — React 19 + Vite + TypeScript
- All authenticated user dashboard UI
- Client-facing invoice viewing portals
- State: Zustand for global state, TanStack Query v5 for server state
- Routing: React Router v7
- Styling: Tailwind CSS v4 — always follow `DESIGN.md`

### `api/` — NestJS + PostgreSQL + Prisma
- All business logic and data persistence
- Multi-tenancy: all queries MUST be scoped to `tenantId`
- Authentication: JWT guards, RBAC decorators
- Integrations: Paystack (payments), PDFKit (invoices), Resend (email), Cloudinary (media)
- Scheduled tasks: NestJS cron jobs

### `marketing/` — Astro
- Public-facing landing page, pricing, features, about pages
- SEO-optimized: every page needs title tags, meta descriptions, semantic HTML
- No authentication required; no connection to the API
- Keep bundle size minimal

---

## 5. Multi-Tenancy Rules

- Every Prisma query on tenant-owned data **must** include a `where: { tenantId }` clause
- Never expose data across tenant boundaries — this is a critical security requirement
- Tenant context is always derived from the authenticated JWT, never from request params

---

## 6. Environment Variables

| Variable | Used in | Description |
|---|---|---|
| `DATABASE_URL` | `api/` | PostgreSQL connection string |
| `JWT_SECRET` | `api/` | JWT signing secret |
| `PAYSTACK_SECRET_KEY` | `api/` | Paystack API key |
| `RESEND_API_KEY` | `api/` | Email service key |
| `CLOUDINARY_URL` | `api/` | Media storage |

Always update `.env.example` when adding a new variable.
