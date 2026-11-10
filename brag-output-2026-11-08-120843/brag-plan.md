# Brag Plan: Tari1 (for the accountant)

## What is this app?
Tari1 is a POS for Nigerian restaurants and bars that takes the order, fires the kitchen, collects the money, and reconciles every shift to the naira. This cut is aimed at the accountant, who in practice decides which POS a restaurant buys.

## The angle
The accountant is the one who has to live with the POS, so the video is addressed to them. Each scene answers a month-end pain with something Tari1 does at the till, shown as the real screen.

The structure is pain → fix: "cash doesn't tie", "transfers can't be matched", "tax is a guess", "I retype everything". The tone is calm and confident, with one dry line. The joke is that the numbers already agree.

Nothing here is a generic "streamline your workflow" claim. Every line is backed by something in the code.

## Hook (first 2–3 seconds)
Large type: **"The POS is chosen by the person who has to reconcile it."**
Beat: **"That's you."** pops in on its own line, then the Tari1 mark.

## Key moments (the middle)
1. **Every shift ties out.** Close-shift screen: Expected ₦50,000, Counted ₦48,000, and a red **−₦2,000 variance** appears. This comes from the real shift-close figures (`closeshift.numbers`). Caption: "Every shift closes with a counted-cash variance."
2. **Every naira finds its order.** A Moniepoint card payment and a bank transfer land one after the other. Each matches an open order, which closes with an **auto** tag. A third transfer matches nothing and drops into the **Unreconciled transfers** queue with Assign / Credit wallet / Ignore. Caption: "Payments match themselves. Strays wait in a queue, not in your inbox."
3. **Tax is already split.** Order lines with VAT 7.5%, Entertainment Tax 5% and Service Charge 5% shown as separate columns on a Courtyard demo order. Caption: "VAT, entertainment tax and service charge, split on every order."
4. **Export, don't retype.** The sales report: gross, discounts, net, **Payments collected** (Cash / Card / Transfer / Wallet), and **Controls** (voids, discounts). A cursor clicks Export CSV and a file chip slides out. A small "Accountant role: read-only" pill sits beside it. Caption: "One CSV. Payments by method. Voids and discounts on the record."

## Outro / punchline
**"Reconciled before you open the laptop."** Tari1 logo, "30-day free trial · Live in a week", and the Tari1 contact line 09053018005.

## User flow worth showing
Entry → key action → result, in an accountant's day:
- Entry: a shift closes (counted vs expected) and payments arrive.
- Key action: transfers auto-match; a stray one is assigned from the queue.
- Result: the sales report exports to CSV, already split by payment method and tax.

## Tone
- Preset: `polished`, with `app-store` card cleanliness
- Creative direction: quiet confidence for the person who signs off the numbers
- Interpretation: slow-ish holds, one idea per scene, mixed-case type, soft slides and crossfades. A single dry line ("That's you.") carries the humor. Restraint is the style.

## Format: landscape — 1920x1080
## Duration: 25 seconds

(The brag ceiling. Four accountant pains need roughly 4.5s each to be readable. No voiceover.)

## Visual identity (from the project)
- Background: `#F8F9FF` (surface), cards `#FFFFFF`, wells `#EEF4FF`
- Accent: `#0037B0` primary, gradient to `#1D4ED8`
- Text: `#121C28` for figures and headings, `#434655` for secondary
- Success `#006C49`, error `#BA1A1A` (used only for the variance), warning chip `#FFDDB8`
- Display font: Plus Jakarta Sans (700 max, per DESIGN.md). Body: Inter.
- Strongest visual element: the "Architectural Ledger" look — white cards on pale blue, tinted shadows, no divider lines, tabular figures. Reuse the prior prospect-demo ring device, a cobalt rounded rectangle that draws around the one number each scene lands on.

## Data and privacy
All figures are fictional demo data for "The Courtyard Maitama" (the demo org). No real customer names, bank details or phone numbers appear. The only contact detail is the public Tari1 line. Moniepoint is shown as a payment-source label only.

## Claims guardrails
- No "works offline" claim.
- No COGS or gross-profit claim.
- No Google Sheets sync claim (it is currently paused in code).
- "Accounting software" is not named. The read-only sales feed is mentioned only generically, if at all.

## Share copy (draft)
Restaurants pick their POS on the accountant's say-so. So we built Tari1 for the person who has to make the numbers tie: counted-cash variances per shift, auto-matched Moniepoint payments, VAT/ET/SC split per order, one-click CSV.

## Audio direction
- Role: warm professional bed with sparse, motion-matched accents
- Music: bundled `happy-beats-business-moves-vol-1` (120 BPM, upbeat but clean). Start the bed under the hook.
- Music treatment: fade in over ~0.5s at low-moderate volume, hold under scene text, fade out across the last 2s.
- Music cue guidance: preset read from `cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`. Tempo is 120.19 BPM, with the beat grid starting about 3.02s and a 0.5s beat spacing. Target strong beats around 16–18s for the CSV export and 20.0s for the outro mark. If the grid doesn't line up with the cut points, offset the track start so downbeats land on scene changes.
- Audio-reactive treatment: none. This is a finance audience, so nothing should pulse.
- SFX posture: sparse. Soft UI click for button presses, a gentle tick when the variance appears, a quiet "matched" chime for auto-closes, a light pop for the file chip.
- Audio-coupled moments: variance number counting in; the three payments matching one at a time; the cursor click on Export CSV.
- Restraint rule: no risers, no whooshes on every cut, and music must never fight a number being read.

## Storyboard

### Scene 1 — Hook — 3.5s
Large left-aligned type on the pale surface: "The POS is chosen by the person who has to reconcile it." Hold ≥1.5s so it can be read (13 words, so ~3.9s at 0.3s/word; shorten to "Who really picks the POS?" if timing is tight). Then "That's you." lands in cobalt with the Tari1 mark.
Sequential/interaction: the two lines arrive one after the other; hold the first fully before the second.
Audio intent: calm, confident. The music enters softly.
Audio-coupled idea: a single soft tick on "That's you."
Music: warm bed fades in.
Transition mood: soft slide → Scene 2

### Scene 2 — Shift ties out — 4.5s
A recreated close-shift card (white, tinted shadow). "Expected ₦50,000", "Counted ₦48,000". A ring draws around the result and a red chip reads "−₦2,000 variance". Caption at the bottom: "Every shift closes with a counted-cash variance."
Sequential/interaction: counted figure types in, then the variance chip appears. Hold the caption ≥1.5s.
Audio intent: precise, satisfying.
Audio-coupled idea: counter tick, then one soft thud on the chip.
Transition mood: clean slide → Scene 3

### Scene 3 — Every naira finds its order — 4.5s
Three payment rows arrive one by one in a Moniepoint-style feed: ₦18,500 card (Table 4), ₦12,000 transfer (Table 7), ₦6,200 transfer (no match). The first two snap onto their order cards, which flip to "Paid · auto". The third slides into an "Unreconciled transfers" panel showing Assign / Credit wallet / Ignore. Caption: "Payments match themselves. Strays wait in a queue."
Sequential/interaction: yes — three rows, about 0.6s apart, with the whole set held for ≥1s afterward.
Audio intent: a quiet "it's handled" feeling.
Audio-coupled idea: two matched chimes, then a neutral tone for the stray.
Transition mood: clean slide → Scene 4

### Scene 4 — Tax is already split — 4.5s
A Courtyard order table, tabular figures. Subtotal ₦20,000 is followed by VAT 7.5% ₦1,500, Entertainment Tax 5% ₦1,000, Service Charge 5% ₦1,000, then Total ₦23,500. Each tax line is highlighted in turn, with a ring around the total. Caption: "VAT, entertainment tax and service charge, split on every order."
Sequential/interaction: yes — the three tax rows reveal one at a time; the full table holds ≥1.2s.
Audio intent: orderly, rhythmic.
Audio-coupled idea: one tick per tax row, landing on beats.
Transition mood: clean slide → Scene 5

### Scene 5 — Export, don't retype — 4.5s
The sales report: Gross / Discounts / Net tiles, a Payments collected strip (Cash, Card, Transfer, Wallet), and a Controls strip (Voids, Discounts). A cursor clicks "Export CSV" and a file chip "courtyard-sales-report.csv" slides out. A small pill reads "Accountant role · read-only". Caption: "One CSV. Payments by method. Voids and discounts on the record."
Sequential/interaction: yes — simulated cursor click. The chip slides out on a strong beat.
Audio intent: payoff, relief.
Audio-coupled idea: click, then a light pop for the file chip.
Transition mood: soft crossfade → Scene 6

### Scene 6 — Outro — 3.5s
Tari1 mark centered. Line: "Reconciled before you open the laptop." Below it, small: "30-day free trial · Live in a week · 09053018005". The music resolves, then a short silence before the cut.
Sequential/interaction: none.
Audio intent: warm close.
Audio-coupled idea: none.
Transition mood: end on a fade to the surface color.

**Music mood for this video:** upbeat, clean, professional
**Audio summary:** a warm business bed with sparse, motion-matched UI sounds that resolve into a quiet finish.

---

## Revision 2: long cut (58s)

The first cut (25s, `brag-short-25s.mp4`) was extended at the user's request to show more. The 15-25s brag ceiling was deliberately exceeded: this is a sales demo for accountants, and each pain needs its own screen.

Order: Hook 3.5s, Shift variance 4.5s, WhatsApp shift report 10s, Payments 4.5s, Tax 4.5s, Dashboard (real footage) 12s, Sales report (real footage + CSV click) 15s, Outro 4s.

- **Real footage:** the dashboard and sales report were screen-recorded read-only from the Courtyard demo org (period: Last Week). Nothing in the demo was changed. Recorder: `~/Documents/personal/tari1-videos/brag-accountant/capture/record-pages.mjs`.
- **WhatsApp message:** recreated from the 19 `shift_report_v3` fields in `whatsapp.service.ts`. Meta holds the exact template wording, so the section labels are reconstructed. Figures are fictional and the screen is labelled "Example message · demo figures".
- **Regenerate:** `python3 build_long.py` rewrites `composition/index.html` (uses `base.css`).
