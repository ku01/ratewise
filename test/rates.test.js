import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRatesConfig } from '../public/js/rates.js';
import { RATES_JSON } from './fixtures.js';

const withCurrencies = (edit) => {
  const json = structuredClone(RATES_JSON);
  edit(json);
  return validateRatesConfig(json);
};

test('valid config exposes rates, symbols and names', () => {
  const { config } = validateRatesConfig(RATES_JSON);
  assert.deepEqual(config.rates, { PLN: 3.65, EUR: 0.859, USD: 1, RUB: 81.3 });
  assert.equal(config.base, 'USD');
  // A missing name falls back to the code.
  assert.deepEqual(config.currencies[2], { code: 'USD', symbol: '$', name: 'USD', rate: 1 });
  const named = { ...RATES_JSON, currencies: [{ code: 'USD', symbol: '$', name: 'US Dollar', rate: 1 }] };
  assert.equal(validateRatesConfig(named).config.currencies[0].name, 'US Dollar');
});

test('rejects invalid configs', () => {
  assert.equal(validateRatesConfig(null).ok, false);
  assert.equal(validateRatesConfig({ base: 'USD' }).ok, false);
  assert.equal(withCurrencies((j) => (j.base = 'GBP')).ok, false);
  assert.equal(withCurrencies((j) => delete j.base).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[2].rate = 2)).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[1].rate = 0)).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[1].rate = -1)).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[1].rate = '0.859')).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[2].code = 'EUR')).ok, false);
});
