import { CONFIG } from './config.js';
import { computeTable } from './convert.js';
import { formatRange } from './format.js';
import { parseAmount, parseNumber } from './parse.js';
import { resolvePreset } from './presets.js';
import { validateRatesConfig } from './rates.js';
import { makeSortable, moveIndex, moveItem } from './reorder.js';
import { loadSaved, makePresetEntry, save } from './storage.js';

const RATES_URL = 'api/exchange-rates.json';

// localStorage can be missing or throw (private mode, blocked site data).
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

// columns, anchor, presetEntries and selectedPreset are saved to localStorage
// on every change. Exchange rates live in the page only.
const state = {
  ratesConfig: null, // as loaded from the API endpoint
  ratesMeta: null, // {requestedDate, date, source}
  rates: {}, // in-page, editable copy: {CODE: rate}
  columns: [], // currency codes shown in the table, in order
  anchor: null, // last user-entered cell: {period, currency, min, max, text}
  presetEntries: [], // saved presets: {amount, currency, period, label?}
  presets: [], // presetEntries resolved against the loaded rates
  selectedPreset: -1,
  editingPreset: -1,
};

function persist() {
  save(storage, {
    currencies: state.columns,
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
  state.columns = state.columns.filter((code) => code in state.rates);
  if (state.columns.length === 0) {
    state.columns = [state.anchor?.currency ?? ('USD' in state.rates ? 'USD' : result.config.base)];
  }
}

const currencyOf = (code) => state.ratesConfig.currencies.find((c) => c.code === code);

function resolvePresets() {
  state.presets = state.presetEntries.map((entry, i) =>
    resolvePreset(entry, state.ratesConfig, CONFIG, i),
  );
}

// ---- Table ----

function buildTable() {
  const currencies = state.columns.map(currencyOf);
  const removable = currencies.length > 1;
  const head = make('tr', {}, [
    make('td'),
    ...currencies.map((c) => {
      // Symbols that are just the code (CHF, AED) are not repeated.
      const children = c.symbol === c.code ? [c.code] : [c.symbol, make('span', { textContent: c.code })];
      if (removable) {
        const remove = make('button', { type: 'button', className: 'col-remove', textContent: '×', title: `Remove ${c.code}` });
        remove.setAttribute('aria-label', `Remove ${c.code}`);
        remove.setAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');
        remove.dataset.currency = c.code;
        children.push(remove);
      }
      const th = make('th', { scope: 'col', title: c.name }, children);
      th.dataset.currency = c.code;
      th.classList.toggle('is-movable', removable);
      return th;
    }),
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
  renderCurrencyPicker();

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

// ---- Currencies ----

const currencyLabel = (c) => (c.symbol === c.code ? c.name : `${c.name} (${c.symbol})`);

// The picker is a text box with its own dropdown of currencies not yet shown,
// filtered by code or name as the user types.
const availableCurrencies = () => state.ratesConfig.currencies.filter((c) => !state.columns.includes(c.code));

const picker = { matches: [], active: -1 };

function renderCurrencyPicker() {
  el('currency-tools').hidden = availableCurrencies().length === 0;
  if (isPickerOpen()) openPicker();
}

// Codes starting with the query come first, then names containing it.
function matchCurrencies(text) {
  const query = text.trim().toLowerCase();
  const available = availableCurrencies();
  if (!query) return available;
  const byCode = available.filter((c) => c.code.toLowerCase().startsWith(query));
  const byName = available.filter((c) => !byCode.includes(c) && c.name.toLowerCase().includes(query));
  return [...byCode, ...byName];
}

const isPickerOpen = () => !el('currency-options').hidden;

function openPicker() {
  const input = el('add-currency');
  const list = el('currency-options');
  picker.matches = matchCurrencies(input.value);
  picker.active = input.value.trim() && picker.matches.length ? 0 : -1;
  list.replaceChildren(
    ...(picker.matches.length
      ? picker.matches.map((c) =>
          make('li', { id: `currency-option-${c.code}`, className: 'combo-option', role: 'option' }, [
            make('span', { className: 'combo-code', textContent: c.code }),
            make('span', { className: 'combo-name', textContent: currencyLabel(c) }),
          ]),
        )
      : [make('li', { className: 'combo-empty', textContent: 'No matching currency' })]),
  );
  for (const [i, option] of [...list.querySelectorAll('.combo-option')].entries()) option.dataset.index = i;
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  highlightOption(picker.active);
}

function closePicker() {
  el('currency-options').hidden = true;
  const input = el('add-currency');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function highlightOption(index) {
  picker.active = index;
  const input = el('add-currency');
  const options = el('currency-options').querySelectorAll('.combo-option');
  options.forEach((option, i) => {
    option.classList.toggle('is-active', i === index);
    option.setAttribute('aria-selected', String(i === index));
  });
  if (index >= 0) {
    input.setAttribute('aria-activedescendant', options[index].id);
    options[index].scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function moveHighlight(step) {
  if (!isPickerOpen()) openPicker();
  const count = picker.matches.length;
  if (!count) return;
  const from = picker.active < 0 ? (step > 0 ? -1 : count) : picker.active;
  highlightOption((from + step + count) % count);
}

function pickCurrency(code) {
  const input = el('add-currency');
  input.value = '';
  setInvalid(input, false);
  setStatus();
  closePicker();
  addColumn(code);
}

// Text typed in the picker → {code} of a currency not yet shown, or {error}.
function findCurrency(text) {
  const typed = text.trim();
  const query = typed.toLowerCase();
  if (state.columns.includes(typed.toUpperCase())) return { error: `${typed.toUpperCase()} is already in the table.` };
  const available = availableCurrencies();
  const exact = available.find((c) => c.code.toLowerCase() === query || c.name.toLowerCase() === query);
  if (exact) return { code: exact.code };
  const partial = available.filter((c) => c.name.toLowerCase().includes(query));
  if (partial.length === 1) return { code: partial[0].code };
  if (partial.length > 1) return { error: `"${typed}" matches ${partial.length} currencies. Pick one from the list or type its code.` };
  return { error: `No currency matches "${typed}".` };
}

function addFromPicker() {
  const input = el('add-currency');
  if (isPickerOpen() && picker.active >= 0) {
    pickCurrency(picker.matches[picker.active].code);
    return;
  }
  if (!input.value.trim()) return;
  const { code, error } = findCurrency(input.value);
  if (error) {
    setInvalid(input, true);
    setStatus(error);
    return;
  }
  pickCurrency(code);
}

function refreshColumns() {
  persist();
  buildTable();
  renderTable();
  renderRates();
}

function addColumn(code) {
  if (!code || state.columns.includes(code) || !(code in state.rates)) return;
  state.columns.push(code);
  refreshColumns();
}

// Removing the entered cell's column moves the entered value to the first
// remaining column in the same row, at full precision.
function removeColumn(code) {
  if (state.columns.length <= 1) return;
  const index = state.columns.indexOf(code);
  if (index < 0) return;
  state.columns.splice(index, 1);
  const { anchor } = state;
  if (anchor?.currency === code) {
    const to = state.columns[0];
    const cell = computeTable(anchor, state.rates, CONFIG)[anchor.period][to];
    state.anchor = {
      ...anchor,
      currency: to,
      min: cell.min,
      max: cell.max,
      text: formatRange(cell.min, cell.max, CONFIG.decimals[anchor.period]),
    };
  }
  refreshColumns();
  const next = state.columns[Math.min(index, state.columns.length - 1)];
  (matrix.querySelector(`.col-remove[data-currency="${next}"]`) ?? el('add-currency')).focus();
}

function moveColumn(from, to) {
  if (to < 0 || to >= state.columns.length || to === from) return;
  state.columns = moveItem(state.columns, from, to);
  refreshColumns();
}

function wireCurrencies() {
  matrix.addEventListener('click', (e) => {
    const button = e.target.closest('button.col-remove');
    if (button) removeColumn(button.dataset.currency);
  });
  // Drag a column header to move the column; Alt+←/→ on its × button does the same.
  makeSortable(matrix, {
    items: 'thead th[data-currency]',
    ignore: '.col-remove',
    axis: 'x',
    canStart: () => state.columns.length > 1,
    onMove: moveColumn,
  });
  matrix.addEventListener('keydown', (e) => {
    const button = e.target.closest('button.col-remove');
    if (!button || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const { currency } = button.dataset;
    const from = state.columns.indexOf(currency);
    moveColumn(from, from + (e.key === 'ArrowLeft' ? -1 : 1));
    matrix.querySelector(`.col-remove[data-currency="${currency}"]`)?.focus();
  });
  const input = el('add-currency');
  const list = el('currency-options');
  input.addEventListener('focus', openPicker);
  input.addEventListener('click', () => isPickerOpen() || openPicker());
  input.addEventListener('blur', closePicker);
  input.addEventListener('input', () => {
    setInvalid(input, false);
    openPicker();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      addFromPicker();
    } else if (e.key === 'Escape') {
      if (isPickerOpen()) closePicker();
      else {
        input.value = '';
        setInvalid(input, false);
        setStatus();
      }
    }
  });
  // Keep focus in the text box while clicking the list.
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('mousemove', (e) => {
    const option = e.target.closest('.combo-option');
    if (option && Number(option.dataset.index) !== picker.active) highlightOption(Number(option.dataset.index));
  });
  list.addEventListener('click', (e) => {
    const option = e.target.closest('.combo-option');
    if (option) pickCurrency(picker.matches[Number(option.dataset.index)].code);
  });
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
  button.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
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
    field('Currency', select('currency', state.ratesConfig.currencies.map((c) => [c.code, `${c.code} · ${c.name}`]), entry.currency)),
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
  // A preset in a hidden currency brings its column back.
  if (!state.columns.includes(preset.currency)) {
    state.columns.push(preset.currency);
    buildTable();
    renderRates();
  }
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

function movePreset(from, to) {
  if (to < 0 || to >= state.presetEntries.length || to === from) return;
  state.presetEntries = moveItem(state.presetEntries, from, to);
  resolvePresets();
  state.selectedPreset = moveIndex(state.selectedPreset, from, to);
  persist();
  renderPresets();
}

function wirePresets() {
  // Drag a preset to move it; Alt+↑/↓ on a focused preset does the same.
  // Not while one is open for editing.
  makeSortable(presetsList, {
    items: '.preset-row',
    ignore: '.preset-edit',
    axis: 'y',
    canStart: () => state.editingPreset < 0,
    onMove: movePreset,
  });
  presetsList.addEventListener('keydown', (e) => {
    const button = e.target.closest('button.preset');
    if (!button || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const from = Number(button.dataset.index);
    const to = from + (e.key === 'ArrowUp' ? -1 : 1);
    movePreset(from, to);
    presetsList.querySelector(`.preset[data-index="${Math.max(0, Math.min(to, state.presets.length - 1))}"]`)?.focus();
  });
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
  const { base } = state.ratesConfig;
  const baseSymbol = currencyOf(base).symbol;
  ratesList.replaceChildren(
    make('li', { textContent: `Base: ${base}` }),
    ...state.columns
      .filter((code) => code !== base)
      .map(currencyOf)
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
  wireCurrencies();
  el('reset-rates').addEventListener('click', resetRates);

  const saved = loadSaved(storage, CONFIG);
  state.columns = saved.currencies;
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
