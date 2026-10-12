import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../public/js/config.js';
import { guessPeriod, resolvePreset } from '../public/js/presets.js';
import { validateRatesConfig } from '../public/js/rates.js';
import { RATES_CONFIG, readData } from './fixtures.js';

const resolve = (entry, index) => resolvePreset(entry, RATES_CONFIG, CONFIG, index);

test('guessPeriod threshold edges', () => {
  const t = CONFIG.periodGuessThresholdsBase;
  assert.equal(guessPeriod(599.99, t), 'hourly');
  assert.equal(guessPeriod(600, t), 'daily');
  assert.equal(guessPeriod(3999.99, t), 'daily');
  assert.equal(guessPeriod(4000, t), 'monthly');
  assert.equal(guessPeriod(79999.99, t), 'monthly');
  assert.equal(guessPeriod(80000, t), 'annual');
});

test('resolvePreset: fixtures', () => {
  const cases = [
    ['$5000', 'USD', 5000, 5000, 'monthly', true],
    ['120 pln per hour', 'PLN', 120, 120, 'hourly', false],
    ['$300-320', 'USD', 300, 320, 'daily', true],
    ['€45/h', 'EUR', 45, 45, 'hourly', false],
    ['400000 ₽ monthly', 'RUB', 400000, 400000, 'monthly', false],
    ['$60000', 'USD', 60000, 60000, 'annual', true],
    ['120 pln', 'PLN', 120, 120, 'hourly', true],
  ];
  for (const [entry, currency, min, max, period, periodGuessed] of cases) {
    assert.deepEqual(
      resolve(entry),
      { label: entry, ok: true, currency, min, max, period, periodGuessed },
      entry,
    );
  }
});

test('resolvePreset: object entries', () => {
  assert.deepEqual(resolve({ rate: '$90000', period: 'annual' }), {
    label: '$90000',
    ok: true,
    currency: 'USD',
    min: 90000,
    max: 90000,
    period: 'annual',
    periodGuessed: false,
  });
  // Explicit period beats the magnitude guess (25000 PLN alone would be monthly).
  const daily = resolve({ rate: '25000 zł', period: 'daily', label: 'Big day' });
  assert.equal(daily.period, 'daily');
  assert.equal(daily.periodGuessed, false);
  assert.equal(daily.label, 'Big day');
  assert.equal(resolve({ rate: '$50/h', period: 'hourly' }).ok, true);
});

test('resolvePreset: errors keep a label', () => {
  assert.deepEqual(resolve('5000'), { label: '5000', ok: false, error: 'no currency' });
  assert.deepEqual(resolve('lots of money'), { label: 'lots of money', ok: false, error: 'no amount' });
  assert.match(resolve({ rate: '$50/h', period: 'daily' }).error, /conflicting period/);
  assert.match(resolve({ rate: '$50', period: 'weekly' }).error, /unknown period/);
  assert.equal(resolve(42, 2).label, 'Entry 3');
  assert.equal(resolve(null, 0).ok, false);
  assert.equal(resolve({ label: 'x' }, 0).ok, false);
});

test('the shipped presets.json resolves with no errors', () => {
  const ratesConfig = validateRatesConfig(readData('exchange-rates.json')).config;
  const presets = readData('presets.json');
  assert.ok(Array.isArray(presets) && presets.length > 0);
  presets.forEach((entry, i) => {
    const resolved = resolvePreset(entry, ratesConfig, CONFIG, i);
    assert.equal(resolved.ok, true, `${JSON.stringify(entry)}: ${resolved.error}`);
  });
});
