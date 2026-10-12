// Hand-rolled instead of Intl.NumberFormat so output is the same in every
// locale and parseAmount can always read it back.
export function formatNumber(x, decimals) {
  const scale = 10 ** decimals;
  const rounded = Math.round((x + Number.EPSILON) * scale) / scale;
  let text = rounded.toFixed(decimals);
  if (decimals > 0) text = text.replace(/\.?0+$/, '');
  const [int, frac] = text.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+$)/g, ' ');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function formatRange(min, max, decimals) {
  const low = formatNumber(min, decimals);
  const high = formatNumber(max, decimals);
  return low === high ? low : `${low}–${high}`;
}
