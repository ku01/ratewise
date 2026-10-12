const fail = (error) => ({ ok: false, error });

// Validates the parsed exchange-rates file. On success returns
// {ok, config: {base, currencies, rates: {CODE: rate}}}.
// Currency order is the table column order.
export function validateRatesConfig(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.currencies)) {
    return fail('expected an object with a "currencies" array');
  }
  if (json.currencies.length === 0) return fail('"currencies" is empty');

  const currencies = [];
  const rates = {};
  for (const entry of json.currencies) {
    const code = entry?.code;
    if (typeof code !== 'string' || code === '') return fail('a currency has no "code"');
    if (code in rates) return fail(`duplicate currency code ${code}`);
    const rate = entry.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      return fail(`rate of ${code} must be a number greater than 0`);
    }
    const symbol = typeof entry.symbol === 'string' && entry.symbol !== '' ? entry.symbol : code;
    rates[code] = rate;
    currencies.push({ code, symbol, rate });
  }

  if (!(json.base in rates)) return fail(`base currency "${json.base}" is not in "currencies"`);
  if (rates[json.base] !== 1) return fail(`rate of the base currency ${json.base} must be 1`);

  return { ok: true, config: { base: json.base, currencies, rates } };
}
