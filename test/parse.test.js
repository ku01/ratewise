import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseNumber, parseRate } from '../public/js/parse.js';
import { RATES_CONFIG } from './fixtures.js';

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

const rate = (text) => parseRate(text, RATES_CONFIG);

test('parseRate: valid input', () => {
  const cases = [
    ['$5000', { currency: 'USD', min: 5000, max: 5000, period: null }],
    ['120 pln per hour', { currency: 'PLN', min: 120, max: 120, period: 'hourly' }],
    ['120 pln/h', { currency: 'PLN', min: 120, max: 120, period: 'hourly' }],
    ['120 PLN hourly', { currency: 'PLN', min: 120, max: 120, period: 'hourly' }],
    ['$300-320', { currency: 'USD', min: 300, max: 320, period: null }],
    ['€45/h', { currency: 'EUR', min: 45, max: 45, period: 'hourly' }],
    ['400000 ₽ monthly', { currency: 'RUB', min: 400000, max: 400000, period: 'monthly' }],
    ['25000 zł', { currency: 'PLN', min: 25000, max: 25000, period: null }],
    ['100$', { currency: 'USD', min: 100, max: 100, period: null }],
    ['100 usd', { currency: 'USD', min: 100, max: 100, period: null }],
    ['USD 100', { currency: 'USD', min: 100, max: 100, period: null }],
    ['$ 90 000 a year', { currency: 'USD', min: 90000, max: 90000, period: 'annual' }],
    ['$400 / day', { currency: 'USD', min: 400, max: 400, period: 'daily' }],
    ['$5000 usd', { currency: 'USD', min: 5000, max: 5000, period: null }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(rate(input), { ok: true, ...expected }, input);
  }
});

test('parseRate: rejected input', () => {
  assert.deepEqual(rate('5000'), { ok: false, error: 'no currency' });
  assert.deepEqual(rate('$5000 €'), { ok: false, error: 'two currencies' });
  assert.deepEqual(rate('lots of money'), { ok: false, error: 'no amount' });
  assert.match(rate('100 doubloons').error, /unrecognized text: doubloons/);
});
