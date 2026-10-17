# Income rate matrix

A table of income rates: hourly, daily, monthly and annual, in PLN, EUR, USD and RUB. Edit any cell and the other 15 are recalculated. A value can be a single number (`120`) or a range (`100-120`).

## Run

```
node server.js
```

Then open http://127.0.0.1:3000. Set `PORT` to use another port. There are no dependencies and no build step.

Tests: `node --test`

## Data files

Both files are read from disk on every page load, so edit a file and reload; no restart is needed (except to force a refetch of exchange rates, see below).

### `data/exchange-rates.json`

This file sets the currency codes, symbols, column order (the order of `currencies`) and the base currency. Each `rate` is how many units of that currency one unit of the base currency (USD) buys; the base currency must have rate 1.

The rates actually used come from a public API (no key) for yesterday's local date, served to the page by the server at `/api/exchange-rates`:

1. [Frankfurter v2](https://frankfurter.dev) (`api.frankfurter.dev`), blended rates.
2. [fawazahmed0 currency-api](https://github.com/fawazahmed0/exchange-api) on jsDelivr, then its `currency-api.pages.dev` mirror.
3. The rates in this file, with a warning shown in the page that they may be out of date.

Results are cached in server memory per day; a failure is retried after 5 minutes. Restart the server to force a refetch. On weekends and holidays the API may return the latest earlier date, which the page shows. API results are never written back to the file.

Rates can also be edited in the page. Those edits apply to the open page only; "Reset rates" reloads them from the server.

### `data/presets.json`

A JSON array of the rates shown in the sidebar. Each entry is an object:

```json
[
  { "amount": 5000, "currency": "USD", "period": "monthly" },
  { "amount": [300, 320], "currency": "USD", "period": "daily" },
  { "amount": 25000, "currency": "PLN", "period": "monthly", "label": "Target offer" }
]
```

| Field | Required | Value |
|---|---|---|
| `amount` | yes | a number, or `[min, max]` for a range |
| `currency` | yes | a `code` from `data/exchange-rates.json` |
| `period` | yes | `hourly`, `daily`, `monthly` or `annual` |
| `label` | no | text shown in the sidebar; defaults to the amount and currency |

An entry that does not fit this shape is still listed, disabled, with the reason.

## Assumptions

- 8 hours per day, 21 days per month, 12 months per year. Change them in `public/js/config.js`, along with the decimals shown per row.
- The app is stateless apart from the in-memory exchange-rate cache: the server serves files and fetches rates from `api.frankfurter.dev`, `cdn.jsdelivr.net` or `currency-api.pages.dev` (outbound network), and everything you edit lives in the page until you reload.
- The highlighted cell is the one you last entered. The others are computed from it at full precision, so rounding never accumulates.
- In a table cell, a single separator followed by exactly three digits is a thousands separator: `1,234` and `1.234` both mean 1234. Exchange rate inputs always read a single separator as a decimal point.
