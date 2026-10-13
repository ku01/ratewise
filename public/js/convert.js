export function periodHours(config) {
  const daily = config.hoursPerDay;
  const monthly = daily * config.daysPerMonth;
  return { hourly: 1, daily, monthly, annual: monthly * config.monthsPerYear };
}

// anchor = {period, currency, min, max}; rates = {CODE: units per 1 base unit}.
// Returns {[period]: {[code]: {min, max}}} at full precision.
export function computeTable(anchor, rates, config) {
  const hours = periodHours(config);
  const table = {};
  for (const period of config.periods) {
    table[period] = {};
    for (const code of Object.keys(rates)) {
      const factor =
        (rates[code] / rates[anchor.currency]) * (hours[period] / hours[anchor.period]);
      table[period][code] = { min: anchor.min * factor, max: anchor.max * factor };
    }
  }
  return table;
}
