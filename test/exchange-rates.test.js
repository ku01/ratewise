import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, createRatesProvider, currencyName, currencySymbol, localYesterday } from '../exchange-rates.js';
import { validateRatesConfig } from '../public/js/rates.js';

const FRANKFURTER = 'https://api.frankfurter.dev/v2/rates?date=2026-10-16&base=USD';
const JSDELIVR = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-16/v1/currencies/usd.min.json';
const PAGES = 'https://2026-10-16.currency-api.pages.dev/v1/currencies/usd.min.json';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// routes: array of [urlPrefix, handler]; handler(url, init) returns a Response or throws.
// Records every call in fake.calls.
function fakeFetch(routes) {
  const fake = async (url, init) => {
    fake.calls.push(url);
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    if (!route) throw new TypeError('fetch failed');
    return route[1](url, init);
  };
  fake.calls = [];
  return fake;
}

// Like the live API, the rows include the base itself.
const frankfurterRows = (date = '2026-10-16', overrides = {}) =>
  ['EUR', 'PLN', 'RUB', 'USD']
    .map((quote) => ({ date, base: 'USD', quote, rate: { EUR: 0.89089, PLN: 3.8906, RUB: 83.75, USD: 1 }[quote] }))
    .map((row) => ({ ...row, ...overrides[row.quote] }))
    .filter((row) => row.rate !== undefined);

const currencyApiBody = { date: '2026-10-16', usd: { eur: 0.8901, pln: 3.89, rub: 83.7, btc: 0.0000089 } };

const fixedNow = () => new Date(2026, 9, 17, 10, 0);
const ratesOf = (result) => Object.fromEntries(result.currencies.map((c) => [c.code, c.rate]));

// Silence the fallback log line.
let warn;
beforeEach(() => {
  warn = console.warn;
  console.warn = () => {};
});
afterEach(() => {
  console.warn = warn;
});

describe('localYesterday', () => {
  for (const [now, expected] of [
    [new Date(2026, 9, 17, 12), '2026-10-16'],
    [new Date(2026, 2, 1, 12), '2026-02-28'],
    [new Date(2026, 0, 1, 12), '2025-12-31'],
    [new Date(2024, 2, 1, 12), '2024-02-29'],
    [new Date(2026, 9, 17, 0, 5), '2026-10-16'],
  ]) {
    test(`${now.toString()} → ${expected}`, () => assert.equal(localYesterday(now), expected));
  }
});

test('Frankfurter success', async () => {
  const fetch = fakeFetch([['https://api.frankfurter.dev/', () => json(frankfurterRows())]]);
  const result = await createRatesProvider({ fetch, now: fixedNow })();
  assert.deepEqual(fetch.calls, [FRANKFURTER]);
  assert.deepEqual(result, {
    base: 'USD',
    currencies: [
      { code: 'EUR', symbol: '€', name: 'Euro', rate: 0.89089 },
      { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', rate: 3.8906 },
      { code: 'RUB', symbol: '₽', name: 'Russian Ruble', rate: 83.75 },
      { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1 },
    ],
    requestedDate: '2026-10-16',
    date: '2026-10-16',
    source: 'Frankfurter',
    sourceUrl: FRANKFURTER,
  });
  assert.equal(validateRatesConfig(result).ok, true);
});

test('weekend: latest row date is the effective date', async () => {
  const rows = frankfurterRows('2026-10-14');
  rows[1].date = '2026-10-15';
  const fetch = fakeFetch([['https://api.frankfurter.dev/', () => json(rows)]]);
  const result = await createRatesProvider({ fetch, now: fixedNow })();
  assert.equal(result.date, '2026-10-15');
  assert.equal(result.requestedDate, '2026-10-16');
  assert.equal(result.source, 'Frankfurter');
});

describe('Frankfurter rejected → jsDelivr', () => {
  const cases = {
    'HTTP 500': [() => json({ message: 'boom' }, 500), 'HTTP 500'],
    'fetch failed': [() => { throw new TypeError('fetch failed'); }, 'fetch failed'],
    'invalid JSON': [() => new Response('<html>', { status: 200 }), 'invalid JSON'],
    'no usable rates': [() => json(frankfurterRows('2026-10-16', { EUR: { rate: 0 }, PLN: { rate: '3.89' }, RUB: { rate: undefined } })), 'no usable rates'],
    'wrong base': [() => json(frankfurterRows('2026-10-16', { EUR: { base: 'EUR' } })), 'unexpected base'],
    'date after requested': [() => json(frankfurterRows('2026-10-17')), 'after'],
  };
  for (const [name, [handler]] of Object.entries(cases)) {
    test(name, async () => {
      const fetch = fakeFetch([
        ['https://api.frankfurter.dev/', handler],
        ['https://cdn.jsdelivr.net/', () => json(currencyApiBody)],
      ]);
      const result = await createRatesProvider({ fetch, now: fixedNow })();
      assert.deepEqual(fetch.calls, [FRANKFURTER, JSDELIVR]);
      assert.equal(result.source, 'currency-api (jsDelivr)');
      assert.equal(result.sourceUrl, JSDELIVR);
      assert.equal(result.date, '2026-10-16');
      assert.deepEqual(ratesOf(result), { PLN: 3.89, EUR: 0.8901, USD: 1, RUB: 83.7 });
    });
  }
  test('error messages are reported in the rejection', async () => {
    for (const [name, [handler, message]] of Object.entries(cases)) {
      const fetch = fakeFetch([['https://api.frankfurter.dev/', handler]]);
      await assert.rejects(
        createRatesProvider({ fetch, now: fixedNow })(),
        new RegExp(`Frankfurter: [^;]*${message}`),
        name,
      );
    }
  });
});

test('jsDelivr 404 → pages.dev mirror', async () => {
  const fetch = fakeFetch([
    ['https://api.frankfurter.dev/', () => json([], 503)],
    ['https://cdn.jsdelivr.net/', () => json({}, 404)],
    [PAGES, () => json(currencyApiBody)],
  ]);
  const result = await createRatesProvider({ fetch, now: fixedNow })();
  assert.deepEqual(fetch.calls, [FRANKFURTER, JSDELIVR, PAGES]);
  assert.equal(result.source, 'currency-api (pages.dev)');
  assert.equal(result.sourceUrl, PAGES);
  assert.equal(ratesOf(result).RUB, 83.7);
});

test('all sources fail → rejects with every error', async () => {
  const fetch = fakeFetch([
    ['https://api.frankfurter.dev/', () => json([], 503)],
    ['https://cdn.jsdelivr.net/', () => json({}, 404)],
  ]);
  const error = await createRatesProvider({ fetch, now: fixedNow })().catch((e) => e);
  assert.equal(fetch.calls.length, 3);
  assert.ok(error instanceof Error);
  for (const part of [
    '2026-10-16',
    'Frankfurter: HTTP 503',
    'currency-api (jsDelivr): HTTP 404',
    'currency-api (pages.dev): fetch failed',
  ]) {
    assert.ok(error.message.includes(part), `error mentions ${part}: ${error.message}`);
  }
});

test('timeout falls through with "timeout"', async () => {
  const hang = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  const fetch = fakeFetch([
    ['https://api.frankfurter.dev/', hang],
    ['https://cdn.jsdelivr.net/', () => json(currencyApiBody)],
  ]);
  const getRates = createRatesProvider({ fetch, now: fixedNow, timeoutMs: 20 });
  assert.equal((await getRates()).source, 'currency-api (jsDelivr)');

  const allHang = fakeFetch([['https://', hang]]);
  await assert.rejects(
    createRatesProvider({ fetch: allHang, now: fixedNow, timeoutMs: 20 })(),
    /Frankfurter: timeout; currency-api \(jsDelivr\): timeout; currency-api \(pages\.dev\): timeout/,
  );
});

test('cache: one fetch per day, shared by concurrent calls', async () => {
  let current = fixedNow();
  const fetch = fakeFetch([
    ['https://api.frankfurter.dev/', (url) => json(frankfurterRows(new URL(url).searchParams.get('date')))],
  ]);
  const getRates = createRatesProvider({ fetch, now: () => current });

  const [a, b] = await Promise.all([getRates(), getRates()]);
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(a, b);

  current = new Date(2026, 9, 17, 23, 59);
  await getRates();
  assert.equal(fetch.calls.length, 1);

  current = new Date(2026, 9, 18, 0, 1);
  const next = await getRates();
  assert.equal(fetch.calls.length, 2);
  assert.match(fetch.calls[1], /date=2026-10-17&/);
  assert.equal(next.requestedDate, '2026-10-17');
  assert.equal(next.date, '2026-10-17');
});

test('failure cache: retried only after retryMs', async () => {
  let current = fixedNow();
  let up = false;
  const fetch = fakeFetch([
    ['https://api.frankfurter.dev/', () => (up ? json(frankfurterRows()) : json([], 503))],
  ]);
  const getRates = createRatesProvider({ fetch, now: () => current, retryMs: 60_000 });

  await assert.rejects(getRates(), /HTTP 503/);
  assert.equal(fetch.calls.length, 3);

  up = true;
  current = new Date(current.getTime() + 59_000);
  await assert.rejects(getRates(), /HTTP 503/);
  assert.equal(fetch.calls.length, 3);

  current = new Date(current.getTime() + 2_000);
  assert.equal((await getRates()).source, 'Frankfurter');
  assert.equal(fetch.calls.length, 4);
});

test('bad rows, non-ISO codes and crypto are dropped', async () => {
  const rows = [
    ...frankfurterRows('2026-10-16', { EUR: { rate: 0 }, PLN: { rate: '3.89' } }),
    { date: '2026-10-16', base: 'USD', quote: 'CNH', rate: 7.1 },
    { date: '2026-10-16', base: 'USD', quote: 'XAU', rate: 0.00024 },
    { date: '2026-10-16', base: 'USD', quote: 'GBP', rate: 0.75 },
  ];
  const fetch = fakeFetch([['https://api.frankfurter.dev/', () => json(rows)]]);
  const result = await createRatesProvider({ fetch, now: fixedNow })();
  assert.deepEqual(ratesOf(result), { GBP: 0.75, RUB: 83.75, USD: 1 });

  const api = fakeFetch([
    ['https://api.frankfurter.dev/', () => json([], 503)],
    ['https://cdn.jsdelivr.net/', () => json(currencyApiBody)],
  ]);
  const fallback = await createRatesProvider({ fetch: api, now: fixedNow })();
  assert.ok(!('BTC' in ratesOf(fallback)));
});

test('base, symbols and names', () => {
  assert.equal(BASE, 'USD');
  assert.equal(currencySymbol('PLN'), 'zł');
  assert.equal(currencySymbol('GBP'), '£');
  assert.equal(currencySymbol('CHF'), 'CHF');
  assert.equal(currencyName('JPY'), 'Japanese Yen');
});
