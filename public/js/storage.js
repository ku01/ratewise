// What the user changes (the shown currencies, the entered cell and the
// presets) is kept in localStorage under one key. Exchange rates are not saved.
export const STORAGE_KEY = 'income-rates';

export const DEFAULT_ANCHOR = { period: 'hourly', currency: 'USD', min: 0, max: 0, text: '0' };
export const DEFAULT_CURRENCIES = ['USD'];

const isAmount = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function validAnchor(a, config) {
  return (
    isObject(a) &&
    config.periods.includes(a.period) &&
    typeof a.currency === 'string' &&
    isAmount(a.min) &&
    isAmount(a.max) &&
    a.min <= a.max &&
    typeof a.text === 'string'
  );
}

// Returns {currencies, anchor, presets, selectedPreset}. Missing or broken
// data falls back to the defaults: a USD column, 0 USD hourly and no presets.
// A saved anchor of null means the user cleared the table, and stays cleared.
// Currency codes are not checked against the loaded rates here.
export function loadSaved(storage, config) {
  const defaults = {
    currencies: [...DEFAULT_CURRENCIES],
    anchor: { ...DEFAULT_ANCHOR },
    presets: [],
    selectedPreset: -1,
  };
  let data;
  try {
    data = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return defaults;
  }
  if (!isObject(data)) return defaults;

  let currencies = Array.isArray(data.currencies)
    ? [...new Set(data.currencies.filter((c) => typeof c === 'string' && c !== ''))]
    : [];
  if (currencies.length === 0) currencies = defaults.currencies;
  const presets = Array.isArray(data.presets) ? data.presets.filter(isObject) : [];
  let anchor = defaults.anchor;
  if (data.anchor === null) anchor = null;
  else if (validAnchor(data.anchor, config)) {
    const { period, currency, min, max, text } = data.anchor;
    anchor = { period, currency, min, max, text };
  }
  const i = data.selectedPreset;
  const selectedPreset = Number.isInteger(i) && i >= 0 && i < presets.length ? i : -1;
  return { currencies, anchor, presets, selectedPreset };
}

export function save(storage, { currencies, anchor, presets, selectedPreset }) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ currencies, anchor, presets, selectedPreset }));
    return true;
  } catch {
    return false;
  }
}

// Builds a preset entry {amount, currency, period, label?} as stored.
export function makePresetEntry({ min, max, currency, period, label = '' }) {
  const entry = { amount: min === max ? min : [min, max], currency, period };
  const trimmed = label.trim();
  if (trimmed) entry.label = trimmed;
  return entry;
}
