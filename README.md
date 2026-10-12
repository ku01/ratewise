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

Each `rate` is how many units of the base currency one unit of that currency buys. The base currency must have rate 1. The order of `currencies` is the column order, and `aliases` are the names accepted in presets.

**The shipped rates are placeholders. Replace them with real ones.**

Rates can also be edited in the page. Those edits apply to the open page only and are not written back to the file; "Reset to file" re-reads it.

### `data/presets.json`

A JSON array of the rates shown in the sidebar. Each entry is a string or an object:

```json
[
  "$5000",
  "120 pln per hour",
  "$300-320",
  "€45/h",
  { "rate": "$90000", "period": "annual" },
  { "rate": "25000 zł", "period": "monthly", "label": "Target offer" }
]
```

A string is `[currency] amount [currency] [period]`, where the period is written like `per hour`, `/h`, `hourly`, `a day`, `monthly`, `per year`.

When a preset has no period, it is guessed from the amount converted to the base currency: under 600 is hourly, under 4000 daily, under 80000 monthly, otherwise annual. The sidebar shows the result as "(guessed)". For amounts near those limits, state the period explicitly.

## Assumptions

- 8 hours per day, 21 days per month, 12 months per year. Change them in `public/js/config.js`, along with the guess thresholds and the decimals shown per row.
- The app is stateless: the server only serves files, and everything you edit lives in the page until you reload.
- The highlighted cell is the one you last entered. The others are computed from it at full precision, so rounding never accumulates.
- In a table cell, a single separator followed by exactly three digits is a thousands separator: `1,234` and `1.234` both mean 1234. Exchange rate inputs always read a single separator as a decimal point.
