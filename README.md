# Income rate matrix

A table of income rates: hourly, daily, monthly and annual, in PLN, EUR, USD and RUB. Edit any cell and the other 15 are recalculated. A value can be a single number (`120`) or a range (`100-120`).

## Run

```
node server.js
```

Then open http://127.0.0.1:3000. Set `PORT` to use another port. There are no dependencies and no build step.

Tests: `node --test`

## Data files

Both files are read from disk on every page load, so edit a file and reload; no restart is needed.

### `data/exchange-rates.json`

Each `rate` is how many units of that currency one unit of the base currency (USD) buys. The base currency must have rate 1. The order of `currencies` is the column order.

**The shipped rates are placeholders. Replace them with real ones.**

Rates can also be edited in the page. Those edits apply to the open page only and are not written back to the file; "Reset to file" re-reads it.

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
- The app is stateless: the server only serves files, and everything you edit lives in the page until you reload.
- The highlighted cell is the one you last entered. The others are computed from it at full precision, so rounding never accumulates.
- In a table cell, a single separator followed by exactly three digits is a thousands separator: `1,234` and `1.234` both mean 1234. Exchange rate inputs always read a single separator as a decimal point.
