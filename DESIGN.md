# Design System — Quick Reference
**North Star:** "The Architectural Ledger" — premium editorial fintech, not standard SaaS.

---

## Colors & Surfaces
| Token | Hex | Use |
|---|---|---|
| `primary` | `#0037b0` | CTAs, active states, links |
| `primary_container` | `#1d4ed8` | Gradient end, hover |
| `surface` | `#f8f9ff` | Page base layer |
| `surface-container-lowest` | `#ffffff` | Cards, content blocks |
| `surface-container-low` | `#eef4ff` | Panels, sidebars |
| `surface-container` | `#e5eeff` | Wells, in-page nav |
| `surface-dim` | `#d1dbec` | Recessed areas |
| `on-surface` | `#121c28` | Financial figures (primary text) |
| `body` | `#434655` | Descriptions, secondary text |
| `secondary` | `#006c49` | Paid / Success states |
| `error` | `#ba1a1a` | Validation errors |
| `secondary_fixed` | `#6ffbbe` | Positive cash flow chips |
| `tertiary_fixed` | `#ffddb8` | Pending / warning chips |
| `outline-variant` | `#c4c5d7` | Ghost borders (20% opacity only) |

## Typography — Inter
- **Hero data** (balance, revenue): `display-lg` → tight tracking `-0.02em`
- **Section headers**: `headline-sm` (1.5rem) paired with `label-md` (0.75rem)
- **Body copy**: `body-md` in `#434655`
- **Financial figures**: always `on-surface` (`#121c28`)
- **Font weights**: Never use `font-black` (900) or `font-extrabold` (800). The maximum allowed weight is `font-bold` (700) for display/headers, and `font-semibold` (600) for subheaders/ui elements.


## Key Rules (Non-Negotiable)
1. **No 1px solid borders for sectioning** — use background color shifts instead
2. **No pure black shadows** — tint with `primary` color: `0px 12px 32px rgba(0,55,176,0.08)`
3. **No horizontal divider lines in tables/lists** — use spacing or alternating `surface-container-low` rows
4. **No generic blue** — always use `primary` (#0037b0) or `primary_container` (#1d4ed8)
5. **CTAs use gradient**: `linear-gradient(135deg, #0037b0 0%, #1d4ed8 100%)`
6. **Glassmorphism for floating elements**: `surface-container-lowest` at 70% opacity + `backdrop-filter: blur(12px)`
7. **Min touch target**: 44px height on all interactive elements
8. **Card radius**: `xl` (1.5rem); Button radius: `md` (0.75rem)

> For full component specs, do's/don'ts, and elevation details → read `.agent/DESIGN-DETAIL.md`
