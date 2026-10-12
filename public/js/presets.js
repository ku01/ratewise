import { parseRate, PERIODS } from './parse.js';

export function guessPeriod(minInBase, thresholds) {
  if (minInBase < thresholds.daily) return 'hourly';
  if (minInBase < thresholds.monthly) return 'daily';
  if (minInBase < thresholds.annual) return 'monthly';
  return 'annual';
}

// entry is a free-form string or {rate, period?, label?}.
// Returns {label, ok, currency, min, max, period, periodGuessed} or {label, ok: false, error}.
export function resolvePreset(entry, ratesConfig, config, index = 0) {
  const isObject = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
  const rate = isObject ? entry.rate : entry;
  if (typeof rate !== 'string') {
    return { label: `Entry ${index + 1}`, ok: false, error: 'expected a string or {rate, period, label}' };
  }
  const label = isObject && typeof entry.label === 'string' && entry.label !== '' ? entry.label : rate;
  const explicit = isObject ? entry.period : undefined;
  if (explicit !== undefined && !PERIODS.includes(explicit)) {
    return { label, ok: false, error: `unknown period "${explicit}"` };
  }

  const parsed = parseRate(rate, ratesConfig);
  if (!parsed.ok) return { label, ok: false, error: parsed.error };
  if (explicit && parsed.period && explicit !== parsed.period) {
    return { label, ok: false, error: `conflicting period: "${rate}" vs "${explicit}"` };
  }

  const stated = explicit ?? parsed.period;
  const period =
    stated ??
    guessPeriod(parsed.min * ratesConfig.rates[parsed.currency], config.periodGuessThresholdsBase);
  return {
    label,
    ok: true,
    currency: parsed.currency,
    min: parsed.min,
    max: parsed.max,
    period,
    periodGuessed: !stated,
  };
}
