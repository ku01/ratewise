import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseNumber } from '../public/js/parse.js';

const range = (min, max = min) => ({ ok: true, min, max });

test('parseAmount: valid input', () => {
  const cases = [
    ['100', range(100)],
    ['100-120', range(100, 120)],
    ['100 - 120', range(100, 120)],
    ['100–120', range(100, 120)],
    ['100—120', range(100, 120)],
    ['100−120', range(100, 120)],
    ['120-100', range(100, 120)],
    [' 5 000 ', range(5000)],
    ['5 000', range(5000)],
    ["1'000", range(1000)],
    ['37,5', range(37.5)],
    ['37.5', range(37.5)],
    ['1,234.56', range(1234.56)],
    ['1.234,56', range(1234.56)],
    ['1 234,56', range(1234.56)],
    ['1,234', range(1234)],
    ['1.234', range(1234)],
    ['120.000', range(120000)],
    ['1.234.567', range(1234567)],
    ['0.125', range(0.125)],
    ['28.24', range(28.24)],
    ['12,5-13,5', range(12.5, 13.5)],
    ['0', range(0)],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(parseAmount(input), expected, JSON.stringify(input));
  }
});

test('parseAmount: empty', () => {
  assert.deepEqual(parseAmount(''), { ok: true, empty: true });
  assert.deepEqual(parseAmount('   '), { ok: true, empty: true });
});

test('parseAmount: rejected input', () => {
  for (const input of ['abc', '12a', '1..2', '.5', '5.', '-100', '100-', '100-120-140', '1,2,3']) {
    assert.equal(parseAmount(input).ok, false, JSON.stringify(input));
  }
  assert.match(parseAmount('12a').error, /"12a" is not a number or range/);
});

test('parseNumber: decimalOnly reads a lone separator as a decimal point', () => {
  assert.equal(parseNumber('3.652').value, 3652);
  assert.equal(parseNumber('3.652', { decimalOnly: true }).value, 3.652);
  assert.equal(parseNumber('0,045', { decimalOnly: true }).value, 0.045);
  assert.equal(parseNumber('abc', { decimalOnly: true }).ok, false);
});
