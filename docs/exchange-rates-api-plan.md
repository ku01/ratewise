# Plan: exchange rates from a public API

Date: 2026-10-17. Input: `docs/exchange-rates-api-research.md`.

## Goal

The app gets exchange rates from a public API that needs no key. It asks for **yesterday's local date**
(`YYYY-MM-DD`; on 2026-10-17 that is `2026-10-16`). The static `data/exchange-rates.json` is no longer the main source.
The currencies are USD (base), EUR, PLN and RUB. Each `rate` is the number of units of that currency per 1 USD, as it is now.

## Decisions

| Topic | Decision |
|---|---|
| Where to fetch | **On the server**, in a new module `exchange-rates.js` that `server.js` uses. It uses Node's global `fetch` (Node ≥ 18; the dev machine has v25), so there are no dependencies. The browser makes one same-origin call. This avoids CORS, a request from every tab to third parties, and duplicated fallback logic. |
| New endpoint | `GET /api/exchange-rates` returns JSON in the **same shape as `data/exchange-rates.json`** plus metadata fields. `validateRatesConfig` keeps working unchanged because it ignores unknown fields. |
| Sources, in order | 1. Frankfurter v2: `https://api.frankfurter.dev/v2/rates?date=D&base=USD&quotes=EUR,PLN,RUB` (blended rates, the default; no `providers=`). 2. fawazahmed0 on jsDelivr: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@D/v1/currencies/usd.min.json`. 3. The fawazahmed0 mirror: `https://D.currency-api.pages.dev/v1/currencies/usd.min.json`. 4. **Last resort: the rates in `data/exchange-rates.json`**, shown with a visible warning. |
| Keep static JSON? | **Yes.** It becomes the *currency template* and the last-resort fallback. It supplies the currency list, column order, symbols (`zł € $ ₽`) and base, plus fallback rates. APIs only replace the `rate` values. The server **never writes** API results back to the file, so there is no git churn and no file-write race. |
| Which currencies to ask for | Every code in the template except the base: `quotes = template codes − base`. Adding a currency to the JSON is then enough. |
| "Yesterday" | Local server time: `new Date(y, m, d - 1)` built from `getFullYear/getMonth/getDate`, then formatted with zero padding. Do **not** use `toISOString()`, because that gives the UTC date. |
| Effective date | Frankfurter can return an earlier date (weekend or holiday) in each row's `date`. Use the **earliest** row date as the effective `date`. Reject a row date that is *after* the requested date, or that is not `YYYY-MM-DD`. For fawazahmed0 use `json.date`, with the same checks. |
| Validation | Every quote must be present, a `number`, finite, and > 0. Then the merged result must pass `validateRatesConfig`. If any check fails, try the next source. |
| Timeout | `AbortSignal.timeout(timeoutMs)` on each request, with a default of **4000 ms**. The worst case before falling back to the file is about 12 s, and that delay is then cached (see below). |
| Cache | In memory, inside the provider object, with **one entry keyed by the requested date**. It stores the *promise*, so concurrent requests share one fetch. An API success is kept until the date changes. A file fallback is kept for **5 minutes** (`retryMs`), so an offline machine does not wait 12 s on every page load, while the API is still retried soon. A new day changes the key, which triggers a fresh fetch. There is no on-disk cache. |
| Template reading | The server reads `data/exchange-rates.json` from disk on every `/api/exchange-rates` request, as it does today, so edits to symbols or order take effect on reload. Only the API rates are cached; the merge with the template runs on every request. |
| Bad template | If the template is unreadable or fails `validateRatesConfig`, the endpoint returns `500` with a plain-text message. The client shows it in the existing banner. |
| UI | Show a line under the rates list: "Rates as of 2026-10-16 · Frankfurter". If the effective date is earlier than the requested one, add "(latest available for 2026-10-16)". On fallback, show a visible warning box: "Live exchange rates are unavailable (…). Using the rates from data/exchange-rates.json, which may be out of date." Rename "Reset to file" to "Reset rates". It re-fetches `/api/exchange-rates` (served from cache). |

## Response contract: `GET /api/exchange-rates`

Success from an API (`200`, `Cache-Control: no-store`, the same as other responses):

```json
{
  "base": "USD",
  "currencies": [
    { "code": "PLN", "symbol": "zł", "rate": 3.8906 },
    { "code": "EUR", "symbol": "€",  "rate": 0.89089 },
    { "code": "USD", "symbol": "$",  "rate": 1 },
    { "code": "RUB", "symbol": "₽",  "rate": 83.75 }
  ],
  "requestedDate": "2026-10-16",
  "date": "2026-10-16",
  "source": "Frankfurter",
  "sourceUrl": "https://api.frankfurter.dev/v2/rates?date=2026-10-16&base=USD&quotes=PLN,EUR,RUB",
  "warning": null
}
```

Fallback to the file (still `200`):

```json
{
  "base": "USD",
  "currencies": [ "...rates from data/exchange-rates.json..." ],
  "requestedDate": "2026-10-16",
  "date": null,
  "source": "data/exchange-rates.json",
  "sourceUrl": null,
  "warning": "Live exchange rates for 2026-10-16 are unavailable (Frankfurter: HTTP 503; currency-api (jsDelivr): timeout; currency-api (pages.dev): fetch failed). Using the rates from data/exchange-rates.json, which may be out of date."
}
```

Metadata fields, in short: `requestedDate` is the date asked for. `date` is the date the rates are for (`null` for the file). `source` is a display name. `warning` is `null` or text for the UI. The `_comment` field is not copied.

## Files

### New: `exchange-rates.js` (repo root, next to `server.js`; server-only, not under `public/`)

```js
import { validateRatesConfig } from './public/js/rates.js';

export const FILE_SOURCE = 'data/exchange-rates.json';

// Local calendar date of the day before `now`, as YYYY-MM-DD.
export function localYesterday(now = new Date()) { ... }

// Source adapters. Each returns {date, rates: {CODE: number}} or throws Error with a short message.
// `quotes` are upper-case codes without the base, e.g. ['PLN', 'EUR', 'RUB'].
export const SOURCES = [
  { name: 'Frankfurter',            url: (date, base, quotes) => ..., parse: parseFrankfurter },
  { name: 'currency-api (jsDelivr)', url: (date, base) => ...,         parse: parseCurrencyApi },
  { name: 'currency-api (pages.dev)', url: (date, base) => ...,        parse: parseCurrencyApi },
];

// body = parsed JSON; returns {date, rates}; throws on any missing or invalid value.
export function parseFrankfurter(body, { date, base, quotes }) { ... }
export function parseCurrencyApi(body, { date, base, quotes }) { ... }

// Returns a function getRates(template) -> Promise<response object as in the contract above>.
// `template` is the parsed data/exchange-rates.json (already known to be valid).
export function createRatesProvider({
  fetch = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = 4000,
  retryMs = 5 * 60 * 1000,
  sources = SOURCES,
} = {}) { ... }
```

Implementation notes:

- `localYesterday`: `const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)`, then
  `` `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` ``.
- A shared helper validates rates: `checkRates(rates, quotes)` throws `` `missing or invalid rate for ${code}` ``
  unless `typeof r === 'number' && Number.isFinite(r) && r > 0`.
- A shared helper validates the date: `checkDate(effective, requested)` requires `/^\d{4}-\d{2}-\d{2}$/` and `effective <= requested`
  (string comparison is correct for ISO dates).
- `parseFrankfurter`: the body must be an array. Each row must have `base === base`. Map `quote → rate`. Effective date = the minimum of
  the row `date` values. Then run `checkRates` and `checkDate`.
- `parseCurrencyApi`: `const table = body?.[base.toLowerCase()]`; `rates[code] = table?.[code.toLowerCase()]`;
  date = `body.date`. Then `checkRates` and `checkDate`. Ignore the other ~300 keys.
- Fetching one source (a private helper `fetchSource(source, ctx)`): `fetch(url, { signal: AbortSignal.timeout(timeoutMs),
  headers: { accept: 'application/json' } })`. A non-OK status throws `HTTP ${status}`. Invalid JSON throws `invalid JSON`.
  An abort or timeout (`err.name === 'TimeoutError' || 'AbortError'`) throws `timeout`. Any other error uses `err.message`.
- Fetching all sources (private `fetchLive(date, base, quotes)`): try the sources in order and return the first success as
  `{date, rates, source: name, sourceUrl}`. If all fail, return `{ errors: ['Frankfurter: HTTP 503', ...] }`.
  Never throw out of the provider, so a network problem cannot crash the server.
- Cache (`getRates`): `requested = localYesterday(now())`; key = `` `${requested}|${base}|${quotes.join(',')}` `` (so an
  edited template invalidates it). Keep `let cache = { key, promise, expires }`. Reuse the cached promise if the key matches and
  `now() < expires`. Otherwise start `fetchLive` and set `expires = Infinity`. When the result is a failure, set
  `expires = now() + retryMs`.
- Merge (`getRates` after awaiting): copy `template.currencies` in order, keeping `code` and `symbol`. Set `rate` from the live
  rates, and `1` for the base. On failure, keep the template's `rate`s and build `warning` from `errors`. Run
  `validateRatesConfig` on the merged object as a final guard. If it fails, which should be unreachable, return the file fallback
  with that error added to the warning.
- Logging: a single `console.warn` line per fallback, with no stack traces.

### Change: `server.js`

- `import { createRatesProvider, FILE_SOURCE } from './exchange-rates.js';` and
  `import { validateRatesConfig } from './public/js/rates.js';`
- `const getRates = createRatesProvider();` at module level.
- Add `const RATES_API = '/api/exchange-rates';`. In the request handler, after `pathname` is decoded and **before** `resolveFile`:

  ```js
  if (pathname === RATES_API) return serveRates(req, res);
  ```

- New `async function serveRates(req, res)`:
  1. Read and parse `data/exchange-rates.json` (`path.join(DATA_DIR, 'exchange-rates.json')`). If it is unreadable, invalid JSON or
     fails `validateRatesConfig`, call `send(res, 500, `${FILE_SOURCE}: ${error}`)`.
  2. `const body = JSON.stringify(await getRates(template), null, 2);`
  3. Call `send(res, 200, req.method === 'HEAD' ? undefined : body, CONTENT_TYPES['.json'])`.
- Keep `/data/exchange-rates.json` in `DATA_FILES`. It is still a readable file, it costs nothing, and it is useful for debugging.
- Update the comment above `createServer` to say that exchange rates come from `/api/exchange-rates`, which is cached per day.

### Change: `public/js/app.js`

- `const RATES_URL = 'api/exchange-rates';` (relative, like the existing URLs).
- `fetchJson`: when `!res.ok`, include the response text if there is any:
  `` throw new Error(`${url}: HTTP ${res.status}${text ? ` – ${text}` : ''}`) ``. This lets the banner show the server's 500 message.
- `state.ratesMeta = null` holds `{requestedDate, date, source, warning}`. Set it in `loadRates()` from the raw JSON, before or
  after `validateRatesConfig`. Do not change `validateRatesConfig`.
- New `renderRatesMeta()`:
  - `#rates-source` text: if `date` is set, use `` `Rates as of ${date} · ${source}` `` and append
    `` ` (latest available for ${requestedDate})` `` when `date < requestedDate`. Otherwise use `` `Rates from ${source}` ``.
  - `#rates-warning`: `textContent = warning ?? ''` and `hidden = !warning`.
- Call `renderRatesMeta()` wherever `renderRates()` is called after a load: in `init()` and in `resetRates()`. Don't call it on
  per-input `commitRate` re-renders, because it does not change there.
- Keep the existing `resetRates` flow. It already re-calls `loadRates()`, which now hits the API endpoint.

### Change: `public/index.html`

In the "Exchange rates" panel:

```html
<div class="panel-head">
  <h2>Exchange rates</h2>
  <button id="reset-rates" type="button">Reset rates</button>
</div>
<p id="rates-warning" class="banner" role="alert" hidden></p>
<ul id="rates" class="rates"></ul>
<p id="rates-source" class="note"></p>
<p class="note">
  Changes here apply to this page only. Rates are loaded for yesterday's date from a public API;
  <code>data/exchange-rates.json</code> sets the currencies and symbols and is used if the API is unavailable.
</p>
```

### Change: `public/styles.css` (only if needed)

`#rates-warning` reuses `.banner`. If `.banner`'s `max-width` or `margin` looks wrong inside the panel, add
`.panel .banner { margin: 12px 0; }`. No other changes.

### Change: `data/exchange-rates.json`

Keep the structure, symbols and order. Replace the `_comment` with:
`"Currencies, symbols and column order. Rates are fetched daily from a public API; the rates here are used only if every API fails."`.
Optionally refresh the rates to the 2026-10-16 Frankfurter values (PLN 3.8906, EUR 0.89089, RUB 83.75). The test only checks validity and codes.

### Change: `README.md`

- "Data files → `data/exchange-rates.json`": rates come from Frankfurter v2 for yesterday's local date. The fallbacks are
  fawazahmed0 currency-api (jsDelivr, then pages.dev) and then this file's rates, with a warning in the page. The file sets codes,
  symbols, order and base. Results are cached in server memory per day, and a failure is retried after 5 minutes. Restart the
  server to force a refetch.
- Remove "**The shipped rates are placeholders…**" and change "Reset to file" to "Reset rates".
- "Assumptions": the server now also calls `api.frankfurter.dev` / `cdn.jsdelivr.net` / `currency-api.pages.dev`
  (outbound network), while the app stays stateless apart from the in-memory rates cache.

### New: `test/exchange-rates.test.js`

There is no real network. Every test passes a fake `fetch` to `createRatesProvider`, plus a fixed `now`
(`() => new Date(2026, 9, 17, 10, 0)`, which is local time). Use the `RATES_JSON` fixture from `test/fixtures.js` as the template.

A helper builds the fake fetch:

```js
// routes: array of [urlPrefix, handler]; handler(url, init) returns a Response or throws.
// Records every call in fake.calls.
function fakeFetch(routes) { ... }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
```

Tests:

1. `localYesterday`: `2026-10-17 → 2026-10-16`; `2026-03-01 → 2026-02-28`; `2026-01-01 → 2025-12-31`;
   `2024-03-01 → 2024-02-29`; just after local midnight (`new Date(2026, 9, 17, 0, 5)`) → `2026-10-16`.
2. Frankfurter success: the URL requested is exactly
   `https://api.frankfurter.dev/v2/rates?date=2026-10-16&base=USD&quotes=PLN,EUR,RUB`. The result keeps the template order and
   symbols, has `USD: 1`, `source: 'Frankfurter'`, `date: '2026-10-16'` and `warning: null`, and passes `validateRatesConfig`.
   Only one fetch call is made.
3. Weekend effective date: rows dated `2026-10-15` for a requested `2026-10-16` give `date: '2026-10-15'` and
   `requestedDate: '2026-10-16'`.
4. Frankfurter is rejected and the provider falls through to jsDelivr, once for each of: HTTP 500; a thrown `TypeError('fetch failed')`;
   invalid JSON; RUB missing; a rate of `0`; a string rate; a row date after the requested date. The jsDelivr payload uses
   lowercase keys (`{date, usd: {eur, pln, rub, btc: ...}}`). Check the result is `source: 'currency-api (jsDelivr)'` with the correct values.
5. jsDelivr returns 404, so the pages.dev mirror is used. Check the URL `https://2026-10-16.currency-api.pages.dev/v1/currencies/usd.min.json`.
6. All three fail, so the result is the file fallback: the template rates are unchanged, `source: 'data/exchange-rates.json'`, `date: null`, and
   `warning` mentions every source name and the requested date.
7. Timeout: a fetch that never resolves until `init.signal` aborts (use `timeoutMs: 20`) falls through with the error `timeout`.
8. Cache: a second `getRates` call on the same day makes no new fetch calls. Two concurrent calls share one fetch. Moving `now`
   to the next day fetches again with the new date.
9. Failure cache: after a fallback, a call within `retryMs` makes no fetch. After `retryMs` (advance the fake `now`) the sources are tried again.
10. Template codes drive the quotes: a template without RUB requests `quotes=PLN,EUR`, and the result has no RUB.

Keep `test/rates.test.js` as it is. It still checks that the shipped JSON is valid.

The server handler does not get a unit test. It is a thin wrapper and is checked manually below. `server.js` starts
listening when it is imported, so it should not be imported in tests.

## Error handling summary

| Situation | Result |
|---|---|
| Frankfurter down, slow, or with a bad payload | The next source is used silently. `source` shows which one. |
| All APIs fail | `200` with the file rates and `warning`. The UI shows a warning box. The API is retried after 5 min. |
| Template file missing, invalid JSON, or invalid content | `500` with a text message. The existing banner shows "Cannot load exchange rates. api/exchange-rates: HTTP 500 – …" and nothing else renders, as today. |
| An effective date earlier than requested (weekend or holiday) | Accepted. The UI shows "(latest available for …)". |
| An effective date later than requested, or malformed | Rejected, and the next source is tried. |
| An exception inside the provider | Caught. The provider never rejects. |

## Checklist

1. [ ] Create `exchange-rates.js` with `localYesterday`, `parseFrankfurter`, `parseCurrencyApi`, `SOURCES`, `FILE_SOURCE` and `createRatesProvider`.
2. [ ] Create `test/exchange-rates.test.js` with the 10 tests above. Run `npm test` until it passes.
3. [ ] `server.js`: add the `/api/exchange-rates` route and `serveRates`, and update the comment.
4. [ ] `public/js/app.js`: change `RATES_URL`, add the `fetchJson` error text, add `state.ratesMeta` and `renderRatesMeta()`, and wire it into `init` and `resetRates`.
5. [ ] `public/index.html`: add `#rates-warning` and `#rates-source`, rename the button, and update the note.
6. [ ] `public/styles.css`: adjust the spacing of the panel banner only if it is needed.
7. [ ] `data/exchange-rates.json`: update the `_comment`, and refresh the fallback rates if you choose to.
8. [ ] `README.md`: update the data-files section, the reset button name and the assumptions.
9. [ ] Run `npm test` again (all suites) and do the manual verification below.

## Verification

```sh
npm test                                   # all tests pass, no network access needed

PORT=3000 node server.js &                 # or: npm start
curl -s http://127.0.0.1:3000/api/exchange-rates | jq .
#   expect: requestedDate == yesterday's local date, source "Frankfurter",
#           date <= requestedDate, rates close to the research values, symbols zł € $ ₽, USD rate 1
time curl -s http://127.0.0.1:3000/api/exchange-rates > /dev/null   # second call is immediate (cache)
curl -sI http://127.0.0.1:3000/api/exchange-rates                   # HEAD → 200, application/json
curl -s http://127.0.0.1:3000/data/presets.json | head -3           # static data still served
kill %1
```

Check the fallback without editing code. Point the process at an unreachable proxy so that every outbound fetch fails.
Node's `fetch` honours `NODE_USE_ENV_PROXY=1` with `HTTPS_PROXY` on Node ≥ 24. If that is not available, temporarily pass
`sources: []` in `server.js` and revert it afterwards.

```sh
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9 node server.js &
curl -s http://127.0.0.1:3000/api/exchange-rates | jq '{source, date, warning}'
#   expect: source "data/exchange-rates.json", date null, warning text present
kill %1
```

In a browser (http://127.0.0.1:3000):

- The table renders. The line under the rates reads "Rates as of 2026-10-16 · Frankfurter", and no warning box is shown.
- Edit a rate so the "edited" marker appears, then press "Reset rates". The rates are back to the API values.
- In fallback mode, the warning box is visible above the rates list and the table still works.
