import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRatesConfig } from '../public/js/rates.js';
import { RATES_JSON, readData } from './fixtures.js';

const withCurrencies = (edit) => {
  const json = structuredClone(RATES_JSON);
  edit(json);
  return validateRatesConfig(json);
};

test('the shipped exchange-rates.json is valid', () => {
  const result = validateRatesConfig(readData('exchange-rates.json'));
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    result.config.currencies.map((c) => c.code),
    ['PLN', 'EUR', 'USD', 'RUB'],
  );
});

test('valid config exposes rates and case-insensitive aliases', () => {
  const { config } = validateRatesConfig(RATES_JSON);
  assert.deepEqual(config.rates, { PLN: 1, EUR: 4.25, USD: 3.65, RUB: 0.045 });
  assert.equal(config.aliases.get('$'), 'USD');
  assert.equal(config.aliases.get('usd'), 'USD');
  assert.equal(config.aliases.get('zł'), 'PLN');
});

test('rejects invalid configs', () => {
  assert.equal(validateRatesConfig(null).ok, false);
  assert.equal(validateRatesConfig({ base: 'PLN' }).ok, false);
  assert.equal(withCurrencies((j) => (j.base = 'GBP')).ok, false);
  assert.equal(withCurrencies((j) => delete j.base).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[0].rate = 2)).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[1].rate = 0)).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[1].rate = -1)).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[1].rate = '4.25')).ok, false);
  assert.equal(withCurrencies((j) => (j.currencies[2].code = 'EUR')).ok, false);
  assert.equal(withCurrencies((j) => j.currencies[2].aliases.push('EURO')).ok, false);
});
