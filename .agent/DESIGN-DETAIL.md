# Design System — Full Detail Reference

> Read this file when you need: component-level specs, elevation guidelines, full do's/don'ts,
> or validation state details. Load on-demand — not at the start of every UI task.

---

## Color & Surface Philosophy

The palette is anchored by a deep, authoritative blue (`primary: #0037b0`) and supported by
a sophisticated range of neutral surfaces that provide "breathing room" for complex financial figures.

### The "No-Line" Rule
**1px solid borders are prohibited for sectioning.** Structural boundaries must be defined
exclusively through background color shifts. A side panel uses `surface-container-low` (#eef4ff)
sitting naturally against a `surface` (#f8f9ff) background.

### Surface Hierarchy & Nesting
Treat the UI as stacked physical layers — like sheets of fine vellum paper:
- **Base Layer:** `surface` (#f8f9ff)
- **Content Blocks:** `surface-container-lowest` (#ffffff) — maximum pop and clarity
- **In-Page Navigation/Wells:** `surface-container` (#e5eeff) or `surface-dim` (#d1dbec) — recessed areas

### The "Glass & Gradient" Rule
- **Glassmorphism** for floating elements (toasts, mobile navbars):
  `surface-container-lowest` at 70% opacity + `backdrop-filter: blur(12px)`
- **Signature Gradient** for primary CTAs:
  `linear-gradient(135deg, #0037b0 0%, #1d4ed8 100%)`

---

## Typography: The Editorial Scale

Font: **Inter** — used as a precision instrument, not a default.

| Scale | Size | Use |
|---|---|---|
| `display-lg` to `display-sm` | Hero | Total balance, monthly revenue — tight tracking (-0.02em) |
| `headline-sm` | 1.5rem | Section headers — pair with `label-md` for contrast density |
| `label-md` | 0.75rem | Data labels next to headline-sm |
| `body-md` | base | General descriptions — color `#434655` |
| Financial figures | any | Always use `on-surface` (#121c28) — keep them focal |

---

## Elevation & Depth

### Tonal Layering (Preferred)
Avoid shadows where color shifts can do the work. A `surface-container-lowest` card on a
`surface-container-low` background creates a "soft lift" that feels architectural and modern.

### Ambient Shadows (Floating elements only)
- **Value:** `0px 12px 32px rgba(0, 55, 176, 0.08)`
- **Rule:** Never use pure black shadows — tint with `primary` to mimic natural refracted light.

### The "Ghost Border" Fallback
For accessibility in high-contrast states only:
- Token: `outline-variant` (#c4c5d7) at **20% opacity**
- It should be felt, not seen.

---

## Component Specifications

### Buttons
| Type | Style |
|---|---|
| **Primary** | Gradient fill (`#0037b0` → `#1d4ed8`), `md` radius (0.75rem), white text, inner-glow on hover |
| **Secondary** | Transparent bg, Ghost Border (`outline-variant` 20%), text color `primary` |
| **Min height** | 44px on all interactive elements |

### Dashboard Cards
- Corner radius: `xl` (1.5rem) — "friendly yet secure"
- Background: `surface-container-lowest` (#ffffff)
- Shadow: Ambient shadow only — `0px 12px 32px rgba(0,55,176,0.08)`

### Input Fields & Validation
- Background: `surface-container-lowest`
- Border: `outline-variant` at 40% opacity (default state)
- **Error state:** border → `error` (#ba1a1a) + subtle `error_container` glow
- **Success/Paid state:** border/icon → `secondary` (#006c49)

### Lists & Tables (The Financial Core)
- **Forbidden:** Horizontal divider lines
- **Use instead:** `spacing-3` (1rem) or `spacing-4` (1.4rem) row gaps,
  OR alternating row tints with `surface-container-low`

### Transaction Chips
- Positive cash flow: `secondary_fixed` (#6ffbbe), radius `full` (9999px)
- Pending / warning: `tertiary_fixed` (#ffddb8), radius `full` (9999px)

---

## Do's and Don'ts

### ✅ Do
- **Use negative space as a separator** — if you feel the need to add a line, add `spacing-4` (1.4rem) whitespace instead
- **Embrace asymmetry** — high-level stats left, secondary actions far right
- **Layer your surfaces** — use the full range from `lowest` to `highest` to create visual depth

### ❌ Don't
- **Don't use generic blue** — always use `primary` (#0037b0) or `primary_container` (#1d4ed8)
- **Don't use 100% opaque borders** — this makes a premium system look like a template
- **Don't crowd the data** — financial data is stressful; the UI should be the antidote: calm, spacious, clear
