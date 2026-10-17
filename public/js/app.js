import { CONFIG } from './config.js';
import { computeTable } from './convert.js';
import { formatRange } from './format.js';
import { parseAmount, parseNumber } from './parse.js';
import { resolvePreset } from './presets.js';
import { validateRatesConfig } from './rates.js';
import { loadSaved, makePresetEntry, save } from './storage.js';

const RATES_URL = 'api/exchange-rates';

// localStorage can be missing or throw (private mode, blocked site data).
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

// anchor, presetEntries and selectedPreset are saved to localStorage on every
// change. Exchange rates live in the page only.
const state = {
  ratesConfig: null, // as loaded from the API endpoint
  ratesMeta: null, // {requestedDate, date, source}
  rates: {}, // in-page, editable copy: {CODE: rate}
  anchor: null, // last user-entered cell: {period, currency, min, max, text}
  presetEntries: [], // saved presets: {amount, currency, period, label?}
  presets: [], // presetEntries resolved against the loaded rates
  selectedPreset: -1,
  editingPreset: -1,
};

function persist() {
  save(storage, {
    anchor: state.anchor,
    presets: state.presetEntries,
    selectedPreset: state.selectedPreset,
  });
}

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
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).trim();
    throw new Error(`${url}: HTTP ${res.status}${text ? ` – ${text}` : ''}`);
  }
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
  const json = await fetchJson(RATES_URL);
  const result = validateRatesConfig(json);
  if (!result.ok) throw new Error(`${RATES_URL}: ${result.error}`);
  state.ratesConfig = result.config;
  state.rates = { ...result.config.rates };
  const { requestedDate = null, date = null, source = RATES_URL } = json;
  state.ratesMeta = { requestedDate, date, source };
  if (state.anchor && !(state.anchor.currency in state.rates)) state.anchor = null;
}

function resolvePresets() {
  state.presets = state.presetEntries.map((entry, i) =>
    resolvePreset(entry, state.ratesConfig, CONFIG, i),
  );
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
  persist();
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

function presetRow(preset, i) {
  const meta = preset.ok ? preset.period : `Cannot read: ${preset.error}`;
  const button = make('button', { type: 'button', className: 'preset', disabled: !preset.ok }, [
    make('span', { className: 'preset-label', textContent: preset.label }),
    make('span', { className: 'preset-meta', textContent: meta }),
  ]);
  button.dataset.index = i;
  button.classList.toggle('is-selected', i === state.selectedPreset);
  if (!preset.ok) button.title = preset.error;
  const edit = make('button', { type: 'button', className: 'preset-edit', textContent: 'Edit' });
  edit.dataset.index = i;
  edit.setAttribute('aria-label', `Edit ${preset.label}`);
  return make('li', { className: 'preset-row' }, [button, edit]);
}

function select(name, options, value) {
  const node = make('select', { name }, options.map(([v, text]) => make('option', { value: v, textContent: text })));
  node.value = options.some(([v]) => v === value) ? value : options[0][0];
  return node;
}

function presetForm(entry, preset, i) {
  const amount = preset.ok
    ? formatRange(preset.min, preset.max, 2)
    : [entry.amount ?? ''].flat().join('-');
  const field = (labelText, control) => make('label', {}, [make('span', { textContent: labelText }), control]);
  const form = make('form', { className: 'preset-form' }, [
    field('Label', make('input', { name: 'label', type: 'text', autocomplete: 'off', value: entry.label ?? '', placeholder: 'Optional' })),
    field('Amount', make('input', { name: 'amount', type: 'text', inputMode: 'decimal', autocomplete: 'off', value: amount })),
    field('Currency', select('currency', state.ratesConfig.currencies.map((c) => [c.code, `${c.symbol} ${c.code}`]), entry.currency)),
    field('Period', select('period', CONFIG.periods.map((p) => [p, capitalize(p)]), entry.period)),
    make('p', { className: 'note error', hidden: true }),
    make('div', { className: 'preset-actions' }, [
      make('button', { type: 'submit', textContent: 'Save' }),
      make('button', { type: 'button', textContent: 'Cancel', value: 'cancel' }),
      make('button', { type: 'button', className: 'danger', textContent: 'Delete', value: 'delete' }),
    ]),
  ]);
  form.dataset.index = i;
  return make('li', {}, [form]);
}

function renderPresets() {
  presetsList.replaceChildren(
    ...state.presets.map((preset, i) =>
      i === state.editingPreset ? presetForm(state.presetEntries[i], preset, i) : presetRow(preset, i),
    ),
  );
  el('presets-empty').hidden = state.presets.length > 0;
  el('add-preset').disabled = !state.anchor;
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
  persist();
  renderTable();
  renderPresets();
}

function editPreset(index) {
  state.editingPreset = index;
  renderPresets();
  presetsList.querySelector('.preset-form input[name="label"]')?.focus();
}

function closeEditor() {
  const index = state.editingPreset;
  state.editingPreset = -1;
  renderPresets();
  presetsList.querySelector(`.preset-edit[data-index="${index}"]`)?.focus();
}

// Saves the current table value as a new preset and opens it for naming.
function addPreset() {
  if (!state.anchor) return;
  state.presetEntries.push(makePresetEntry(state.anchor));
  resolvePresets();
  state.selectedPreset = state.presetEntries.length - 1;
  persist();
  editPreset(state.selectedPreset);
}

function savePresetForm(form) {
  const index = Number(form.dataset.index);
  const { label, amount, currency, period } = form.elements;
  const parsed = parseAmount(amount.value);
  const error = form.querySelector('.error');
  if (!parsed.ok || parsed.empty) {
    error.textContent = parsed.ok ? 'Enter an amount.' : parsed.error;
    error.hidden = false;
    setInvalid(amount, true);
    amount.focus();
    return;
  }
  state.presetEntries[index] = makePresetEntry({
    min: parsed.min,
    max: parsed.max,
    currency: currency.value,
    period: period.value,
    label: label.value,
  });
  resolvePresets();
  state.editingPreset = -1;
  if (index === state.selectedPreset) {
    applyPreset(index);
  } else {
    persist();
    renderPresets();
  }
  presetsList.querySelector(`.preset-edit[data-index="${index}"]`)?.focus();
}

function deletePreset(index) {
  state.presetEntries.splice(index, 1);
  resolvePresets();
  if (state.selectedPreset === index) state.selectedPreset = -1;
  else if (state.selectedPreset > index) state.selectedPreset -= 1;
  state.editingPreset = -1;
  persist();
  renderPresets();
  el('add-preset').focus();
}

function wirePresets() {
  presetsList.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    if (button.matches('.preset')) applyPreset(Number(button.dataset.index));
    else if (button.matches('.preset-edit')) editPreset(Number(button.dataset.index));
    else if (button.value === 'cancel') closeEditor();
    else if (button.value === 'delete') deletePreset(state.editingPreset);
  });
  presetsList.addEventListener('submit', (e) => {
    e.preventDefault();
    savePresetForm(e.target);
  });
  presetsList.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.closest('.preset-form')) closeEditor();
  });
  el('add-preset').addEventListener('click', addPreset);
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

function renderRatesMeta() {
  const { requestedDate, date, source } = state.ratesMeta;
  let text = `Rates from ${source}`;
  if (date) {
    text = `Rates as of ${date} · ${source}`;
    if (requestedDate && date < requestedDate) text += ` (latest available for ${requestedDate})`;
  }
  el('rates-source').textContent = text;
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
  renderRatesMeta();
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
  wirePresets();
  el('reset-rates').addEventListener('click', resetRates);

  const saved = loadSaved(storage, CONFIG);
  state.anchor = saved.anchor;
  state.presetEntries = saved.presets;
  state.selectedPreset = saved.selectedPreset;

  try {
    await loadRates();
  } catch (e) {
    // There is no safe fallback for rates, so nothing else is rendered.
    showBanner(e.message);
    return;
  }
  resolvePresets();
  buildTable();
  renderRates();
  renderRatesMeta();
  renderTable();
  renderPresets();
  el('main').hidden = false;
}

init();
