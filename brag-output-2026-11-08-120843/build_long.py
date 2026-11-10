#!/usr/bin/env python3
"""Generates composition/index.html for the long (~58s) accountant cut."""
import re, subprocess, os

HERE = os.path.dirname(os.path.abspath(__file__))
COMP = os.path.join(HERE, "composition")
base_css = open(os.path.join(HERE, "base.css")).read()

# ---------------------------------------------------------------- audio
def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode().strip())

SFX = {
    "sw": "assets/sfx/switch_002.ogg",
    "bg": "assets/sfx/bong_001.ogg",
    "ck": "assets/sfx/click_003.ogg",
    "sl": "assets/sfx/select_008.ogg",
    "im": "assets/sfx/impactSoft_medium_001.ogg",
}
# (time, kind, volume, track)
CUES = [
    (2.0, "im", 0.5, 2), (2.3, "ck", 0.5, 2), (2.65, "ck", 0.5, 2), (3.0, "ck", 0.5, 2),
    (4.5, "sl", 0.4, 2), (5.5, "bg", 0.45, 2),
    # whatsapp
    (8.3, "sw", 0.3, 2), (9.0, "sw", 0.3, 2), (10.5, "sw", 0.3, 2), (12.0, "sw", 0.3, 2), (13.5, "sw", 0.3, 2),
    (13.95, "bg", 0.45, 3), (15.0, "sw", 0.3, 2),
    # payments
    (18.5, "sw", 0.3, 2), (19.0, "bg", 0.4, 3), (19.25, "sw", 0.3, 2), (19.75, "bg", 0.4, 3), (20.0, "sw", 0.3, 2), (20.5, "sl", 0.4, 3),
    # tax
    (23.0, "ck", 0.5, 2), (23.5, "ck", 0.5, 2), (24.0, "ck", 0.5, 2), (24.5, "ck", 0.5, 2), (25.1, "bg", 0.45, 2),
    # dashboard
    (27.94, "ck", 0.6, 2), (29.4, "ck", 0.6, 2), (31.7, "sw", 0.2, 2), (34.2, "sw", 0.2, 2), (36.5, "sw", 0.2, 2),
    # reports
    (39.74, "ck", 0.6, 2), (41.21, "ck", 0.6, 2), (44.1, "sw", 0.2, 2), (46.85, "sw", 0.2, 2), (49.45, "sw", 0.2, 2), (51.55, "sw", 0.2, 3),
    (52.41, "ck", 0.7, 2), (52.57, "bg", 0.45, 3),
    # outro
    (54.02, "im", 0.5, 2),
]
audio = []
for i, (t, k, v, tr) in enumerate(CUES, 1):
    d = round(dur(os.path.join(COMP, SFX[k])) + 0.02, 2)
    audio.append(f'      <audio id="x{i:02d}" src="{SFX[k]}" data-start="{t}" data-duration="{d}" data-track-index="{tr}" data-volume="{v}"></audio>')
AUDIO = "\n".join(audio)

TOTAL = 58.0

CHECK = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#006C49" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
CURSOR = '<svg class="cur" viewBox="0 0 40 44"><path d="M3 3 L3 33 L11 26 L17 40 L23 37 L17 24 L28 24 Z" fill="#121c28" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>'

html = f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Tari1 for accountants</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>{base_css}
      /* ---- long cut additions ---- */
      .sub {{ margin: 28px 0 0; font-size: 32px; line-height: 1.35; font-weight: 500; color: var(--body); }}
      .capcol.narrow {{ width: 520px; }}
      .capcol.narrow .cap {{ font-size: 52px; }}
      .capstack {{ position: relative; height: 330px; }}
      .capstack .cap {{ position: absolute; left: 0; top: 0; width: 100%; }}
      .tagline {{ display: inline-flex; margin-top: 34px; padding: 12px 24px; border-radius: 999px; background: #fff; color: var(--primary); font-size: 28px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,55,176,.10); }}

      /* whatsapp */
      #wa-phone {{ position: absolute; left: 1040px; top: 66px; width: 700px; height: 948px; border-radius: 72px; background: #121c28; padding: 18px; box-shadow: 0 40px 90px rgba(18,28,40,.28); }}
      #wa-screen {{ width: 100%; height: 100%; border-radius: 56px; background: #efe7de; overflow: hidden; position: relative; }}
      #wa-head {{ height: 100px; background: #fff; display: flex; align-items: center; gap: 18px; padding: 0 30px; position: relative; z-index: 2; }}
      #wa-av {{ width: 64px; height: 64px; border-radius: 50%; background: var(--primary); color: #fff; display: grid; place-items: center; font-size: 28px; font-weight: 700; }}
      #wa-name {{ font-size: 30px; font-weight: 700; }}
      #wa-sub {{ font-size: 28px; font-weight: 500; color: var(--body); }}
      #wa-view {{ position: absolute; left: 0; right: 0; top: 100px; bottom: 0; overflow: hidden; }}
      #wa-bubble {{ margin: 20px 20px 0; background: #d9fdd3; border-radius: 24px; padding: 22px 26px 40px; box-shadow: 0 2px 0 rgba(18,28,40,.08); position: relative; }}
      #wa-bubble .blk {{ margin-bottom: 14px; }}
      #wa-bubble .hd {{ font-size: 30px; font-weight: 700; line-height: 1.3; }}
      #wa-bubble .hd.sm {{ font-size: 28px; font-weight: 500; color: var(--body); }}
      #wa-bubble .ln {{ display: flex; justify-content: space-between; gap: 16px; font-size: 28px; line-height: 1.36; font-weight: 500; }}
      #wa-bubble .ln .v {{ font-weight: 700; white-space: nowrap; }}
      #wa-time {{ position: absolute; right: 22px; bottom: 10px; font-size: 24px; color: var(--body); }}
      .exlabel {{ display: inline-flex; margin-top: 30px; padding: 10px 22px; border-radius: 999px; background: var(--warn-bg); color: var(--warn-ink); font-size: 28px; font-weight: 700; }}

      /* footage cards */
      .vcard {{ position: absolute; left: 660px; top: 212px; width: 1164px; height: 655px; border-radius: 28px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgba(0,55,176,.14); }}
      .cam {{ position: absolute; left: 0; top: 0; width: 1164px; height: 655px; transform-origin: 0 0; }}
      .cam .vid {{ position: absolute; left: 0; top: 0; width: 1164px; height: 655px; object-fit: cover; }}
      .cur {{ position: absolute; left: 0; top: 0; width: 40px; height: 44px; opacity: 0; z-index: 6; }}
      .rip {{ position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; border-radius: 50%; border: 4px solid var(--primary); opacity: 0; z-index: 5; }}
      .dl {{ font-size: 28px !important; position: absolute; left: 22px; bottom: 22px; z-index: 8; margin: 0; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="{TOTAL}">
      <div class="bg"></div>
      <div id="logo" data-layout-allow-overflow><img src="assets/tari1-logo.png" alt="Tari1" /></div>

      <!-- 1 · Hook -->
      <section id="s1" class="clip scene" data-start="0" data-duration="3.5">
        <div class="hook">
          <div class="a" id="s1a">Who picks the POS?</div>
          <div class="b" id="s1b">Whoever reconciles it.</div>
          <div class="c" id="s1c">That's you.</div>
        </div>
        <div class="card checks" id="s1card">
          <div class="chk" id="k1"><span class="dot">{CHECK}</span>Cash counted</div>
          <div class="chk" id="k2"><span class="dot">{CHECK}</span>Payments matched</div>
          <div class="chk" id="k3"><span class="dot">{CHECK}</span>Tax split</div>
        </div>
      </section>

      <!-- 2 · Shift ties out -->
      <section id="s2" class="clip scene" data-start="3.5" data-duration="4.5">
        <div class="capcol">
          <div class="eyebrow">The cash doesn't tie</div>
          <h2 class="cap">Every shift closes with a <em>counted-cash variance.</em></h2>
        </div>
        <div class="card">
          <div class="card-h"><div><div class="card-t">Close shift</div><div class="card-s">Evening shift · The Courtyard Maitama</div></div></div>
          <div class="rowv" id="s2e"><span class="l">Expected cash</span><span class="v">₦50,000</span></div>
          <div class="rowv" id="s2c"><span class="l">Counted cash in till</span><span class="v" id="counted">₦0</span></div>
          <div class="variance" id="s2v">
            <span class="l">Variance</span>
            <span class="tgt"><span class="chip warn">−₦2,000</span><span class="ring" id="s2ring"></span></span>
          </div>
        </div>
      </section>

      <!-- 3 · WhatsApp shift report -->
      <section id="s3" class="clip scene" data-start="8" data-duration="10">
        <div class="capcol">
          <div class="eyebrow">You're not there at close</div>
          <h2 class="cap">Close the shift. The report lands on <em>WhatsApp.</em></h2>
          <p class="sub">Collections by method, wallet and credit, till variance, and the month to date.</p>
          <div class="exlabel" data-layout-ignore>Example message · demo figures</div>
        </div>
        <div id="wa-phone"><div id="wa-screen">
          <div id="wa-head"><div id="wa-av">T1</div><div><div id="wa-name">Tari1</div><div id="wa-sub" data-layout-ignore>Business account</div></div></div>
          <div id="wa-view"><div id="wa-bubble">
            <div class="blk" id="w1">
              <div class="hd">Shift report</div>
              <div class="hd">The Courtyard Maitama</div>
              <div class="hd sm">Saturday, 7 November 2026</div>
              <div class="hd sm">10:00 AM – 11:30 PM</div>
              <div style="height:14px"></div>
              <div class="hd">Sales</div>
              <div class="ln"><span>Total sales</span><span class="v">₦4,271,800.00</span></div>
              <div class="ln"><span>Orders</span><span class="v">88</span></div>
              <div class="ln"><span>Avg order</span><span class="v">₦48,543.18</span></div>
            </div>
            <div class="blk" id="w2">
              <div class="hd">Collections</div>
              <div class="ln"><span>Card</span><span class="v">₦1,342,000.00</span></div>
              <div class="ln"><span>Transfer</span><span class="v">₦2,215,300.00</span></div>
              <div class="ln"><span>Cash</span><span class="v">₦50,000.00</span></div>
              <div class="ln"><span>Other</span><span class="v">₦0.00</span></div>
              <div class="ln"><span>Total received</span><span class="v">₦3,607,300.00</span></div>
            </div>
            <div class="blk" id="w3">
              <div class="hd">Wallet and credit</div>
              <div class="ln"><span>Paid from wallet</span><span class="v">₦351,000.00</span></div>
              <div class="ln"><span>Credit sales</span><span class="v">₦493,500.00</span></div>
              <div class="ln"><span>Credit repayments</span><span class="v">₦120,000.00</span></div>
              <div class="ln"><span>Wallet top-ups</span><span class="v">₦60,000.00</span></div>
            </div>
            <div class="blk" id="w4">
              <div class="ln"><span class="hd">Till variance</span><span class="tgt"><span class="v">-₦2,000.00</span><span class="ring" id="warring" style="inset:-10px -14px;border-width:5px;border-radius:14px"></span></span></div>
            </div>
            <div class="blk" id="w5">
              <div class="hd">Month to date</div>
              <div class="ln"><span>Sales</span><span class="v">₦30,118,400.00</span></div>
              <div class="ln"><span>Payments</span><span class="v">₦25,347,900.00</span></div>
              <div class="ln"><span>Credits</span><span class="v">₦3,284,500.00</span></div>
            </div>
            <div id="wa-time" data-layout-ignore>11:31 PM</div>
          </div></div>
        </div></div>
      </section>

      <!-- 4 · Payments -->
      <section id="s4" class="clip scene" data-start="18" data-duration="4.5">
        <div class="capcol">
          <div class="eyebrow">The transfers don't match</div>
          <h2 class="cap">Payments <em>match themselves.</em> Strays wait in a queue.</h2>
        </div>
        <div class="card">
          <div class="card-h"><div><div class="card-t">Moniepoint payments</div><div class="card-s">Live from card swipes and bank transfers</div></div></div>
          <div class="pay" id="p1" style="margin-top:34px">
            <span class="ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0037B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg></span>
            <div class="grow"><div class="t">Card · POS terminal</div><div class="s">Table 4</div></div>
            <div class="amt">₦18,500</div>
            <div class="chipwrap"><span class="chip grey" id="p1a" data-layout-ignore>Matching…</span><span class="chip ok" id="p1b">Paid · auto</span></div>
          </div>
          <div class="pay" id="p2">
            <span class="ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0037B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg></span>
            <div class="grow"><div class="t">Bank transfer</div><div class="s">Table 7</div></div>
            <div class="amt">₦12,000</div>
            <div class="chipwrap"><span class="chip grey" id="p2a" data-layout-ignore>Matching…</span><span class="chip ok" id="p2b">Paid · auto</span></div>
          </div>
          <div class="pay" id="p3">
            <span class="ico"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0037B0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg></span>
            <div class="grow"><div class="t">Bank transfer</div><div class="s">No single matching order</div></div>
            <div class="amt">₦6,200</div>
            <div class="chipwrap"><span class="chip grey" id="p3a" data-layout-ignore>Matching…</span><span class="chip warn" id="p3b">Unreconciled</span></div>
          </div>
          <div class="actions" id="acts"><span class="btn pri">Assign to order</span><span class="btn">Credit wallet</span><span class="btn">Ignore</span></div>
        </div>
      </section>

      <!-- 5 · Tax -->
      <section id="s5" class="clip scene" data-start="22.5" data-duration="4.5">
        <div class="capcol">
          <div class="eyebrow">The tax is a guess</div>
          <h2 class="cap"><em>VAT, entertainment tax and service charge,</em> split on every order.</h2>
        </div>
        <div class="card">
          <div class="card-h"><div><div class="card-t">Order · Table 4</div><div class="card-s">Closed and paid</div></div></div>
          <div class="ord">
            <div class="tl sub" id="t0"><span>Subtotal</span><span class="n">₦20,000</span></div>
            <div class="tl alt" id="t1"><span>VAT<span class="rate">7.5%</span></span><span class="n">₦1,500</span></div>
            <div class="tl" id="t2"><span>Entertainment tax<span class="rate">5%</span></span><span class="n">₦1,000</span></div>
            <div class="tl alt" id="t3"><span>Service charge<span class="rate">5%</span></span><span class="n">₦1,000</span></div>
            <div class="tl tot" id="t4"><span class="l2">Total</span><span class="tgt"><span class="n">₦23,500</span><span class="ring" id="s5ring"></span></span></div>
          </div>
        </div>
      </section>

      <!-- 6 · Dashboard (real footage) -->
      <section id="s6" class="clip scene" data-start="27" data-duration="12">
        <div class="capcol narrow">
          <div class="eyebrow">Hunting for numbers</div>
          <div class="capstack">
            <h2 class="cap" id="c6a">Pick a period. Sales, orders and top method <em>at a glance.</em></h2>
            <h2 class="cap" id="c6b">The <em>sales trend</em> for the period.</h2>
            <h2 class="cap" id="c6c"><em>Top meals, top waiters,</em> payment methods and order types.</h2>
          </div>
        </div>
      </section>

      <!-- 7 · Reports (real footage) -->
      <section id="s7" class="clip scene" data-start="39" data-duration="15">
        <div class="capcol narrow">
          <div class="eyebrow">Then comes month-end</div>
          <div class="capstack">
            <h2 class="cap" id="c7a">The sales report: <em>department, category and item.</em></h2>
            <h2 class="cap" id="c7b">Collections by <em>payment method.</em></h2>
            <h2 class="cap" id="c7c">Every waiter: <em>orders, sales, voids.</em></h2>
            <h2 class="cap" id="c7d"><em>Voids flagged</em> against sales.</h2>
            <h2 class="cap" id="c7e">One click: <em>CSV for your books.</em></h2>
          </div>
        </div>
      </section>

      <!-- footage cards (root level: videos can't sit inside timed sections) -->
      <div class="vcard" id="vcD">
        <div class="cam" id="camD">
          <video class="vid" id="dA" src="assets/footage/dash.mp4" data-start="27.2" data-duration="2.7" data-media-start="1.2" data-track-index="5" muted playsinline></video>
          <video class="vid" id="dA2" src="assets/footage/dash.mp4" data-start="29.9" data-duration="1.8" data-media-start="6.9" data-track-index="5" muted playsinline></video>
          <video class="vid" id="dB" src="assets/footage/dash.mp4" data-start="31.7" data-duration="2.5" data-media-start="10.2" data-track-index="5" muted playsinline></video>
          <video class="vid" id="dC" src="assets/footage/dash.mp4" data-start="34.2" data-duration="4.5" data-media-start="14.5" data-track-index="5" muted playsinline></video>
          <div class="rip" id="ripD"></div>
          {CURSOR.replace('class="cur"', 'class="cur" id="curD"')}
        </div>
      </div>
      <div class="vcard" id="vcR">
        <div class="cam" id="camR">
          <video class="vid" id="rA" src="assets/footage/reports.mp4" data-start="39.3" data-duration="2.4" data-media-start="1.5" data-track-index="6" muted playsinline></video>
          <video class="vid" id="rA2" src="assets/footage/reports.mp4" data-start="41.7" data-duration="2.4" data-media-start="6.0" data-track-index="6" muted playsinline></video>
          <video class="vid" id="rB" src="assets/footage/reports.mp4" data-start="44.1" data-duration="2.75" data-media-start="10.45" data-track-index="6" muted playsinline></video>
          <video class="vid" id="rC" src="assets/footage/reports.mp4" data-start="46.85" data-duration="2.6" data-media-start="15.7" data-track-index="6" muted playsinline></video>
          <video class="vid" id="rD" src="assets/footage/reports.mp4" data-start="49.45" data-duration="2.1" data-media-start="19.4" data-track-index="6" muted playsinline></video>
          <video class="vid" id="rE" src="assets/footage/reports.mp4" data-start="51.55" data-duration="2.4" data-media-start="24.7" data-track-index="6" muted playsinline></video>
          <div class="rip" id="ripR"></div>
          {CURSOR.replace('class="cur"', 'class="cur" id="curR"')}
        </div>
        <span class="filechip dl" id="dlchip"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#006C49" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/></svg>courtyard-sales-report.csv</span>
      </div>

      <!-- 8 · Outro -->
      <section id="s8" class="clip scene" data-start="54" data-duration="4">
        <div class="biglogo" id="s8logo" data-layout-allow-overflow><img src="assets/tari1-logo.png" alt="Tari1" /></div>
        <div class="l1" id="s8l1">Reconciled before you <em>open the laptop.</em></div>
        <div class="l2" id="s8l2">30-day free trial · Live in a week · 09053018005</div>
      </section>

      <!-- audio -->
      <audio id="bed" src="assets/music/bed.mp3" data-start="0" data-duration="{TOTAL}" data-track-index="1"
        data-automation='{{"version":1,"lanes":[{{"target":"volume","points":[{{"t":0,"v":0}},{{"t":0.6,"v":0.42}},{{"t":{TOTAL-2.8},"v":0.42}},{{"t":{TOTAL},"v":0}}]}}]}}'></audio>
{AUDIO}
    </div>

    <script>
      const tl = gsap.timeline({{ paused: true }});
      const E = "power3.out";
      const K = 1164 / 1600; // footage display px per recorded CSS px

      // persistent logo
      tl.fromTo("#logo", {{ opacity: 0, y: -12 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: E }}, 0.1);
      tl.to("#logo", {{ opacity: 0, duration: 0.3 }}, 53.7);

      const capIn = (id, t) => tl.fromTo(`#${{id}} .capcol`, {{ opacity: 0, x: -48 }}, {{ opacity: 1, x: 0, duration: 0.6, ease: E }}, t);
      const cardIn = (id, t) => tl.fromTo(`#${{id}} .card`, {{ opacity: 0, x: 64, scale: 0.97 }}, {{ opacity: 1, x: 0, scale: 1, duration: 0.7, ease: E }}, t + 0.1);
      const sceneOut = (id, end) => tl.to(`#${{id}} .capcol, #${{id}} .card, #${{id}} .hook`, {{ opacity: 0, duration: 0.3, ease: "power1.in" }}, end - 0.3);
      const ring = (sel, t) => tl.fromTo(sel, {{ opacity: 0, scale: 1.18 }}, {{ opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }}, t);
      const rise = (sel, t, d = 0.5) => tl.fromTo(sel, {{ opacity: 0, y: 26 }}, {{ opacity: 1, y: 0, duration: d, ease: E }}, t);

      // 1 · hook (0–3.5)
      tl.fromTo("#s1c", {{ opacity: 0, scale: 0.9, y: 16 }}, {{ opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }}, 2.0);
      rise("#s1b", 1.0, 0.55);
      tl.fromTo("#s1card", {{ opacity: 0, x: 60 }}, {{ opacity: 1, x: 0, duration: 0.6, ease: E }}, 1.9);
      [["#k1", 2.3], ["#k2", 2.65], ["#k3", 3.0]].forEach(([s, t]) => {{
        tl.fromTo(`${{s}} .dot`, {{ scale: 0.2, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)" }}, t);
        tl.fromTo(s, {{ opacity: 0.25 }}, {{ opacity: 1, duration: 0.25 }}, t);
      }});
      tl.to("#s1 .hook, #s1card", {{ opacity: 0, duration: 0.25, ease: "power1.in" }}, 3.25);

      // 2 · shift (3.5–8)
      capIn("s2", 3.5); cardIn("s2", 3.5);
      rise("#s2e", 4.0);
      rise("#s2c", 4.5);
      const cnt = {{ v: 0 }};
      tl.to(cnt, {{ v: 48000, duration: 0.9, ease: "power2.out", onUpdate: () => {{ document.getElementById("counted").textContent = "₦" + Math.round(cnt.v).toLocaleString("en-US"); }} }}, 4.5);
      tl.fromTo("#s2v", {{ opacity: 0, y: 26 }}, {{ opacity: 1, y: 0, duration: 0.5, ease: E }}, 5.5); // beat-locked: 5.52s
      tl.fromTo("#s2v .chip", {{ scale: 0.7 }}, {{ scale: 1, duration: 0.45, ease: "back.out(2)" }}, 5.5);
      ring("#s2ring", 6.0);
      sceneOut("s2", 8);

      // 3 · whatsapp (8–18)
      tl.fromTo("#s3 .capcol", {{ opacity: 0, x: -48 }}, {{ opacity: 1, x: 0, duration: 0.6, ease: E }}, 8.0);
      tl.fromTo("#wa-phone", {{ opacity: 0, x: 120 }}, {{ opacity: 1, x: 0, duration: 0.8, ease: E }}, 8.2);
      // beat-grid, every third beat so each block can be read: 9.0 / 10.5 / 12.0 / 13.5 / 15.0
      [["#w1", 9.0], ["#w2", 10.5], ["#w3", 12.0], ["#w4", 13.5], ["#w5", 15.0]].forEach(([s, t]) => rise(s, t, 0.5));
      // the green bubble grows with the message (heights measured from the laid-out bubble: 1063px tall)
      const clipTo = (bottom, t) => tl.to("#wa-bubble", {{ clipPath: `inset(0px 0px ${{1063 - bottom}}px 0px round 24px)`, duration: 0.5, ease: E }}, t);
      tl.fromTo("#wa-bubble", {{ clipPath: "inset(0px 0px 1063px 0px round 24px)" }}, {{ clipPath: "inset(0px 0px 697px 0px round 24px)", duration: 0.5, ease: E }}, 9.0);
      clipTo(609, 10.5); clipTo(814, 12.0); clipTo(868, 13.5); clipTo(1063, 15.0);
      tl.to("#wa-bubble", {{ y: -130, duration: 0.7, ease: "power2.inOut" }}, 13.4);
      tl.to("#wa-bubble", {{ y: -300, duration: 0.8, ease: "power2.inOut" }}, 15.0);
      ring("#warring", 13.95);
      tl.to("#s3 .capcol, #wa-phone", {{ opacity: 0, duration: 0.3, ease: "power1.in" }}, 17.7);

      // 4 · payments (18–22.5)
      capIn("s4", 18.0); cardIn("s4", 18.0);
      [["#p1", 18.5, "#p1a", "#p1b", 19.0], ["#p2", 19.25, "#p2a", "#p2b", 19.75], ["#p3", 20.0, "#p3a", "#p3b", 20.5]].forEach(([row, t, a, b, tm]) => {{
        rise(row, t, 0.45);
        tl.fromTo(b, {{ opacity: 0, scale: 0.8 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }}, tm);
        tl.to(a, {{ opacity: 0, duration: 0.2 }}, tm);
      }});
      rise("#acts", 20.9, 0.45);
      sceneOut("s4", 22.5);

      // 5 · tax (22.5–27)
      capIn("s5", 22.5); cardIn("s5", 22.5);
      [["#t0", 23.0], ["#t1", 23.5], ["#t2", 24.0], ["#t3", 24.5]].forEach(([s, t]) => rise(s, t, 0.4));
      rise("#t4", 25.1, 0.45);
      ring("#s5ring", 25.4);
      sceneOut("s5", 27);

      // ---- footage helpers
      const camAt = (cam, cx, cy, z) => ({{ x: 582 - cx * K * z, y: 327.5 - cy * K * z, scale: z }});
      const camSet = (cam, t, cx, cy, z) => tl.set(`#${{cam}}`, camAt(cam, cx, cy, z), t);
      const camTo = (cam, t, cx, cy, z, d = 0.9) => tl.to(`#${{cam}}`, {{ ...camAt(cam, cx, cy, z), duration: d, ease: "power2.inOut" }}, t);
      const capSwap = (from, to, t) => {{ tl.to(from, {{ opacity: 0, duration: 0.25 }}, t); tl.fromTo(to, {{ opacity: 0, y: 14 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: E }}, t + 0.15); }};
      const tap = (cur, rip, x, y, t) => {{
        tl.set(rip, {{ x: x * K, y: y * K, scale: 0.3, opacity: 0.9 }}, t);
        tl.to(rip, {{ scale: 1.7, opacity: 0, duration: 0.5, ease: "power2.out" }}, t);
        tl.to(cur, {{ scale: 0.86, duration: 0.08 }}, t).to(cur, {{ scale: 1, duration: 0.12 }}, t + 0.08);
      }};
      const glide = (cur, x, y, t, d) => tl.to(cur, {{ x: x * K, y: y * K, duration: d, ease: "power2.inOut" }}, t);

      // 6 · dashboard footage (27–39)
      tl.set("#camD", {{ x: 0, y: 0, scale: 1 }}, 0);
      tl.set("#c6b, #c6c", {{ opacity: 0 }}, 0);
      capIn("s6", 27.0);
      tl.fromTo("#vcD", {{ opacity: 0, x: 64, scale: 0.97 }}, {{ opacity: 1, x: 0, scale: 1, duration: 0.7, ease: E }}, 27.1);
      // cursor: open the period menu (27.94), pick Last Week (29.40)
      tl.fromTo("#curD", {{ x: 1380 * K, y: 230 * K, opacity: 0 }}, {{ x: 1501 * K, y: 43 * K, opacity: 1, duration: 0.6, ease: "power2.inOut" }}, 27.3);
      tap("#curD", "#ripD", 1501, 43, 27.94);
      glide("#curD", 1480, 170, 28.1, 1.2);
      tap("#curD", "#ripD", 1480, 170, 29.4);
      tl.to("#curD", {{ opacity: 0, duration: 0.3 }}, 29.65);
      camTo("camD", 30.0, 550, 270, 1.7, 0.9);                    // sales / orders / avg / top method (after the cut to loaded data)
      camSet("camD", 31.7, 840, 395, 1.45);                         // trend
      capSwap("#c6a", "#c6b", 31.7);
      camSet("camD", 34.2, 466, 330, 2.1);                         // top meals + waiters
      capSwap("#c6b", "#c6c", 34.2);
      camTo("camD", 36.5, 1214, 330, 2.1, 0.9);                    // payment methods + order types
      tl.to("#s6 .capcol, #vcD", {{ opacity: 0, duration: 0.3, ease: "power1.in" }}, 38.7);

      // 7 · reports footage (39–54)
      tl.set("#camR", {{ x: 0, y: 0, scale: 1 }}, 0);
      tl.set("#c7b, #c7c, #c7d, #c7e, #dlchip", {{ opacity: 0 }}, 0);
      capIn("s7", 39.0);
      tl.fromTo("#vcR", {{ opacity: 0, x: 64, scale: 0.97 }}, {{ opacity: 1, x: 0, scale: 1, duration: 0.7, ease: E }}, 39.1);
      tl.fromTo("#curR", {{ x: 1160 * K, y: 230 * K, opacity: 0 }}, {{ x: 1280 * K, y: 43 * K, opacity: 1, duration: 0.6, ease: "power2.inOut" }}, 39.15);
      tap("#curR", "#ripR", 1280, 43, 39.74);
      glide("#curR", 1259, 170, 39.9, 1.2);
      tap("#curR", "#ripR", 1259, 170, 41.21);
      tl.to("#curR", {{ opacity: 0, duration: 0.3 }}, 41.45);
      camTo("camR", 41.9, 740, 300, 1.95, 0.9);                    // headline numbers + departments (after the cut to loaded data)
      camSet("camR", 44.1, 1155, 290, 2.4);                        // payments collected
      capSwap("#c7a", "#c7b", 44.1);
      camSet("camR", 46.85, 840, 500, 1.5);                        // staff performance
      capSwap("#c7b", "#c7c", 46.85);
      camSet("camR", 49.45, 640, 690, 2.2);                        // controls
      capSwap("#c7c", "#c7d", 49.45);
      camSet("camR", 51.55, 1150, 250, 1.8);                       // CSV
      capSwap("#c7d", "#c7e", 51.55);
      tl.set("#curR", {{ scale: 0.6 }}, 51.5);
      tl.set("#curR", {{ x: 1290 * K, y: 170 * K, opacity: 0 }}, 51.52);
      tl.to("#curR", {{ x: 1404.6 * K, y: 43 * K, opacity: 1, duration: 0.7, ease: "power2.inOut" }}, 51.65);
      tl.set("#ripR", {{ x: 1404.6 * K, y: 43 * K, scale: 0.3, opacity: 0.9 }}, 52.41);
      tl.to("#ripR", {{ scale: 1.7, opacity: 0, duration: 0.5, ease: "power2.out" }}, 52.41);
      tl.to("#curR", {{ opacity: 0, duration: 0.3 }}, 52.8);
      tl.fromTo("#dlchip", {{ opacity: 0, y: 14 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: E }}, 52.55);
      tl.to("#s7 .capcol, #vcR", {{ opacity: 0, duration: 0.3, ease: "power1.in" }}, 53.7);

      // 8 · outro (54–58)
      tl.fromTo("#s8logo", {{ opacity: 0, scale: 0.92 }}, {{ opacity: 1, scale: 1, duration: 0.6, ease: E }}, 54.0);
      rise("#s8l1", 54.4, 0.6);
      rise("#s8l2", 54.9, 0.5);
      tl.to("#s8 > *", {{ opacity: 0, duration: 0.4, ease: "power1.in" }}, {TOTAL-0.4});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
'''
# outro rules were named #s6 in the base css; remap to #s8
html = html.replace("#s6 {", "#s8 {").replace("#s6 .biglogo", "#s8 .biglogo").replace("#s6 .l1", "#s8 .l1").replace("#s6 .l1 em", "#s8 .l1 em").replace("#s6 .l2", "#s8 .l2")
open(os.path.join(COMP, "index.html"), "w").write(html)
print("wrote", len(html), "bytes;", len(CUES), "sfx cues")
