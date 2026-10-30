/**
 * A count of 10^-decimals units, exact at any size: (1234500, 6) → "1.2345".
 * `separator` groups the whole part's thousands ("" for none).
 */
export function formatUnits(v: number | bigint, decimals: number, separator = ","): string {
  const n = BigInt(v);
  const digits = (n < 0n ? -n : n).toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const whole = digits.slice(0, cut).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const fraction = digits.slice(cut).replace(/0+$/, "");
  return `${n < 0n ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
