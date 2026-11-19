// k6 endpoint-level load test: hammer a few hot endpoints at a fixed request rate, independent of
// how many "restaurants" exist. Answers "is the server the bottleneck for these endpoints?".
//
// Run it from INSIDE Railway (same network as the API) so the client-to-server path is ~zero and
// any latency you see is the server/DB. From a laptop it measures your connection, not the API.
//
//   k6 run -e ORGS=orgs.json -e BASE_URL=https://<staging-api>/api/v1 \
//     -e RATES=20:2m,50:2m,100:2m,200:2m scripts/loadtest/endpoints.js
//
// ORGS is the file seed.ts writes. RATES is a list of requests-per-second:hold-duration steps for
// the WHOLE mix; each step ramps over 20s then holds. The mix (weights, summing to 100 by default):
//
//   order:detail   GET  /orders/:id             60   (the POS re-fetches this constantly)
//   menu:items     GET  /menu-items             15
//   menu:categories GET /menu-categories        10
//   org:current    GET  /organizations/current  10
//   order:add-items POST /orders/:id/items       5   (creates an order in setup, adds to it here)
//
// Override with -e MIX=order:detail=100 to hit a single endpoint, e.g. MIX=order:detail=100.
// Requests are tagged `name` (endpoint) and `rps` (the step), so the summary breaks down per step.
//
// Staging needs THROTTLE_DISABLED=true (the throttler keys on route+IP; ignored in production).
// Compare k6's http_req_duration against the API's own `[HTTP] GET ... 200 6ms` log lines: if the
// server time stays flat while k6's latency climbs, the limit is the network/client, not the API.
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const ORGS = new SharedArray('orgs', () => JSON.parse(open(__ENV.ORGS)));
const BASE = __ENV.BASE_URL;
const RAMP_S = 20;
const ORDERS_PER_ORG = Number(__ENV.ORDERS_PER_ORG || 30);

const STEPS = (__ENV.RATES || '20:2m').split(',').map((s) => {
  const [rps, d] = s.split(':');
  return { rps: Number(rps), d };
});
const seconds = (d) => Number(d.slice(0, -1)) * { s: 1, m: 60, h: 3600 }[d.slice(-1)];

const MIX = (__ENV.MIX || 'order:detail=60,menu:items=15,menu:categories=10,org:current=10,order:add-items=5')
  .split(',')
  .map((s) => {
    const [name, w] = s.split('=');
    return { name, w: Number(w) };
  });
const TOTAL_W = MIX.reduce((a, m) => a + m.w, 0);

const throttled = new Counter('throttled_429');
const serverErrors = new Counter('server_errors_5xx');

const thresholds = { checks: ['rate>0.99'], throttled_429: ['count<1'] };
for (const { rps } of STEPS) {
  thresholds[`http_req_duration{rps:${rps}}`] = ['p(95)<1000'];
  thresholds[`http_req_failed{rps:${rps}}`] = ['rate<0.01'];
}

export const options = {
  scenarios: {
    mix: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000, // if k6 runs out of VUs, requests are slower than the target rate: see dropped_iterations
      stages: STEPS.flatMap(({ rps, d }) => [
        { target: rps, duration: `${RAMP_S}s` },
        { target: rps, duration: d },
      ]),
    },
  },
  thresholds,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** The rate step the test is in right now, by elapsed time, to tag each request. */
function currentStep() {
  let t = exec.instance.currentTestRunDuration / 1000;
  for (const { rps, d } of STEPS) {
    t -= RAMP_S + seconds(d);
    if (t < 0) return rps;
  }
  return STEPS[STEPS.length - 1].rps;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function call(method, path, token, name, body) {
  const tags = { name, rps: String(currentStep()) };
  const res = http.request(method, `${BASE}${path}`, body ? JSON.stringify(body) : null, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    tags,
    timeout: '30s',
  });
  if (res.status === 429) throttled.add(1, tags);
  if (res.status >= 500) serverErrors.add(1, tags);
  check(res, { 'status 2xx': (r) => r.status >= 200 && r.status < 300 }, tags);
  return res;
}

/** Order IDs per org, so order:detail reads real orders and add-items has OPEN orders to write to. */
export function setup() {
  const ids = {};
  for (const org of ORGS) {
    const orders = [];
    // Existing history: what the POS actually re-fetches (a mix of old closed orders).
    const list = http.get(`${BASE}/orders?limit=${ORDERS_PER_ORG}`, {
      headers: { Authorization: `Bearer ${org.token}` },
    });
    if (list.status === 200) {
      const data = list.json('data');
      const rows = Array.isArray(data) ? data : data && Array.isArray(data.data) ? data.data : data && Array.isArray(data.items) ? data.items : [];
      for (const o of rows) orders.push(o.id);
    }
    // A few fresh OPEN orders for add-items to append to (history orders are closed).
    const open = [];
    for (let i = 0; i < 3; i++) {
      const created = http.post(
        `${BASE}/orders`,
        JSON.stringify({
          source: 'Takeaway',
          items: [{ menuItemId: pick(org.menuItemIds), quantity: 1 }],
          clientRequestId: crypto.randomUUID(),
        }),
        { headers: { Authorization: `Bearer ${org.token}`, 'Content-Type': 'application/json' } },
      );
      if (created.status < 300) open.push(created.json('data.id'));
    }
    ids[org.n] = { orders, open };
  }
  const withOrders = Object.values(ids).filter((v) => v.orders.length > 0).length;
  if (withOrders === 0) throw new Error('setup found no orders to read: check ORGS/BASE_URL/response shape');
  console.log(`setup: ${withOrders}/${ORGS.length} orgs have orders to read`);
  return ids;
}

function chooseEndpoint() {
  let r = Math.random() * TOTAL_W;
  for (const m of MIX) {
    r -= m.w;
    if (r < 0) return m.name;
  }
  return MIX[MIX.length - 1].name;
}

export default function (ids) {
  const org = pick(ORGS);
  const mine = ids[org.n];
  const tok = org.token;
  switch (chooseEndpoint()) {
    case 'order:detail':
      if (mine.orders.length) call('GET', `/orders/${pick(mine.orders)}`, tok, 'order:detail');
      break;
    case 'menu:items':
      call('GET', '/menu-items', tok, 'menu:items');
      break;
    case 'menu:categories':
      call('GET', '/menu-categories', tok, 'menu:categories');
      break;
    case 'org:current':
      call('GET', '/organizations/current', tok, 'org:current');
      break;
    case 'order:add-items':
      if (mine.open.length) {
        call('POST', `/orders/${pick(mine.open)}/items`, tok, 'order:add-items', {
          items: [{ menuItemId: pick(org.menuItemIds), quantity: 1 }],
          clientRequestId: crypto.randomUUID(),
        });
      }
      break;
  }
}
