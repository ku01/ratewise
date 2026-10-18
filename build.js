import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRatesProvider } from './exchange-rates.js';

// Builds the static site into dist/: a copy of public/ plus the day's
// exchange rates at api/exchange-rates.json, the same JSON the server's
// /api/exchange-rates.json returns. "Yesterday" is taken in the local time
// zone of the machine running the build (UTC on GitHub Actions).
// Exits with an error if no rate source works, so a failed build never
// replaces a working deployment.

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');

const rates = await createRatesProvider({ timeoutMs: 15000 })();

await rm(OUT, { recursive: true, force: true });
await cp(path.join(ROOT, 'public'), OUT, { recursive: true });
await mkdir(path.join(OUT, 'api'), { recursive: true });
await writeFile(path.join(OUT, 'api', 'exchange-rates.json'), JSON.stringify(rates, null, 2));

console.log(`Built dist/ with ${rates.currencies.length} currencies, rates for ${rates.date} from ${rates.source}.`);
