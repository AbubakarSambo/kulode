import { tracesSampler } from './sentry-sampling';

type Context = Parameters<typeof tracesSampler>[0];

function sample(method: string, url: string, parentSampled?: boolean) {
  return tracesSampler({
    name: `${method} ${url}`,
    normalizedRequest: { method, url },
    parentSampled,
    inheritOrSampleWith: (fallback: number) => (parentSampled === undefined ? fallback : Number(parentSampled)),
  } as unknown as Context);
}

describe('tracesSampler', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.SENTRY_POLL_SAMPLE_RATE;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    delete process.env.SENTRY_HOT_PATH_SAMPLE_RATE;
  });

  afterAll(() => {
    process.env = env;
  });

  it.each([
    '/api/v1/print-agent/jobs',
    '/api/v1/print-agent/jobs?v=2',
    'https://api.example.com/api/v1/print-agent/jobs/?v=2',
  ])('barely samples the print agent poll: %s', (url) => {
    expect(sample('GET', url)).toBe(0.001);
  });

  it('lets the poll rate be overridden', () => {
    process.env.SENTRY_POLL_SAMPLE_RATE = '0';
    expect(sample('GET', '/api/v1/print-agent/jobs?v=2')).toBe(0);
  });

  it('keeps the default rate for other print agent requests', () => {
    expect(sample('PATCH', '/api/v1/print-agent/jobs/abc')).toBe(0.05);
    expect(sample('POST', '/api/v1/print-agent/logs')).toBe(0.05);
  });

  it('samples floor traffic at the hot path rate', () => {
    expect(sample('GET', '/api/v1/orders')).toBe(0.5);
    expect(sample('GET', '/api/v1/pos-dashboard/today')).toBe(0.5);
  });

  it('follows the decision the frontend already made', () => {
    expect(sample('GET', '/api/v1/orders', false)).toBe(0);
    expect(sample('GET', '/api/v1/customers', true)).toBe(1);
  });
});
