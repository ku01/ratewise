import { formatRange } from './format.js';

const isAmount = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;

// entry = {amount, currency, period, label?}, where amount is a number or a
// [min, max] pair. Returns {label, ok, currency, min, max, period} or
// {label, ok: false, error}.
export function resolvePreset(entry, ratesConfig, config, index = 0) {
  const isObject = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
  const hasLabel = isObject && typeof entry.label === 'string' && entry.label !== '';
  const bad = (error) => ({ label: hasLabel ? entry.label : `Entry ${index + 1}`, ok: false, error });
  if (!isObject) return bad('expected an object {amount, currency, period}');

  const { amount, currency, period } = entry;
  const values = Array.isArray(amount) ? amount : [amount];
  if (values.length < 1 || values.length > 2 || !values.every(isAmount)) {
    return bad('"amount" must be a number or [min, max], not negative');
  }
  if (typeof currency !== 'string' || !Object.hasOwn(ratesConfig.rates, currency)) return bad(`unknown currency ${JSON.stringify(currency)}`);
  if (!config.periods.includes(period)) return bad(`unknown period ${JSON.stringify(period)}`);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const label = hasLabel ? entry.label : `${formatRange(min, max, 2)} ${currency}`;
  return { label, ok: true, currency, min, max, period };
}
