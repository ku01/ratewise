import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../public/js/config.js';
import { computeTable, periodHours } from '../public/js/convert.js';
import { formatRange } from '../public/js/format.js';
import { EXAMPLES, RATES } from './fixtures.js';

const CODES = ['PLN', 'EUR', 'USD', 'RUB'];
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.abs(expected), `${actual} != ${expected}`);

test('periodHours', () => {
  assert.deepEqual(periodHours(CONFIG), { hourly: 1, daily: 8, monthly: 168, annual: 2016 });
  assert.equal(periodHours({ ...CONFIG, daysPerMonth: 20 }).monthly, 160);
  assert.equal(periodHours({ ...CONFIG, daysPerMonth: 20 }).annual, 1920);
});

for (const example of EXAMPLES) {
  test(`formatted table, example ${example.name}`, () => {
    const table = computeTable(example.anchor, RATES, CONFIG);
    const actual = CONFIG.periods.map((period) =>
      CODES.map((code) =>
        formatRange(table[period][code].min, table[period][code].max, CONFIG.decimals[period]),
      ),
    );
    assert.deepEqual(actual, example.expected);
  });
}

test('unrounded values', () => {
  const a = computeTable(EXAMPLES[0].anchor, RATES, CONFIG);
  close(a.hourly.EUR.min, (120 / 3.65) * 0.859);
  close(a.monthly.EUR.min, (20160 / 3.65) * 0.859);
  close(a.annual.RUB.min, (241920 / 3.65) * 81.3);
  const b = computeTable(EXAMPLES[1].anchor, RATES, CONFIG);
  close(b.hourly.PLN.min, 136.875);
  close(b.hourly.PLN.max, 146);
  close(b.annual.RUB.max, 80640 * 81.3);
});

test('anchor cell has factor 1', () => {
  const table = computeTable(EXAMPLES[1].anchor, RATES, CONFIG);
  assert.deepEqual(table.daily.USD, { min: 300, max: 320 });
});

test('round trip through any cell recovers the anchor', () => {
  const anchor = EXAMPLES[1].anchor;
  const table = computeTable(anchor, RATES, CONFIG);
  for (const period of CONFIG.periods) {
    for (const currency of CODES) {
      const back = computeTable({ period, currency, ...table[period][currency] }, RATES, CONFIG);
      close(back.daily.USD.min, 300);
      close(back.daily.USD.max, 320);
    }
  }
});

test('changing one rate changes only that column', () => {
  const before = computeTable(EXAMPLES[2].anchor, RATES, CONFIG);
  const after = computeTable(EXAMPLES[2].anchor, { ...RATES, EUR: 0.8 }, CONFIG);
  const eur = CONFIG.periods.map((p) => formatRange(after[p].EUR.min, after[p].EUR.max, 0));
  assert.deepEqual(eur, ['24', '190', '4 000', '48 000']);
  for (const period of CONFIG.periods) {
    for (const code of ['PLN', 'USD', 'RUB']) {
      assert.deepEqual(after[period][code], before[period][code]);
    }
  }
});
