# Income rate matrix

A table of income rates: hourly, daily, monthly and annual, in the currencies you choose (PLN, EUR, USD, RUB). Edit any cell and the others are recalculated. A value can be a single number (`120`) or a range (`100-120`).

## Run

```
node server.js
```

Then open http://127.0.0.1:3000. Set `PORT` to use another port. There are no dependencies and no build step.

Tests: `node --test`

## Exchange rates

The currencies you can add (PLN, EUR, USD, RUB), their symbols, their order in the "Add currency…" list and the base currency (USD) are set by `CURRENCIES` in `exchange-rates.js`. Each rate is how many units of that currency one USD buys.

Rates come from a public API (no key) for yesterday's local date, served to the page by the server at `/api/exchange-rates`:

1. [Frankfurter v2](https://frankfurter.dev) (`api.frankfurter.dev`), blended rates.
2. [fawazahmed0 currency-api](https://github.com/fawazahmed0/exchange-api) on jsDelivr, then its `currency-api.pages.dev` mirror.

If every source fails, the endpoint answers 502 and the page shows the reason in an error banner. Results are cached in server memory per day; a failure is retried after 5 minutes. Restart the server to force a refetch. On weekends and holidays the API may return the latest earlier date, which the page shows.

Rates can also be edited in the page. Those edits apply to the open page only; "Reset rates" reloads them from the server.

## Saved state and presets

On first open the table has one currency, USD, holds 0 USD hourly, and there are no presets. "Add currency…" above the table adds a column; × in a column header removes it (the last column stays). Removing the column of the entered cell moves the value to the first remaining column. The exchange rates panel lists only the shown currencies.

The shown currencies, the entered cell and the presets are saved in the browser's `localStorage` (key `income-rates`) on every change and restored on reload. Exchange rate edits are not saved.

In the sidebar, "Save current" adds the table's current value as a preset and opens it for editing. "Edit" on a preset changes its label, amount (a number or a range), currency and period, or deletes it. Click a preset to load it into the table; if its currency is hidden, the column is added.

A saved preset that no longer fits (for example, its currency was removed from `CURRENCIES`) is listed disabled, with the reason.

## Assumptions

- 8 hours per day, 21 days per month, 12 months per year. Change them in `public/js/config.js`, along with the decimals shown per row.
- The server is stateless apart from the in-memory exchange-rate cache: it serves files and fetches rates from `api.frankfurter.dev`, `cdn.jsdelivr.net` or `currency-api.pages.dev` (outbound network). The table value and presets are kept in the browser; exchange rate edits last until you reload.
- The highlighted cell is the one you last entered. The others are computed from it at full precision, so rounding never accumulates.
- In a table cell, a single separator followed by exactly three digits is a thousands separator: `1,234` and `1.234` both mean 1234. Exchange rate inputs always read a single separator as a decimal point.
