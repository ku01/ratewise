import { validateRatesConfig } from './public/js/rates.js';

// Server-only: fetches exchange rates for yesterday's local date from public
// APIs (no key).

// Currency codes, symbols, column order and base currency shown in the page.
// Rates are always fetched; the base currency gets rate 1.
export const CURRENCIES = {
  base: 'USD',
  currencies: [
    { code: 'PLN', symbol: 'zł' },
    { code: 'EUR', symbol: '€' },
    { code: 'USD', symbol: '$' },
    { code: 'RUB', symbol: '₽' },
  ],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

// Local calendar date of the day before `now`, as YYYY-MM-DD.
export function localYesterday(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function checkRates(rates, quotes) {
  for (const code of quotes) {
    const r = rates[code];
    if (!(typeof r === 'number' && Number.isFinite(r) && r > 0)) {
      throw new Error(`missing or invalid rate for ${code}`);
    }
  }
}

function checkDate(effective, requested) {
  if (typeof effective !== 'string' || !DATE_RE.test(effective)) {
    throw new Error(`invalid date ${JSON.stringify(effective)}`);
  }
  if (effective > requested) throw new Error(`date ${effective} is after ${requested}`);
}

// body = parsed JSON; returns {date, rates}; throws on any missing or invalid value.
export function parseFrankfurter(body, { date, base, quotes }) {
  if (!Array.isArray(body)) throw new Error('expected an array');
  const rates = {};
  let effective = null;
  for (const row of body) {
    if (row?.base !== base) throw new Error(`unexpected base ${JSON.stringify(row?.base)}`);
    checkDate(row.date, date);
    if (effective === null || row.date < effective) effective = row.date;
    rates[row.quote] = row.rate;
  }
  checkRates(rates, quotes);
  checkDate(effective, date);
  return { date: effective, rates: pick(rates, quotes) };
}

export function parseCurrencyApi(body, { date, base, quotes }) {
  const table = body?.[base.toLowerCase()];
  const rates = {};
  for (const code of quotes) rates[code] = table?.[code.toLowerCase()];
  checkRates(rates, quotes);
  checkDate(body?.date, date);
  return { date: body.date, rates };
}

function pick(rates, quotes) {
  return Object.fromEntries(quotes.map((code) => [code, rates[code]]));
}

const currencyApiPath = (base) => `/v1/currencies/${base.toLowerCase()}.min.json`;

// Source adapters, tried in order. `quotes` are upper-case codes without the base.
export const SOURCES = [
  {
    name: 'Frankfurter',
    url: (date, base, quotes) =>
      `https://api.frankfurter.dev/v2/rates?date=${date}&base=${base}&quotes=${quotes.join(',')}`,
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

// Returns getRates(template = CURRENCIES) -> Promise<response object>.
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
    const url = source.url(ctx.date, ctx.base, ctx.quotes);
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

  async function fetchLive(date, base, quotes) {
    const errors = [];
    for (const source of sources) {
      try {
        return await fetchSource(source, { date, base, quotes });
      } catch (err) {
        errors.push(`${source.name}: ${err?.message || String(err)}`);
      }
    }
    return { errors };
  }

  return async function getRates(template = CURRENCIES) {
    const { base } = template;
    const quotes = template.currencies.map((c) => c.code).filter((code) => code !== base);
    const requestedDate = localYesterday(now());
    const key = `${requestedDate}|${base}|${quotes.join(',')}`;

    if (!cache || cache.key !== key || now().getTime() >= cache.expires) {
      const entry = { key, expires: Infinity };
      entry.promise = fetchLive(requestedDate, base, quotes)
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

    const merged = {
      base,
      currencies: template.currencies.map(({ code, symbol }) => ({
        code,
        symbol,
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
