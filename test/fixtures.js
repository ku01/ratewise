import { readFileSync } from 'node:fs';
import { validateRatesConfig } from '../public/js/rates.js';

export const readData = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));

// Fixed copy of the placeholder rates, so the examples below do not change
// when data/exchange-rates.json is updated with real numbers.
export const RATES_JSON = {
  base: 'PLN',
  currencies: [
    { code: 'PLN', symbol: 'zł', rate: 1 },
    { code: 'EUR', symbol: '€', rate: 4.25 },
    { code: 'USD', symbol: '$', rate: 3.65 },
    { code: 'RUB', symbol: '₽', rate: 0.045 },
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
      ['120', '28.24', '32.88', '2 666.67'],
      ['960', '226', '263', '21 333'],
      ['20 160', '4 744', '5 523', '448 000'],
      ['241 920', '56 922', '66 279', '5 376 000'],
    ],
  },
  {
    name: 'B: 300-320 USD daily',
    anchor: { period: 'daily', currency: 'USD', min: 300, max: 320 },
    expected: [
      ['136.88–146', '32.21–34.35', '37.5–40', '3 041.67–3 244.44'],
      ['1 095–1 168', '258–275', '300–320', '24 333–25 956'],
      ['22 995–24 528', '5 411–5 771', '6 300–6 720', '511 000–545 067'],
      ['275 940–294 336', '64 927–69 256', '75 600–80 640', '6 132 000–6 540 800'],
    ],
  },
  {
    name: 'C: 5000 USD monthly',
    anchor: { period: 'monthly', currency: 'USD', min: 5000, max: 5000 },
    expected: [
      ['108.63', '25.56', '29.76', '2 414.02'],
      ['869', '204', '238', '19 312'],
      ['18 250', '4 294', '5 000', '405 556'],
      ['219 000', '51 529', '60 000', '4 866 667'],
    ],
  },
];
