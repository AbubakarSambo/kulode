// k6 load test: each VU is one restaurant running its devices at the client's real poll intervals.
//
//   k6 run -e ORGS=orgs.json -e BASE_URL=https://.../api/v1 -e STAGES=10:5m,25:5m,50:5m,100:5m \
//     scripts/loadtest/restaurants.js
//
// ORGS is the file seed.ts writes. STAGES is a list of restaurants:hold-duration steps; each step
// ramps over 30s and then holds. Every request is tagged with `restaurants` (the step it ran in)
// and `name` (the screen/endpoint), so the end summary breaks results down per step.
//
// Per restaurant, mirroring client/src (intervals) and print-agent/agent.js:
//   print agent    GET /print-agent/jobs every 2s, PATCH each claimed job as SENT
//   kitchen screen GET /orders?statuses=OPEN,IN_KITCHEN,READY every 5s
//   POS floor      GET /restaurant-tables + active-orders summary + /pos-dashboard/today every 15s
//   orders badge   GET awaiting-payment count every 15s
//   manager dash   /pos-dashboard/summary + /trend every 15s (half of restaurants have it open)
//   orders         one every ORDER_EVERY_S on average: create → view → add items → view → pay
//   sales report   30-day report, ~1 in 10 restaurant-minutes
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { setTimeout } from 'k6/timers';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const ORGS = new SharedArray('orgs', () => JSON.parse(open(__ENV.ORGS)));
const BASE = __ENV.BASE_URL;
const ORDER_EVERY_S = Number(__ENV.ORDER_EVERY_S || 120);
const REPORT_CHANCE = Number(__ENV.REPORT_CHANCE || 0.1);
const RAMP_S = 30;

const STEPS = (__ENV.STAGES || '1:3m').split(',').map((s) => {
  const [n, d] = s.split(':');
  return { n: Number(n), d };
});
const seconds = (d) => Number(d.slice(0, -1)) * { s: 1, m: 60, h: 3600 }[d.slice(-1)];

const throttled = new Counter('throttled_429');
const serverErrors = new Counter('server_errors_5xx');

const thresholds = { checks: ['rate>0.99'] };
for (const { n } of STEPS) {
  thresholds[`http_req_duration{restaurants:${n}}`] = ['p(95)<1500'];
  thresholds[`http_req_failed{restaurants:${n}}`] = ['rate<0.01'];
  thresholds[`throttled_429{restaurants:${n}}`] = ['count<1'];
}

export const options = {
  scenarios: {
    restaurants: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: STEPS.flatMap(({ n, d }) => [
        { target: n, duration: `${RAMP_S}s` },
        { target: n, duration: d },
      ]),
      gracefulRampDown: '60s',
    },
  },
  thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** The step the test is in right now, by elapsed time — tags each request for the per-step summary. */
function currentStep() {
  let t = exec.instance.currentTestRunDuration / 1000;
  for (const { n, d } of STEPS) {
    t -= RAMP_S + seconds(d);
    if (t < 0) return n;
  }
  return STEPS[STEPS.length - 1].n;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function req(method, path, token, name, body) {
  const tags = { name, restaurants: String(currentStep()) };
  const res = await http.asyncRequest(method, `${BASE}${path}`, body ? JSON.stringify(body) : null, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    tags,
    timeout: '30s',
  });
  if (res.status === 429) throttled.add(1, tags);
  if (res.status >= 500) serverErrors.add(1, tags);
  check(res, { 'status 2xx': (r) => r.status >= 200 && r.status < 300 }, tags);
  return res;
}

/** Runs fn every `ms` (measured start to start, like react-query's refetchInterval) until endAt. */
async function every(ms, endAt, fn) {
  await sleep(Math.random() * ms); // devices don't all start in lockstep
  while (Date.now() < endAt) {
    const started = Date.now();
    await fn();
    const wait = ms - (Date.now() - started);
    if (Date.now() + wait >= endAt) return;
    await sleep(wait);
  }
}

async function orderFlow(org) {
  const items = Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
    menuItemId: pick(org.menuItemIds),
    quantity: 1 + Math.floor(Math.random() * 2),
  }));
  const created = await req('POST', '/orders', org.token, 'order:create', {
    source: 'Takeaway',
    items,
    clientRequestId: crypto.randomUUID(),
  });
  const id = created.status < 300 ? created.json('data.id') : null;
  if (!id) return;
  await sleep(10_000);
  await req('GET', `/orders/${id}`, org.token, 'order:detail');
  await sleep(10_000);
  await req('POST', `/orders/${id}/items`, org.token, 'order:add-items', {
    items: [{ menuItemId: pick(org.menuItemIds), quantity: 1 }],
    clientRequestId: crypto.randomUUID(),
  });
  await sleep(10_000);
  await req('GET', `/orders/${id}`, org.token, 'order:detail');
  await req('POST', `/orders/${id}/close`, org.token, 'order:close', {
    paymentMethod: 'CASH',
    clientRequestId: crypto.randomUUID(),
  });
}

function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// One iteration = one minute of one restaurant's devices.
export default async function () {
  const org = ORGS[(exec.vu.idInTest - 1) % ORGS.length];
  const endAt = Date.now() + 60_000;
  const tok = org.token;
  const loops = [
    every(2_000, endAt, async () => {
      const res = await req('GET', '/print-agent/jobs', org.printAgentToken, 'print-agent:poll');
      const body = res.status === 200 ? res.json() : null;
      const jobs = Array.isArray(body) ? body : body?.data; // same unwrapping as print-agent/agent.js
      for (const job of Array.isArray(jobs) ? jobs : []) {
        await req('PATCH', `/print-agent/jobs/${job.id}`, org.printAgentToken, 'print-agent:report', { status: 'SENT' });
      }
    }),
    every(5_000, endAt, () =>
      req('GET', '/orders?statuses=OPEN&statuses=IN_KITCHEN&statuses=READY&limit=100', tok, 'kitchen:orders'),
    ),
    every(15_000, endAt, () =>
      Promise.all([
        req('GET', '/restaurant-tables', tok, 'floor:tables'),
        req('GET', '/orders?summary=true&statuses=OPEN&statuses=IN_KITCHEN&statuses=READY&statuses=CLOSED_UNPAID&limit=100', tok, 'floor:active-orders'),
        req('GET', '/pos-dashboard/today', tok, 'pos:today'),
      ]),
    ),
    every(15_000, endAt, () => req('GET', '/orders?summary=true&status=CLOSED_UNPAID&page=1&limit=1', tok, 'pos:awaiting-badge')),
  ];
  if (org.n % 2 === 0) {
    loops.push(
      every(15_000, endAt, () =>
        Promise.all([
          req('GET', '/pos-dashboard/summary?period=TODAY', tok, 'dash:summary'),
          req('GET', '/pos-dashboard/trend?period=TODAY', tok, 'dash:trend'),
        ]),
      ),
    );
  }
  if (Math.random() < 60 / ORDER_EVERY_S) {
    loops.push(sleep(Math.random() * 15_000).then(() => orderFlow(org)));
  }
  if (Math.random() < REPORT_CHANCE) {
    loops.push(
      sleep(Math.random() * 30_000).then(() =>
        req('GET', `/pos-reports/sales-report?from=${isoDay(-30)}&to=${isoDay(0)}`, tok, 'report:sales-30d'),
      ),
    );
  }
  await Promise.all(loops);
}
