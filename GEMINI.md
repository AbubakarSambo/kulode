# Tari1 — AI Rules

## Stack
- `client/`: React 19, Vite, TypeScript, Tailwind CSS v4, Zustand, TanStack Query v5, React Router v7
- `api/`: NestJS, PostgreSQL (Prisma ORM), multi-tenant, RBAC, Paystack, PDFKit, Resend, Cloudinary
- `marketing/`: Astro (public pages only, no API connection)

---

## Hard Rules (No Exceptions)

1. **No new dependencies** without explicitly asking the user first. Reuse existing libraries.
2. **Zod validation** on all inputs — especially invoice forms, bank account data, and API payloads.
3. **No secrets in code** — use `.env`. Update `.env.example` when adding a new variable.
4. **Multi-tenancy** — every Prisma query on tenant data MUST include `where: { tenantId }`.
5. **Build + lint must pass** before finalizing any code change. Run in the modified component's directory.
6. **Run tests before build + lint** after any changes to a file that has a corresponding `.spec.ts` or `.test.ts`.

---

## Starting the Local Server

> [!IMPORTANT]
> When asked to start the local server (any variation of this request):
> **Immediately run this exact command. Do not check ports, read files, or ask questions first.**
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
> ```
> **Working directory:** `c:\dev_projects\Tari1`
> **Ports:** API `3003` · Client `5173` · Marketing `4321` · PostgreSQL `5433`

---

## Common Commands (Fast Path)

When asked to perform any of these tasks, run the exact command immediately — no reading, no checking first:

| Request | Command | Working Dir |
|---|---|---|
| Run build | `npm run build` | modified component dir (`api/`, `client/`, or `marketing/`) |
| Run lint / check errors | `npm run lint` | modified component dir |
| Run build + lint | `npm run build && npm run lint` | modified component dir |
| Run tests | `npm test -- --run` (or `npm test` for API) | modified component dir (`api/` or `client/`) |
| Run tests + coverage | `npm run test:cov` | `api/` only |
| Git status | `git status` | `c:\dev_projects\Tari1` |
| Git commit | `git add -A && git commit -m "<message>"` | `c:\dev_projects\Tari1` |

---

## Design Gate

> [!IMPORTANT]
> Before creating or modifying **any** frontend component, page, or layout in `client/` or `marketing/`:
> **Read `DESIGN.md` first** (colors, tokens, typography, non-negotiable rules).
> For component-level specs, elevation, and do's/don'ts → also read `.agent/DESIGN-DETAIL.md`.

---

## Pre-Task Protocol (MANDATORY)

Before writing any code or creating any files for a non-trivial task, you MUST declare:

```
Component: [client | api | marketing]
Skills loading: [list from .agent/skills/INDEX.md, or "none"]
DESIGN.md applies: [yes | no]
Build + lint will run: yes
```

Read `.agent/skills/INDEX.md` to identify the correct skills. Load only what is relevant.
Then proceed.

---

## Reference Files (read on-demand, not every message)

| File | Read when... |
|---|---|
| `DESIGN.md` | Any UI work in `client/` or `marketing/` |
| `.agent/DESIGN-DETAIL.md` | Need component specs, elevation, or do's/don'ts |
| `.agent/skills/INDEX.md` | Starting any non-trivial coding task |
| `.agent/WORKFLOWS.md` | Running servers, Git operations, or making architectural decisions |
| `.agent/SESSION-HANDOFF.md` | User pastes a handoff — read it to load session context |

