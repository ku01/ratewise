import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../public/js/config.js';
import { resolvePreset } from '../public/js/presets.js';
import { RATES_CONFIG } from './fixtures.js';

const resolve = (entry, index) => resolvePreset(entry, RATES_CONFIG, CONFIG, index);

test('resolvePreset: single amount', () => {
  assert.deepEqual(resolve({ amount: 5000, currency: 'USD', period: 'monthly' }), {
    label: '5 000 USD',
    ok: true,
    currency: 'USD',
    min: 5000,
    max: 5000,
    period: 'monthly',
  });
});

test('resolvePreset: range, reversed range and label', () => {
  const range = resolve({ amount: [300, 320], currency: 'USD', period: 'daily' });
  assert.deepEqual(range, { label: '300–320 USD', ok: true, currency: 'USD', min: 300, max: 320, period: 'daily' });
  const reversed = resolve({ amount: [320, 300], currency: 'USD', period: 'daily' });
  assert.deepEqual([reversed.min, reversed.max], [300, 320]);
  const labelled = resolve({ amount: 37.5, currency: 'EUR', period: 'hourly', label: 'Target offer' });
  assert.equal(labelled.label, 'Target offer');
  assert.equal(labelled.min, 37.5);
});

test('resolvePreset: errors keep a label', () => {
  const bad = [
    '$5000',
    null,
    42,
    [],
    { currency: 'USD', period: 'monthly' },
    { amount: '5000', currency: 'USD', period: 'monthly' },
    { amount: -1, currency: 'USD', period: 'monthly' },
    { amount: [1, 2, 3], currency: 'USD', period: 'monthly' },
    { amount: [], currency: 'USD', period: 'monthly' },
    { amount: 5000, currency: 'GBP', period: 'monthly' },
    { amount: 5000, period: 'monthly' },
    { amount: 5000, currency: 'USD', period: 'weekly' },
    { amount: 5000, currency: 'USD' },
  ];
  bad.forEach((entry, i) => {
    const resolved = resolve(entry, i);
    assert.equal(resolved.ok, false, JSON.stringify(entry));
    assert.equal(resolved.label, `Entry ${i + 1}`);
    assert.ok(resolved.error);
  });
  assert.equal(resolve({ amount: 1, currency: 'GBP', period: 'daily', label: 'Mine' }).label, 'Mine');
  assert.match(resolve({ amount: 1, currency: 'GBP', period: 'daily' }).error, /unknown currency "GBP"/);
  assert.match(resolve({ amount: 1, currency: 'USD', period: 'weekly' }).error, /unknown period "weekly"/);
});
