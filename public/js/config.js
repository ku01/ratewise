export const CONFIG = {
  hoursPerDay: 8,
  daysPerMonth: 21,
  monthsPerYear: 12,
  periods: ['hourly', 'daily', 'monthly', 'annual'], // row order
  decimals: { hourly: 2, daily: 0, monthly: 0, annual: 0 },
  // A preset without a period gets one guessed from its base-currency amount.
  periodGuessThresholdsBase: { daily: 600, monthly: 4000, annual: 80000 },
};
