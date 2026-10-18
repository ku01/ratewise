# Ratewise

A table of income rates: hourly, daily, monthly and annual, in any currencies you choose, as many as you like. Edit any cell and the others are recalculated. A value can be a single number (`120`) or a range (`100-120`).

Live: https://ku01.github.io/ratewise/

## Run

```
node server.js
```

Then open http://127.0.0.1:3000. Set `PORT` to use another port. There are no dependencies.

Tests: `node --test`

## Deploy (GitHub Pages)

The published site is static: `npm run build` (`build.js`) copies `public/` to `dist/` and writes the day's rates to `dist/api/exchange-rates.json`, the same JSON the server returns. The build fails if every rate source fails, so a bad day never replaces a working deployment.

`.github/workflows/deploy.yml` runs the tests, builds and deploys to GitHub Pages on every push to `main`, daily at 02:00 UTC (fresh rates), and on demand from the Actions tab ("Run workflow").

One-time setup after pushing the repository to GitHub: Settings → Pages → Build and deployment → Source: **GitHub Actions**. The site is then at https://ku01.github.io/ratewise/.

Notes:

- The build runs in UTC, so on the published site "yesterday" is the UTC date, not the visitor's local date.
- GitHub disables scheduled workflows in a public repository after 60 days without commits. Re-enable it in the Actions tab if rates stop updating.

## Exchange rates

Every currency the API has (about 155) is fetched against the base currency, USD (`BASE` in `exchange-rates.js`). Each rate is how many units of that currency one USD buys. Only ISO 4217 codes known to the JavaScript runtime are kept, so metals (XAU) and codes like CNH are dropped, as are rows with a missing or non-positive rate. Symbols and English names come from `Intl`.

Rates come from a public API (no key) for yesterday's date:

1. [Frankfurter v2](https://frankfurter.dev) (`api.frankfurter.dev`), blended rates.
2. [fawazahmed0 currency-api](https://github.com/fawazahmed0/exchange-api) on jsDelivr, then its `currency-api.pages.dev` mirror.

The page loads them from `api/exchange-rates.json`. On weekends and holidays the API may return the latest earlier date, which the page shows.

- **Published site:** the daily build writes that file, with "yesterday" in UTC. If every source fails, the build fails and the site keeps the previous day's rates.
- **Local server:** `server.js` answers that path itself, for yesterday's local date. Results are cached in server memory per day; restart the server to force a refetch. If every source fails, it answers 502, the page shows the reason in an error banner, and the server retries after 5 minutes.

Rates can also be edited in the page. Those edits apply to the open page only; "Reset rates" loads `api/exchange-rates.json` again.

## Saved state and presets

On first open the table has one currency, USD, holds 0 USD hourly, and there are no presets. "Add currency…" above the table adds a column: type a code or a name (`gbp`, `Japanese Yen`, `swiss`) and press Enter, or pick a suggestion. There is no limit on columns; every column has the same width, and the page grows wider instead of squeezing them. × in a column header removes a column (the last one stays). Removing the column of the entered cell moves the value to the first remaining column. The exchange rates panel lists only the shown currencies.

The shown currencies, the entered cell and the presets are saved in the browser's `localStorage` (key `ratewise`) on every change and restored on reload. Exchange rate edits are not saved.

In the sidebar, "Save current" adds the table's current value as a preset and opens it for editing. "Edit" on a preset changes its label, amount (a number or a range), currency and period, or deletes it. Click a preset to load it into the table; if its currency is hidden, the column is added.

A saved preset that no longer fits (for example, its currency is missing from the day's rates) is listed disabled, with the reason.

## Assumptions

- 8 hours per day, 21 days per month, 12 months per year. Change them in `public/js/config.js`, along with the decimals shown per row.
- There is no backend state. The local server only serves files and fetches rates from `api.frankfurter.dev`, `cdn.jsdelivr.net` or `currency-api.pages.dev` (outbound network), caching them in memory; the published site is static files. The table value and presets are kept in the browser; exchange rate edits last until you reload.
- The highlighted cell is the one you last entered. The others are computed from it at full precision, so rounding never accumulates.
- In a table cell, a single separator followed by exactly three digits is a thousands separator: `1,234` and `1.234` both mean 1234, but `0.123` is a decimal, and so is `1234.567` (more than three digits before the separator). Exchange rate inputs always read a single separator as a decimal point.

## License

[MIT](LICENSE). Exchange rates are provided by the third-party sources listed above, under their own terms.
