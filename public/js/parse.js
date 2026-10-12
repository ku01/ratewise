const fail = (error) => ({ ok: false, error });

const RANGE_SEPARATORS = '-–—−';

const PERIOD_WORDS = {
  hourly: ['h', 'hr', 'hour', 'hours', 'hourly'],
  daily: ['d', 'day', 'days', 'daily'],
  monthly: ['m', 'mo', 'mon', 'month', 'months', 'monthly'],
  annual: ['y', 'yr', 'year', 'years', 'yearly', 'annual', 'annually', 'annum'],
};

const WORD_TO_PERIOD = new Map(
  Object.entries(PERIOD_WORDS).flatMap(([period, words]) => words.map((w) => [w, period])),
);

// Longest words first so "monthly" is not read as "mo" + "nthly".
const PERIOD_ALTERNATIVES = [...WORD_TO_PERIOD.keys()].sort((a, b) => b.length - a.length).join('|');
const PERIOD_RE = new RegExp(
  `(?:(?:^|\\s)(?:per|an|a)\\s+|/\\s*|(?:^|\\s))(${PERIOD_ALTERNATIVES})$`,
);
const AMOUNT_RE = new RegExp(
  `\\d[\\d\\s.,']*(?:\\s*[${RANGE_SEPARATORS}]\\s*\\d[\\d\\s.,']*)?`,
);

export const PERIODS = Object.keys(PERIOD_WORDS);

function normalizeSpaces(text) {
  return String(text).replace(/[   ]/g, ' ');
}

// decimalOnly: a lone separator is always a decimal point (used for exchange
// rates, where 3.652 must not be read as 3652).
export function parseNumber(text, { decimalOnly = false } = {}) {
  const s = normalizeSpaces(text).replace(/[ ']/g, '');
  const bad = fail(`"${String(text).trim()}" is not a number`);
  if (!/^\d[\d.,]*$/.test(s) || !/\d$/.test(s)) return bad;

  const dots = s.split('.').length - 1;
  const commas = s.split(',').length - 1;
  let decimalSep = null;
  if (dots && commas) {
    decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ',';
    const [head, tail] = s.split(sep);
    const thousands = !decimalOnly && tail.length === 3 && head.length <= 3 && head !== '0';
    if (!thousands) decimalSep = sep;
  }

  let int = s;
  let frac = '';
  if (decimalSep) {
    const i = s.lastIndexOf(decimalSep);
    int = s.slice(0, i);
    frac = s.slice(i + 1);
    if (!/^\d+$/.test(frac)) return bad;
  }
  if (/[.,]/.test(int)) {
    const grouped = /^\d{1,3}(\.\d{3})+$/.test(int) || /^\d{1,3}(,\d{3})+$/.test(int);
    if (!grouped) return bad;
    int = int.replace(/[.,]/g, '');
  }

  const value = Number(frac ? `${int}.${frac}` : int);
  if (!Number.isFinite(value) || value < 0) return bad;
  return { ok: true, value };
}

export function parseAmount(text) {
  const s = normalizeSpaces(text).trim();
  if (s === '') return { ok: true, empty: true };
  const bad = fail(`"${s}" is not a number or range. Use 100 or 100-120.`);

  const parts = s.split(new RegExp(`[${RANGE_SEPARATORS}]`));
  if (parts.length > 2) return bad;
  const values = [];
  for (const part of parts) {
    const parsed = parseNumber(part);
    if (!parsed.ok) return bad;
    values.push(parsed.value);
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { ok: true, min, max };
}

// Free-form rate such as "$5000", "120 pln per hour", "€45/h".
// Returns {ok, currency, min, max, period} where period may be null.
export function parseRate(text, ratesConfig) {
  const work = normalizeSpaces(text).toLowerCase().trim();
  const match = AMOUNT_RE.exec(work);
  if (!match) return fail('no amount');
  const amount = parseAmount(match[0]);
  if (!amount.ok || amount.empty) return fail(amount.error ?? 'no amount');

  const before = work.slice(0, match.index).trim();
  let after = work.slice(match.index + match[0].length).trim();

  let period = null;
  const periodMatch = PERIOD_RE.exec(after);
  if (periodMatch) {
    period = WORD_TO_PERIOD.get(periodMatch[1]);
    after = after.slice(0, periodMatch.index).trim();
  }

  const codes = [];
  for (const chunk of [before, after]) {
    if (chunk === '') continue;
    const code = ratesConfig.aliases.get(chunk);
    if (!code) return fail(`unrecognized text: ${chunk}`);
    codes.push(code);
  }
  if (codes.length === 0) return fail('no currency');
  if (codes.length === 2 && codes[0] !== codes[1]) return fail('two currencies');

  return { ok: true, currency: codes[0], min: amount.min, max: amount.max, period };
}
