import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../public/js/config.js';
import { DEFAULT_ANCHOR, STORAGE_KEY, loadSaved, makePresetEntry, save } from '../public/js/storage.js';

function memoryStorage(initial) {
  const map = new Map(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

const DEFAULTS = { currencies: ['USD'], anchor: DEFAULT_ANCHOR, presets: [], selectedPreset: -1 };

test('loadSaved: defaults to a USD column, 0 USD hourly and no presets', () => {
  assert.deepEqual(DEFAULT_ANCHOR, { period: 'hourly', currency: 'USD', min: 0, max: 0, text: '0' });
  assert.deepEqual(loadSaved(memoryStorage(), CONFIG), DEFAULTS);
  assert.deepEqual(loadSaved(null, CONFIG), DEFAULTS);
  assert.deepEqual(loadSaved(memoryStorage('not json'), CONFIG), DEFAULTS);
  assert.deepEqual(loadSaved(memoryStorage('[1, 2]'), CONFIG), DEFAULTS);
  const throwing = { getItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(loadSaved(throwing, CONFIG), DEFAULTS);
});

test('save and loadSaved round-trip', () => {
  const storage = memoryStorage();
  const data = {
    currencies: ['USD', 'EUR'],
    anchor: { period: 'daily', currency: 'EUR', min: 300, max: 320, text: '300-320' },
    presets: [makePresetEntry({ min: 300, max: 320, currency: 'EUR', period: 'daily', label: ' Offer ' })],
    selectedPreset: 0,
  };
  assert.equal(save(storage, data), true);
  assert.deepEqual(loadSaved(storage, CONFIG), data);
  assert.deepEqual(data.presets[0], { amount: [300, 320], currency: 'EUR', period: 'daily', label: 'Offer' });
});

test('loadSaved: a cleared table stays cleared', () => {
  const storage = memoryStorage();
  save(storage, { currencies: ['USD'], anchor: null, presets: [], selectedPreset: -1 });
  assert.equal(loadSaved(storage, CONFIG).anchor, null);
});

test('loadSaved: broken parts fall back separately', () => {
  const raw = JSON.stringify({
    currencies: ['EUR', 'EUR', 7, '', 'PLN'],
    anchor: { period: 'weekly', currency: 'USD', min: 1, max: 1, text: '1' },
    presets: [{ amount: 1, currency: 'USD', period: 'daily' }, 'junk', null],
    selectedPreset: 5,
  });
  assert.deepEqual(loadSaved(memoryStorage(raw), CONFIG), {
    currencies: ['EUR', 'PLN'],
    anchor: DEFAULT_ANCHOR,
    presets: [{ amount: 1, currency: 'USD', period: 'daily' }],
    selectedPreset: -1,
  });
});

test('loadSaved: an empty currency list falls back to USD', () => {
  const raw = JSON.stringify({ currencies: [], anchor: null, presets: [], selectedPreset: -1 });
  assert.deepEqual(loadSaved(memoryStorage(raw), CONFIG).currencies, ['USD']);
});

test('save: a throwing storage reports failure', () => {
  const full = { setItem: () => { throw new Error('quota'); } };
  assert.equal(save(full, DEFAULTS), false);
});

test('makePresetEntry: single amount, no label', () => {
  assert.deepEqual(makePresetEntry({ min: 50, max: 50, currency: 'PLN', period: 'hourly', label: '  ' }), {
    amount: 50,
    currency: 'PLN',
    period: 'hourly',
  });
});
