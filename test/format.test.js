import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatRange } from '../public/js/format.js';
import { parseAmount } from '../public/js/parse.js';
import { EXAMPLES } from './fixtures.js';

test('formatNumber', () => {
  const cases = [
    [2666.6667, 2, '2 666.67'],
    [40, 2, '40'],
    [37.5, 2, '37.5'],
    [100.5, 2, '100.5'],
    [225.8824, 0, '226'],
    [5376000, 0, '5 376 000'],
    [1000, 0, '1 000'],
    [999, 0, '999'],
    [0, 2, '0'],
    [0.005, 2, '0.01'],
    [136.875, 2, '136.88'],
  ];
  for (const [x, decimals, expected] of cases) {
    assert.equal(formatNumber(x, decimals), expected, `${x} with ${decimals} decimals`);
  }
});

test('formatRange', () => {
  assert.equal(formatRange(37.5, 40, 2), '37.5–40');
  assert.equal(formatRange(120, 120, 2), '120');
  assert.equal(formatRange(100.2, 100.4, 0), '100');
});

test('the parser reads back everything the formatter writes', () => {
  for (const example of EXAMPLES) {
    for (const text of example.expected.flat()) {
      const parsed = parseAmount(text);
      assert.ok(parsed.ok && !parsed.empty, text);
    }
  }
  assert.deepEqual(parseAmount('3 041.67–3 244.44'), { ok: true, min: 3041.67, max: 3244.44 });
});
