import { validateRatesConfig } from '../public/js/rates.js';

// Fixed rates for the currencies in CURRENCIES (exchange-rates.js), so the
// examples below do not depend on live exchange rates.
export const RATES_JSON = {
  base: 'USD',
  currencies: [
    { code: 'PLN', symbol: 'zł', rate: 3.65 },
    { code: 'EUR', symbol: '€', rate: 0.859 },
    { code: 'USD', symbol: '$', rate: 1 },
    { code: 'RUB', symbol: '₽', rate: 81.3 },
  ],
};

export const RATES_CONFIG = validateRatesConfig(RATES_JSON).config;
export const RATES = RATES_CONFIG.rates;

// Expected formatted tables; rows hourly/daily/monthly/annual, columns PLN/EUR/USD/RUB.
// The anchor cell is included as the formatter would print it.
export const EXAMPLES = [
  {
    name: 'A: 120 PLN hourly',
    anchor: { period: 'hourly', currency: 'PLN', min: 120, max: 120 },
    expected: [
      ['120', '28.24', '32.88', '2 672.88'],
      ['960', '226', '263', '21 383'],
      ['20 160', '4 745', '5 523', '449 043'],
      ['241 920', '56 934', '66 279', '5 388 519'],
    ],
  },
  {
    name: 'B: 300-320 USD daily',
    anchor: { period: 'daily', currency: 'USD', min: 300, max: 320 },
    expected: [
      ['136.88–146', '32.21–34.36', '37.5–40', '3 048.75–3 252'],
      ['1 095–1 168', '258–275', '300–320', '24 390–26 016'],
      ['22 995–24 528', '5 412–5 772', '6 300–6 720', '512 190–546 336'],
      ['275 940–294 336', '64 940–69 270', '75 600–80 640', '6 146 280–6 556 032'],
    ],
  },
  {
    name: 'C: 5000 USD monthly',
    anchor: { period: 'monthly', currency: 'USD', min: 5000, max: 5000 },
    expected: [
      ['108.63', '25.57', '29.76', '2 419.64'],
      ['869', '205', '238', '19 357'],
      ['18 250', '4 295', '5 000', '406 500'],
      ['219 000', '51 540', '60 000', '4 878 000'],
    ],
  },
];
