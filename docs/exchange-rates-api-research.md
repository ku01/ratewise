# Exchange-rate API research

Date of research: 2026-10-17 (a Saturday). Target date: **2026-10-16** (the day before today, a Friday).
Required currencies: USD (base), EUR, PLN, RUB. Constraints: free, no API key, Node.js with no dependencies.

Every request below was actually made with `curl` on 2026-10-17. Responses are trimmed.

## What the app needs

`data/exchange-rates.json` today:

```json
{ "base": "USD", "currencies": [
  { "code": "PLN", "symbol": "zł", "rate": 3.9294 },
  { "code": "EUR", "symbol": "€",  "rate": 0.8961 },
  { "code": "USD", "symbol": "$",  "rate": 1 },
  { "code": "RUB", "symbol": "₽",  "rate": 83.9269 } ] }
```

`public/js/rates.js#validateRatesConfig` requires every `rate` to be a finite number greater than 0 and the base
(`USD`) to be exactly `1`. `rate` = units of the currency per 1 USD. So any API must give (or allow us to derive)
`EUR/USD`, `PLN/USD` and `RUB/USD` quoted per 1 USD. The server (`server.js`) currently serves the file
statically from `/data/exchange-rates.json`, so the fetch can happen either server-side (Node `fetch`, no CORS
concerns) or in the browser (CORS needed).

## Summary of results

| API | Historical by date | Key | RUB | CORS | Weekend/holiday (asked 2026-10-17/18) | Works now |
|---|---|---|---|---|---|---|
| **Frankfurter v2** (`api.frankfurter.dev/v2`) | yes | no | **yes** (blended, incl. CBR) | `*` | returns the latest available date ≤ requested (CBR publishes Saturdays, so 2026-10-17 exists) | **yes** |
| Frankfurter v1 (`/v1`, ex-`api.frankfurter.app`) | yes | no | **no** (ECB only) | `*` | latest prior business day (2026-10-17 → 2026-10-16) | yes, but no RUB |
| **fawazahmed0 currency-api** (jsDelivr / Cloudflare Pages) | yes (daily snapshot, since 2024-03) | no | **yes** | `*` | a snapshot exists for every calendar day; future/unpublished date → 404 | **yes** |
| open.er-api.com (ExchangeRate-API open access) | **no** (latest only; `/v6/history/...` → 404) | no | yes | `*` | n/a; updated once a day | yes, latest only |
| FloatRates (`floatrates.com/daily/usd.json`) | no (latest only) | no | yes | `*` | n/a | yes, latest only |
| NBP (`api.nbp.pl`) | yes | no | **no** (RUB not in table A since 2022 → 404) | `*` | 404 "Brak danych"; use a date range and take the last row | yes, no RUB |
| CBR official (`cbr.ru/scripts/XML_daily.asp`) | yes | no | base is RUB (USD, EUR, PLN quoted in RUB) | **none** (server-only) | returns the last published rate (asked 2026-10-18 → `Date="17.10.2026"`) | yes |
| CBR JSON mirror (`cbr-xml-daily.ru`) | yes (archive by date) | no | base is RUB | `*` | 404 for dates with no publication (e.g. Sunday, Monday) | yes |
| ECB Data Portal (`data-api.ecb.europa.eu`) | yes | no | **no** (RUB series stopped 2022-03) | `*` | no row for the day (empty CSV) | yes, no RUB |
| exchangerate.host | yes | **yes** (since 2023, apilayer) | — | `*` | — | `missing_access_key` |
| openexchangerates.org | yes | **yes** (app_id) | — | `*` | — | 403 `missing_app_id` |
| currencyapi.com | yes | **yes** | — | yes | — | 401 `missing_api_key` |

Values for 2026-10-16, units per 1 USD:

| Source | EUR | PLN | RUB |
|---|---|---|---|
| Frankfurter v2 (blended) | 0.89089 | 3.8906 | 83.75 |
| Frankfurter v2 `providers=CBR` | 0.89326 | 3.8952 | 83.76 |
| Frankfurter v1 / ECB (`1/1.1253`, `4.37/1.1253`) | 0.88865 | 3.8834 | — |
| fawazahmed0 `@2026-10-16` | 0.88987006 | 3.88869273 | 83.75769663 |
| open.er-api.com latest (as of 2026-10-17 00:02 UTC) | 0.889517 | 3.884412 | 83.769598 |
| NBP (USD = 3.8827 PLN, EUR = 4.3661 PLN) → derived | 0.88929 | 3.8827 | — |
| CBR (USD = 83.76 RUB, EUR = 93.7693, PLN = 21.5034) → derived | 0.89326 | 3.8952 | 83.76 |

All sources agree to within about 0.5%.

---

## 1. Frankfurter v2 (recommended primary)

- Docs: https://frankfurter.dev/ (open source, can be self-hosted). v1 is the old ECB-only API; `api.frankfurter.app`
  now answers `301` → `api.frankfurter.dev/v1/...`.
- v2 aggregates about 80 central banks and official sources (ECB, CBR, NBP, IMF, Fed, ...). **By default rates are
  blended across all providers.** `providers=CBR` (or `ECB`, `NBP`, ...) gives one provider's official rate, and
  `expand=providers` shows which providers contributed.
- Endpoint: `GET https://api.frankfurter.dev/v2/rates?date=YYYY-MM-DD&base=USD&quotes=EUR,PLN,RUB`
- Key: none. Limits: "There are no quotas. Requests are rate-limited to prevent abuse, but there are no monthly
  or daily caps" (from the docs). No rate-limit headers are sent.
- CORS: `access-control-allow-origin: *`. Works from the browser and from Node.
- Caching: `cache-control: public, max-age=86400, stale-while-revalidate=86400, stale-if-error=86400`.
- License: "Blended rates are Frankfurter's own calculation and free to use. Direct queries to individual
  provider endpoints remain subject to each provider's terms."
- RUB: yes. `GET /v2/currency/RUB` lists 44 providers, including `CBR`, `NBP`, `IMF` and `ECB` (historical only).

```
$ curl 'https://api.frankfurter.dev/v2/rates?date=2026-10-16&base=USD&quotes=EUR,PLN,RUB'
HTTP/2 200
access-control-allow-origin: *
[{"date":"2026-10-16","base":"USD","quote":"EUR","rate":0.89089},
 {"date":"2026-10-16","base":"USD","quote":"PLN","rate":3.8906},
 {"date":"2026-10-16","base":"USD","quote":"RUB","rate":83.75}]

$ curl 'https://api.frankfurter.dev/v2/rates?date=2026-10-16&base=USD&quotes=EUR,PLN,RUB&providers=CBR'
[{"date":"2026-10-16","base":"USD","quote":"EUR","rate":0.89326},
 {"date":"2026-10-16","base":"USD","quote":"PLN","rate":3.8952},
 {"date":"2026-10-16","base":"USD","quote":"RUB","rate":83.76}]

$ curl 'https://api.frankfurter.dev/v2/rates?date=2026-10-16&base=USD&quotes=RUB&expand=providers'
[{"date":"2026-10-16","base":"USD","quote":"RUB","rate":83.75,"providers":[
  {"key":"BAM","date":"2026-10-16","rate":83.68}, ... {"key":"CBR","date":"2026-10-16","rate":83.76}, ...
  {"key":"NBP","date":"2026-10-14","rate":83.5}, {"key":"TCMB","date":"2026-10-16","rate":83.73}]}]
```

Weekend behaviour: the `date` in each row is the **effective** date, which is the latest date ≤ the requested one.

```
$ curl '.../v2/rates?date=2026-10-17&base=USD&quotes=EUR,PLN,RUB'   # Saturday
[{"date":"2026-10-17",...,"quote":"EUR","rate":0.89057}, ...,{"quote":"RUB","rate":83.74}]
$ curl '.../v2/rates?date=2026-10-18&base=USD&quotes=EUR,PLN,RUB'   # Sunday → falls back to 2026-10-17
[{"date":"2026-10-17",...}]
$ curl '.../v2/rates?date=2026-10-18&base=USD&quotes=EUR,PLN&providers=ECB'   # ECB → falls back to Friday
[{"date":"2026-10-16","base":"USD","quote":"EUR","rate":0.88865},{"date":"2026-10-16","base":"USD","quote":"PLN","rate":3.8834}]
```

Notes for implementation:
- The response does not include the base, so add `USD: 1` yourself.
- The result is an array of `{date, base, quote, rate}`. Map it as `quote → rate`.
- Store or show the returned `date`; it can be earlier than the requested date.
- Blended values can "shift in the last decimal places as new data comes in", so a past date is not strictly
  immutable. Pin `providers=CBR` if you need an official, reproducible rate. CBR covers all three quotes;
  ECB and NBP do not cover RUB.

### Frankfurter v1 (ECB only): no RUB

```
$ curl 'https://api.frankfurter.dev/v1/2026-10-16?base=USD&symbols=EUR,PLN,RUB'
{"amount":1.0,"base":"USD","date":"2026-10-16","rates":{"EUR":0.88865,"PLN":3.8834}}   # RUB silently missing
$ curl 'https://api.frankfurter.dev/v1/2026-10-16?base=USD&symbols=RUB'
HTTP/2 404  {"message":"not found"}
$ curl 'https://api.frankfurter.dev/v1/2026-10-17?base=USD&symbols=EUR,PLN'          # Saturday
{"amount":1.0,"base":"USD","date":"2026-10-16","rates":{"EUR":0.88865,"PLN":3.8834}}
```

`/v1/currencies` lists 30 currencies, and RUB is not one of them.

## 2. fawazahmed0 currency-api (recommended fallback)

- Repo: https://github.com/fawazahmed0/exchange-api. License: CC0-1.0 (data, public domain). Served as an npm
  package through jsDelivr, mirrored on Cloudflare Pages.
- Endpoints (the date is the npm package version):
  - `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-16/v1/currencies/usd.min.json`
  - fallback mirror: `https://2026-10-16.currency-api.pages.dev/v1/currencies/usd.min.json`
  - `@latest` is also available.
- Key: none. Limits: none (static CDN files). CORS: `*`. Cache: `max-age=604800`.
- Coverage: about 300 fiat and crypto codes, **lowercase keys**, RUB included.
- Data source and method are not official. It is an aggregate of market sources with lots of decimals. Fine for
  an estimate, but it is not a central-bank reference rate. History only goes back to about 2024-03 on these URLs.
- Weekend behaviour: a snapshot is published for **every calendar day**, weekends included (`@2026-10-17` exists).
  A date that is not published yet returns `404` (`@2026-10-30` → 404). The "yesterday" snapshot is normally
  available shortly after midnight UTC.

```
$ curl 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-16/v1/currencies/usd.min.json'
HTTP/2 200
access-control-allow-origin: *
{"date":"2026-10-16","usd":{"1inch":10.60453342,"aave":0.0063118638, ... ,"eur":0.88987006, ... ,
 "pln":3.88869273, ... ,"rub":83.75769663, ... ,"usd":1, ...}}

$ curl 'https://2026-10-16.currency-api.pages.dev/v1/currencies/usd.min.json'   # identical payload
{"date":"2026-10-16","usd":{...}}
```

The whole file (about 300 entries) is downloaded and then filtered to `eur`, `pln` and `rub`, uppercased.

## 3. open.er-api.com (ExchangeRate-API "Open Access"): latest only

- `GET https://open.er-api.com/v6/latest/USD`. No key, CORS `*`, updates once every 24 h. Attribution is required
  by their terms. Rate-limited (they return 429 if you poll too often; once per day is fine).
- **No historical-by-date endpoint without a key** (`/v6/history/USD/2026/10/16` → 404). This makes it only a
  last-resort fallback that gives "latest", not "yesterday".

```
{"result":"success","provider":"https://www.exchangerate-api.com",
 "time_last_update_utc":"Sat, 17 Oct 2026 00:02:32 +0000","base_code":"USD",
 "rates":{"USD":1, ... ,"EUR":0.889517, ... ,"PLN":3.884412, ... ,"RUB":83.769598, ...}}
```

FloatRates (`https://www.floatrates.com/daily/usd.json`) is similar: latest only, no key, CORS `*`, includes RUB.
Each entry has its own `date` (`"Fri, 16 Oct 2026 20:55:04 GMT"`).

## 4. NBP: National Bank of Poland (no RUB)

- `GET https://api.nbp.pl/api/exchangerates/tables/a/2026-10-16/?format=json` (whole table A), or
  `.../rates/a/usd/2026-10-16/?format=json`. No key, CORS `*`. Official, free to use.
- Rates are in PLN per unit. USD and EUR are there, but **RUB was dropped from table A in 2022**
  (`/rates/a/rub/2026-10-16/` → `404 Brak danych`).
- Weekend or holiday → `404 NotFound - Brak danych`. Workaround: query a range and take the last row.

```
$ curl 'https://api.nbp.pl/api/exchangerates/rates/a/usd/2026-10-16/?format=json'
{"table":"A","currency":"dolar amerykański","code":"USD","rates":[{"no":"202/A/NBP/2026","effectiveDate":"2026-10-16","mid":3.8827}]}
$ curl 'https://api.nbp.pl/api/exchangerates/rates/a/usd/2026-10-17/?format=json'
HTTP/1.1 404 Not Found - Brak danych
$ curl 'https://api.nbp.pl/api/exchangerates/rates/a/usd/2026-10-10/2026-10-17/?format=json'
{..."rates":[{"effectiveDate":"2026-10-12","mid":3.9211}, ... ,{"no":"202/A/NBP/2026","effectiveDate":"2026-10-16","mid":3.8827}]}
```

## 5. CBR: Central Bank of Russia

### Official XML
- `GET https://www.cbr.ru/scripts/XML_daily.asp?date_req=16/10/2026` (date is **DD/MM/YYYY**). No key.
- XML in **windows-1251**, decimal **comma**, `Nominal` must be applied (`VunitRate` is already per 1 unit).
- **No CORS header**, so it only works from the server. Sometimes it is slow or geo-blocked from outside Russia.
- Base is RUB. USD per 1 USD = `USD.Value`. EUR per 1 USD = `USD/EUR`. PLN per 1 USD = `USD/PLN`.
- Non-publication day → returns the last published table and says so in `Date`: asked for 18/10/2026, got `Date="17.10.2026"`.
  CBR sets the rate the day before it takes effect and publishes Tuesday–Saturday rates. The Saturday rate also
  applies on Sunday and Monday.

```
<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="16.10.2026" name="Foreign Currency Market">
<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>83,7600</Value><VunitRate>83,76</VunitRate></Valute>
<Valute ID="R01239">...<CharCode>EUR</CharCode><Nominal>1</Nominal>...<Value>93,7693</Value>...</Valute>
<Valute ID="R01565">...<CharCode>PLN</CharCode><Nominal>1</Nominal>...<Value>21,5034</Value>...</Valute>
```

### JSON mirror `cbr-xml-daily.ru` (unofficial)
- `GET https://www.cbr-xml-daily.ru/archive/2026/10/16/daily_json.js`, or `/daily_json.js` for the latest. CORS `*`.
- `404` for days without a CBR publication (2026-10-18 Sunday, and 2026-10-12 Monday also gave 404). You have to
  walk back day by day or follow `PreviousURL`.

```
{"Date":"2026-10-16T11:30:00+03:00","PreviousDate":"2026-10-15T11:30:00+03:00",
 "PreviousURL":"//www.cbr-xml-daily.ru/archive/2026/10/15/daily_json.js",
 "Valute":{ ..., "USD":{"CharCode":"USD","Nominal":1,"Value":83.76,...},
                 "EUR":{"Nominal":1,"Value":93.7693,...}, "PLN":{"Nominal":1,"Value":21.5034,...}}}
```

Frankfurter v2 with `providers=CBR` already gives the same CBR numbers, converted to USD base, as JSON with CORS.
That makes direct CBR integration unnecessary.

## 6. ECB Data Portal (SDMX): no RUB

- `GET https://data-api.ecb.europa.eu/service/data/EXR/D.USD+PLN+RUB.EUR.SP00.A?startPeriod=2026-10-12&endPeriod=2026-10-16&format=csvdata&detail=dataonly`
- No key, CORS `*`. EUR base, so cross-rates have to be computed. **RUB returns no rows** (the ECB suspended RUB on
  2022-03-01). A weekend date returns only the CSV header.

```
KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE
EXR.D.PLN.EUR.SP00.A,D,PLN,EUR,SP00,A,2026-10-16,4.37
EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-10-16,1.1253
```

## 7. Key-required services (excluded)

```
$ curl 'https://api.exchangerate.host/historical?date=2026-10-16'
{"success":false,"error":{"code":101,"type":"missing_access_key","info":"You have not supplied an API Access Key. ..."}}
$ curl 'https://openexchangerates.org/api/historical/2026-10-16.json'
HTTP/1.1 403  {"error":true,"status":403,"message":"missing_app_id",...}
$ curl 'https://api.currencyapi.com/v3/historical?date=2026-10-16'
HTTP/2 401  {"message":"No API key found in request","error":{"code":"missing_api_key",...}}
```

exchangerate.host used to be free and keyless but moved to apilayer with mandatory keys. The free tiers of
openexchangerates (USD base only, 1000 requests/month) and currencyapi (300 requests/month) need sign-up.

---

## Recommendation

**Primary: Frankfurter v2.**
`https://api.frankfurter.dev/v2/rates?date=<yesterday>&base=USD&quotes=EUR,PLN,RUB`
- One request returns all three needed quotes in exactly the app's convention (units per 1 USD). Add `USD: 1`.
- Free, no key, no quotas, CORS `*`, open source and self-hostable. It handles weekends and holidays by returning
  the latest earlier date, and the response's `date` says which one.
- Default blended rates are fine for an income calculator. To get official, reproducible numbers instead, add
  `&providers=CBR`, which is the only official provider covering EUR, PLN and RUB in one go.

**Fallback: fawazahmed0 currency-api.**
`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@<yesterday>/v1/currencies/usd.min.json`,
then the mirror `https://<yesterday>.currency-api.pages.dev/v1/currencies/usd.min.json`.
- Independent infrastructure (static CDN), no key, no limits, CORS `*`, includes RUB, and has a snapshot for every
  calendar day. Read `usd.eur`, `usd.pln` and `usd.rub` (lowercase keys).

**Last resort:** keep the existing `data/exchange-rates.json` as an offline fallback (or use `open.er-api.com/v6/latest/USD`,
which has no historical endpoint). Show the user that the rates are stale or "latest" rather than for the requested date.

Implementation hints:
- Compute "yesterday" as a `YYYY-MM-DD` string. Note the TZ choice: `new Date(Date.now() - 864e5).toISOString().slice(0, 10)`
  gives the UTC date. Run at 00:30 local time in CEST, this can be two days back, so use a local date if that matters.
- Fetch server-side in `server.js`: Node's global `fetch`, no dependencies. Cache the result per date in memory,
  or write it to `data/exchange-rates.json` in the existing format so `validateRatesConfig` and the tests keep working.
  Only `rate` values change; symbols stay local.
- Validate the response: all of EUR, PLN and RUB present, finite, and > 0. Otherwise try the next source.
- Record the source and the effective `date` (for example in an extra field like `"date": "2026-10-16", "source": "frankfurter"`)
  so the UI can show "Rates as of 2026-10-16".
