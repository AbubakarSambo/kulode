# Kulode AI Development Rules & Guidelines

This document serves as the master rulebook and source of truth for all AI-assisted development, architecture, UI/UX styling, and deployment workflows for the Kulode multi-tenant invoicing and financial management platform.

---

## 1. Architectural Alignment

The platform consists of three main components:

- **Frontend Client (`client`)**: React 19, Vite, TypeScript, Tailwind CSS v4, Zustand, TanStack Query v5, React Router v7.
- **Backend API (`api`)**: NestJS, PostgreSQL (Prisma ORM), multi-tenant, RBAC, Paystack integration, PDF generation (PDFKit), Resend, Cloudinary.
- **Marketing Website (`marketing`)**: Astro.

**Component Rules:**
- **Client Application (`client`):** All customer dashboard interfaces, client invoicing portals, UI state management, and API queries.
- **Backend API (`api`):** Core business logic, multi-tenancy tenant isolation logic, authentication/guards, PDF invoice generation, Paystack settlement hooks, cron jobs/scheduling.
- **Marketing Website (`marketing`):** Landing pages, pricing pages, documentation, and SEO-optimized public content.

---

## 2. Operational & Security Rules

- **No Unexpected Dependencies:** Never introduce or install a new library (npm, etc.) in any package without explicitly prompting the user for approval first.
- **Reuse Existing Libraries:** Before suggesting or introducing a new library, always try to accomplish the task using the existing libraries already installed in `package.json` to prevent bloat.
- **Security Requirements:** All inputs (especially customer bank account info, metadata, and invoice forms) must be sanitized and validated using Zod. Never expose JWT secrets or Paystack keys; always use `.env` configuration.
- **Build Verification Required:** All code changes must be verified locally. They must pass build and lint checks (e.g., `npm run build` and `npm run lint` in both the `client` and `api` folders) before commits are finalized.

---

## 3. Local Development Startup

To run the local server workspace, always execute the custom startup script. Due to default Windows execution policy restrictions, use the command below to run the PowerShell automation script:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

This script automatically handles:
- Checking and cleaning stale PostgreSQL PID files.
- Launching PostgreSQL on port `5433` using the local cluster `postgres_data`.
- Launching the NestJS API server on port `3003`.
- Launching the Vite Client application on port `5173`.
- Launching the Astro Marketing landing page on port `4321`.

---

## 4. UI/UX Design System & Styleguide

> [!IMPORTANT]
> **CRITICAL AI INSTRUCTION: `DESIGN.md` IS THE MASTER SOURCE OF TRUTH FOR STYLING.**
> Before creating or modifying any frontend component, page, or layout, you **MUST** read and adhere to `DESIGN.md` in the project root. It governs our **"Professional Ledger Elegance"** design tokens, HSL colors, typography scales (Plus Jakarta Sans), 44px minimum target heights, and the Pre-Delivery Checklist.

---

## 5. Continuous Delivery & Git Workflow

Follow this systematic Git process:
1. **Checkout from dev:** Always branch off the default `main` / `dev` branch.
2. **Secure Quality:** Ensure no secrets are committed. Use `.env.example`.
3. **Automated Self-Correction Loop (Fix-on-Failure):**
   - Run the build/lint commands in the modified component directory.
   - If a compile or test fails, analyze the error logs, fix the root cause, and re-run.
   - If unresolved after 3 attempts, stop and present a Blocker Report.
4. **Commits:** Create clear, conventional commit messages.

---

## 6. Agent Skills Reference

A curated subset of agent skills is available in `.agent/skills/`. Load the relevant `SKILL.md` file into context **on-demand** when working on tasks in those domains. Do not pre-load all skills.

### ⚛️ Frontend
| Skill | Path | Scenario / When to Use |
|---|---|---|
| `react-best-practices` | `.agent/skills/react-best-practices/SKILL.md` | React 19 component design, hooks, patterns |
| `react-state-management` | `.agent/skills/react-state-management/SKILL.md` | Global/local state management with Zustand |
| `tailwind-design-system` | `.agent/skills/tailwind-design-system/SKILL.md` | Tailwind CSS v4 design tokens and layouts |
| `tanstack-query-expert` | `.agent/skills/tanstack-query-expert/SKILL.md` | Caching, mutations, optimistic updates |

### ⚙️ Backend & Database
| Skill | Path | Scenario / When to Use |
|---|---|---|
| `nestjs-expert` | `.agent/skills/nestjs-expert/SKILL.md` | NestJS controllers, services, guards, interceptors |
| `prisma-expert` | `.agent/skills/prisma-expert/SKILL.md` | Prisma schema changes, database seeding, querying |
| `postgresql-optimization` | `.agent/skills/postgresql-optimization/SKILL.md` | Indexing, complex queries, connection pooling |
| `zod-validation-expert` | `.agent/skills/zod-validation-expert/SKILL.md` | DTO and request payload validation schema design |

### 🔐 Security & Operations
| Skill | Path | Scenario / When to Use |
|---|---|---|
| `api-security-best-practices`| `.agent/skills/api-security-best-practices/SKILL.md` | API hardening, rate limiting, JWT token hygiene |
| `security-audit` | `.agent/skills/security-audit/SKILL.md` | Code review for safety before finalizing changes |
| `systematic-debugging` | `.agent/skills/systematic-debugging/SKILL.md` | Structural troubleshooting of complex issues |

### 🎨 Design & Experience
| Skill | Path | Scenario / When to Use |
|---|---|---|
| `ui-ux-designer` | `.agent/skills/ui-ux-designer/SKILL.md` | Component styling checks, fintech visual hierarchy |
| `ui-ux-pro-max` | `.agent/skills/ui-ux-pro-max/SKILL.md` | Micro-interactions, typography, visual polish |

### ⚖️ Regulatory & Compliance
| Skill | Path | Scenario / When to Use |
|---|---|---|
| `nigerian-compliance-nfiu-scuml` | `.agent/skills/nigerian-compliance-nfiu-scuml/SKILL.md` | Threshold monitoring, KYC, and CTR/STR reports for NFIU & SCUML |
| `nigerian-tax-filing-compliance` | `.agent/skills/nigerian-tax-filing-compliance/SKILL.md` | Calculations for VAT, WHT (2024 regulations), CIT, and e-filing with FIRS |


