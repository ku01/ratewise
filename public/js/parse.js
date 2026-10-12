const fail = (error) => ({ ok: false, error });

const RANGE_SEPARATORS = '-–—−';

function normalizeSpaces(text) {
  return String(text).replace(/[\u00A0\u202F\u2009]/g, ' ');
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
