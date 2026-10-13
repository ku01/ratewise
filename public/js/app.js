import { CONFIG } from './config.js';
import { computeTable } from './convert.js';
import { formatRange } from './format.js';
import { parseAmount, parseNumber } from './parse.js';
import { resolvePreset } from './presets.js';
import { validateRatesConfig } from './rates.js';

const RATES_URL = 'data/exchange-rates.json';
const PRESETS_URL = 'data/presets.json';

// All state lives here and is lost on reload; nothing is written back.
const state = {
  ratesConfig: null, // as loaded from the file
  rates: {}, // in-page, editable copy: {CODE: rate}
  anchor: null, // last user-entered cell: {period, currency, min, max, text}
  presetEntries: null, // raw presets file content
  presets: [],
  selectedPreset: -1,
};

const el = (id) => document.getElementById(id);
const matrix = el('matrix');
const ratesList = el('rates');
const presetsList = el('presets');

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

function make(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${url} is not valid JSON`);
  }
}

function setStatus(message = '') {
  el('status').textContent = message;
}

function setInvalid(input, invalid) {
  input.classList.toggle('is-invalid', invalid);
  if (invalid) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

// ---- Loading ----

async function loadRates() {
  const result = validateRatesConfig(await fetchJson(RATES_URL));
  if (!result.ok) throw new Error(`${RATES_URL}: ${result.error}`);
  state.ratesConfig = result.config;
  state.rates = { ...result.config.rates };
  if (state.anchor && !(state.anchor.currency in state.rates)) state.anchor = null;
}

async function loadPresets() {
  const error = el('presets-error');
  error.hidden = true;
  try {
    const entries = await fetchJson(PRESETS_URL);
    if (!Array.isArray(entries)) throw new Error(`${PRESETS_URL}: expected a JSON array`);
    state.presetEntries = entries;
  } catch (e) {
    state.presetEntries = [];
    error.textContent = e.message;
    error.hidden = false;
  }
}

function resolvePresets() {
  state.presets = state.presetEntries.map((entry, i) =>
    resolvePreset(entry, state.ratesConfig, CONFIG, i),
  );
  state.selectedPreset = -1;
}

// ---- Table ----

function buildTable() {
  const { currencies } = state.ratesConfig;
  const head = make('tr', {}, [
    make('td'),
    ...currencies.map((c) =>
      make('th', { scope: 'col' }, [c.symbol, make('span', { textContent: c.code })]),
    ),
  ]);
  const rows = CONFIG.periods.map((period) =>
    make('tr', {}, [
      make('th', { scope: 'row', textContent: capitalize(period) }),
      ...currencies.map((c) => {
        const input = make('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off' });
        input.setAttribute('aria-label', `${capitalize(period)}, ${c.code}`);
        input.dataset.period = period;
        input.dataset.currency = c.code;
        input.dataset.rendered = '';
        return make('td', {}, [input]);
      }),
    ]),
  );
  matrix.replaceChildren(make('thead', {}, [head]), make('tbody', {}, rows));

  el('assumptions').textContent =
    `${CONFIG.hoursPerDay} h/day, ${CONFIG.daysPerMonth} days/month, ${CONFIG.monthsPerYear} months/year`;
}

function renderTable() {
  const { anchor } = state;
  const table = anchor ? computeTable(anchor, state.rates, CONFIG) : null;
  for (const input of matrix.querySelectorAll('input')) {
    // A cell holding rejected text keeps it until the user fixes or reverts it.
    if (input.classList.contains('is-invalid')) continue;
    const { period, currency } = input.dataset;
    const isAnchor = !!anchor && anchor.period === period && anchor.currency === currency;
    let text = '';
    if (isAnchor) {
      text = anchor.text;
    } else if (table) {
      const cell = table[period][currency];
      text = formatRange(cell.min, cell.max, CONFIG.decimals[period]);
    }
    input.value = text;
    input.dataset.rendered = text;
    input.classList.toggle('is-anchor', isAnchor);
  }
}

function commitCell(input) {
  const text = input.value;
  // Unchanged text is a no-op, so tabbing through cells never turns a rounded
  // display value into the anchor.
  if (text === input.dataset.rendered) return;

  const parsed = parseAmount(text);
  if (!parsed.ok) {
    setInvalid(input, true);
    setStatus(parsed.error);
    return;
  }
  for (const cell of matrix.querySelectorAll('input.is-invalid')) setInvalid(cell, false);
  setStatus();
  state.anchor = parsed.empty
    ? null
    : {
        period: input.dataset.period,
        currency: input.dataset.currency,
        min: parsed.min,
        max: parsed.max,
        text: text.trim(),
      };
  state.selectedPreset = -1;
  renderTable();
  renderPresets();
}

function revertInput(input) {
  input.value = input.dataset.rendered;
  setInvalid(input, false);
  setStatus();
  input.select();
}

// Shared by table cells and rate inputs.
function wireInputs(container, commit) {
  container.addEventListener('focusin', (e) => {
    if (e.target.matches('input')) e.target.select();
  });
  container.addEventListener('focusout', (e) => {
    if (e.target.matches('input')) commit(e.target);
  });
  container.addEventListener('keydown', (e) => {
    if (!e.target.matches('input')) return;
    if (e.key === 'Enter') {
      commit(e.target);
      e.target.select();
    } else if (e.key === 'Escape') {
      revertInput(e.target);
    }
  });
}

// ---- Presets ----

function renderPresets() {
  presetsList.replaceChildren(
    ...state.presets.map((preset, i) => {
      const meta = preset.ok ? preset.period : `Cannot read: ${preset.error}`;
      const button = make('button', { type: 'button', className: 'preset', disabled: !preset.ok }, [
        make('span', { className: 'preset-label', textContent: preset.label }),
        make('span', { className: 'preset-meta', textContent: meta }),
      ]);
      button.dataset.index = i;
      button.classList.toggle('is-selected', i === state.selectedPreset);
      if (!preset.ok) button.title = preset.error;
      return make('li', {}, [button]);
    }),
  );
}

function applyPreset(index) {
  const preset = state.presets[index];
  if (!preset?.ok) return;
  for (const cell of matrix.querySelectorAll('input.is-invalid')) setInvalid(cell, false);
  setStatus();
  state.anchor = {
    period: preset.period,
    currency: preset.currency,
    min: preset.min,
    max: preset.max,
    text: formatRange(preset.min, preset.max, 2),
  };
  state.selectedPreset = index;
  renderTable();
  renderPresets();
}

// ---- Exchange rates ----

function renderRates() {
  const { base, currencies } = state.ratesConfig;
  const baseSymbol = currencies.find((c) => c.code === base).symbol;
  ratesList.replaceChildren(
    make('li', { textContent: `Base: ${base}` }),
    ...currencies
      .filter((c) => c.code !== base)
      .map((c) => {
        const text = String(state.rates[c.code]);
        const input = make('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', value: text });
        input.setAttribute('aria-label', `${c.code} per 1 ${base}`);
        input.dataset.currency = c.code;
        input.dataset.rendered = text;
        const edited = make('span', { className: 'edited', textContent: 'edited' });
        edited.hidden = state.rates[c.code] === c.rate;
        return make('li', {}, [`1 ${baseSymbol} =`, input, c.code, edited]);
      }),
  );
}

function commitRate(input) {
  const text = input.value;
  if (text === input.dataset.rendered) return;

  const parsed = parseNumber(text, { decimalOnly: true });
  if (!parsed.ok || parsed.value <= 0) {
    setInvalid(input, true);
    setStatus(`"${text.trim()}" is not a valid exchange rate. Use a number greater than 0.`);
    return;
  }
  setStatus();
  state.rates[input.dataset.currency] = parsed.value;
  const focused = document.activeElement === input;
  renderRates();
  renderTable();
  if (focused) ratesList.querySelector(`input[data-currency="${input.dataset.currency}"]`)?.focus();
}

async function resetRates() {
  try {
    await loadRates();
  } catch (e) {
    showBanner(e.message);
    return;
  }
  el('banner').hidden = true;
  setStatus();
  resolvePresets();
  buildTable();
  renderRates();
  renderTable();
  renderPresets();
}

function showBanner(message) {
  const banner = el('banner');
  banner.textContent = `Cannot load exchange rates. ${message}`;
  banner.hidden = false;
}

// ---- Start ----

async function init() {
  wireInputs(matrix, commitCell);
  wireInputs(ratesList, commitRate);
  presetsList.addEventListener('click', (e) => {
    const button = e.target.closest('button.preset');
    if (button) applyPreset(Number(button.dataset.index));
  });
  el('reset-rates').addEventListener('click', resetRates);

  try {
    await loadRates();
  } catch (e) {
    // There is no safe fallback for rates, so nothing else is rendered.
    showBanner(e.message);
    return;
  }
  await loadPresets();
  resolvePresets();
  buildTable();
  renderRates();
  el('main').hidden = false;

  const first = state.presets.findIndex((p) => p.ok);
  if (first >= 0) {
    applyPreset(first);
  } else {
    renderTable();
    renderPresets();
  }
}

init();
