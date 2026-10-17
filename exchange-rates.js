import { validateRatesConfig } from './public/js/rates.js';

// Server-only: fetches exchange rates for yesterday's local date from public
// APIs (no key).

// All rates are quoted per 1 BASE. Every ISO 4217 currency a source returns is
// passed to the page, with a symbol and an English name from Intl.
export const BASE = 'USD';

const ISO_CODES = new Set(Intl.supportedValuesOf('currency'));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const currencyNames = new Intl.DisplayNames('en', { type: 'currency' });

// Local calendar date of the day before `now`, as YYYY-MM-DD.
export function localYesterday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || code;
  } catch {
    return code;
  }
}

export function currencyName(code) {
  try {
    return currencyNames.of(code) || code;
  } catch {
    return code;
  }
}

const isRate = (r) => typeof r === 'number' && Number.isFinite(r) && r > 0;

// Keeps ISO currencies other than the base with a valid rate; throws if none is left.
function cleanRates(raw, base) {
  const rates = {};
  for (const [code, rate] of Object.entries(raw)) {
    if (code !== base && ISO_CODES.has(code) && isRate(rate)) rates[code] = rate;
  }
  if (Object.keys(rates).length === 0) throw new Error('no usable rates');
  return rates;
}

function checkDate(effective, requested) {
  if (typeof effective !== 'string' || !DATE_RE.test(effective)) {
    throw new Error(`invalid date ${JSON.stringify(effective)}`);
  }
  if (effective > requested) throw new Error(`date ${effective} is after ${requested}`);
}

// body = parsed JSON; returns {date, rates}. Rows with a bad rate or an
// unknown code are dropped; a wrong base or date rejects the whole response.
// The effective date is the latest row date.
export function parseFrankfurter(body, { date, base }) {
  if (!Array.isArray(body)) throw new Error('expected an array');
  const raw = {};
  let effective = null;
  for (const row of body) {
    if (row?.base !== base) throw new Error(`unexpected base ${JSON.stringify(row?.base)}`);
    checkDate(row.date, date);
    if (effective === null || row.date > effective) effective = row.date;
    if (typeof row.quote === 'string') raw[row.quote] = row.rate;
  }
  const rates = cleanRates(raw, base);
  return { date: effective, rates };
}

export function parseCurrencyApi(body, { date, base }) {
  const table = body?.[base.toLowerCase()];
  if (!table || typeof table !== 'object') throw new Error(`no ${base} table`);
  checkDate(body?.date, date);
  const raw = Object.fromEntries(Object.entries(table).map(([code, rate]) => [code.toUpperCase(), rate]));
  return { date: body.date, rates: cleanRates(raw, base) };
}

const currencyApiPath = (base) => `/v1/currencies/${base.toLowerCase()}.min.json`;

// Source adapters, tried in order.
export const SOURCES = [
  {
    name: 'Frankfurter',
    url: (date, base) => `https://api.frankfurter.dev/v2/rates?date=${date}&base=${base}`,
    parse: parseFrankfurter,
  },
  {
    name: 'currency-api (jsDelivr)',
    url: (date, base) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}${currencyApiPath(base)}`,
    parse: parseCurrencyApi,
  },
  {
    name: 'currency-api (pages.dev)',
    url: (date, base) => `https://${date}.currency-api.pages.dev${currencyApiPath(base)}`,
    parse: parseCurrencyApi,
  },
];

// Returns getRates() -> Promise<response object>.
// Rejects with an Error listing every source's failure if no source works.
export function createRatesProvider({
  fetch = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = 4000,
  retryMs = 5 * 60 * 1000,
  sources = SOURCES,
} = {}) {
  let cache = null; // {key, promise, expires}

  async function fetchSource(source, ctx) {
    const url = source.url(ctx.date, ctx.base);
    let res;
    try {
      res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (err) {
      throw new Error(isAbort(err) ? 'timeout' : err?.message || String(err));
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let body;
    try {
      body = JSON.parse(await res.text());
    } catch (err) {
      throw new Error(isAbort(err) ? 'timeout' : 'invalid JSON');
    }
    return { ...source.parse(body, ctx), source: source.name, sourceUrl: url };
  }

  async function fetchLive(date, base) {
    const errors = [];
    for (const source of sources) {
      try {
        return await fetchSource(source, { date, base });
      } catch (err) {
        errors.push(`${source.name}: ${err?.message || String(err)}`);
      }
    }
    return { errors };
  }

  return async function getRates() {
    const base = BASE;
    const requestedDate = localYesterday(now());
    const key = `${requestedDate}|${base}`;

    if (!cache || cache.key !== key || now().getTime() >= cache.expires) {
      const entry = { key, expires: Infinity };
      entry.promise = fetchLive(requestedDate, base)
        .catch((err) => ({ errors: [err?.message || String(err)] }))
        .then((result) => {
          if (result.errors) {
            entry.expires = now().getTime() + retryMs;
            console.warn(`exchange rates for ${requestedDate}: all sources failed (${result.errors.join('; ')})`);
          }
          return result;
        });
      cache = entry;
    }
    const live = await cache.promise;

    if (live.errors) {
      throw new Error(`Exchange rates for ${requestedDate} are unavailable (${live.errors.join('; ')}).`);
    }

    const codes = [base, ...Object.keys(live.rates)].sort();
    const merged = {
      base,
      currencies: codes.map((code) => ({
        code,
        symbol: currencySymbol(code),
        name: currencyName(code),
        rate: code === base ? 1 : live.rates[code],
      })),
      requestedDate,
      date: live.date,
      source: live.source,
      sourceUrl: live.sourceUrl,
    };
    const check = validateRatesConfig(merged);
    if (!check.ok) throw new Error(`Exchange rates for ${requestedDate}: ${live.source}: ${check.error}`);
    return merged;
  };
}

function isAbort(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError';
}
