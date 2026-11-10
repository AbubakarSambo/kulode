# Hyperframes Composition Brief: Tari1 (accountant cut)

## Objective
A 25s launch-style brag video for Tari1 POS, aimed at the accountant who decides which POS a restaurant buys.

## Output
- Composition directory: `composition/`
- Rendered video: `brag.mp4`
- Format: landscape, 1920x1080
- Duration: 58s (long cut; see brag-plan.md Revision 2)

## Source Material
- Project root: /Users/abubakarsambo/Documents/personal/tarione
- Primary files read: DESIGN.md, client pages (ShiftPage, SalesReportView, PosReportsPage, UnreconciledTransfersPage), pos-reports/sales-report.builder, feed + sheet-sync + moniepoint modules, orders.service charge math, marketing homepage, prospect-demo frame.md
- Product name: Tari1 (logo asset: assets/tari1-logo.png)
- Strongest claim: "Reconciled before you open the laptop."
- UI to recreate (fictional "Courtyard" demo data): close-shift counted vs expected with variance badge; Moniepoint payments auto-matching plus the Unreconciled transfers queue; per-order VAT / Entertainment Tax / Service Charge; sales report with Payments collected, Controls and the CSV button.
- Copy that must appear verbatim:
  - "Who picks the POS?" / "Whoever reconciles it." / "That's you."
  - "Every shift closes with a counted-cash variance."
  - "Payments match themselves. Strays wait in a queue."
  - "VAT, entertainment tax and service charge, split on every order."
  - "One CSV. Payments by method. Voids and discounts on the record."
  - "Reconciled before you open the laptop."
  - "30-day free trial · Live in a week · 09053018005"

## Creative Direction
- Tone preset: polished (app-store card cleanliness)
- Creative direction: quiet confidence for the person who signs off the numbers
- Interpretation: slow-ish holds, one idea per scene, soft slides, one dry line.
- Hook: "Who picks the POS? / Whoever reconciles it. / That's you."
- Outro: "Reconciled before you open the laptop."
- Avoid: generic SaaS language, abstract filler, "works offline", COGS/gross-profit claims, Sheets-sync claims, "read-only accountant" claim, naming accounting software. The variance badge uses the app's amber warning style, not red.

## Visual Identity
- Background #F8F9FF, cards #FFFFFF, wells #EEF4FF; text #121C28 / #434655
- Accent #0037B0 → #1D4ED8; success #006C49; warning chip #FFDDB8 on #4C2205
- Fonts: Plus Jakarta Sans (local woff2, 700 max) for display and numbers; system sans fallback for small body. The ring device: a cobalt rounded outline around the one number each scene lands on.

## Storyboard
Use `brag-plan.md` as the contract.
1. Hook — 3.5s
2. Shift ties out — 4.5s
3. Every naira finds its order — 4.5s
4. Tax is already split — 4.5s
5. Export, don't retype — 4.5s
6. Outro — 3.5s

## Audio
- Role: warm professional bed with sparse motion-matched accents
- Music: `assets/music/bed.mp3` (happy-beats-business-moves-vol-1, 120 BPM)
- Treatment: fade in ~0.6s, volume ~0.5, fade out over the last ~2s
- Cue guidance: bundled preset. Beats sit on ~0.02 + 0.5k, so scene starts at multiples of 0.5s are on-beat. Strong cues at 17.02 (scene 5 start) and ~21.01 (outro).
- Audio-reactive treatment: none (finance audience; nothing should pulse)
- SFX (sparse, low HF risk): click_003 for UI clicks, bong_001 for matches, select_008 for number appearances, switch_002 for row reveals, impactSoft_medium_001 for the hook beat and the outro mark.
- SFX analysis: `<skill-dir>/assets/sfx/sfx-analysis.md`

## Hyperframes Instructions
Follow hyperframes-core / animation / creative / cli. Single monolithic standalone composition, one paused GSAP timeline. Run `hyperframes check` before render.
