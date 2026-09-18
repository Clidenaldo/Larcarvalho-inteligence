/** Difference of nonnegative monetary API strings, without floating-point conversion. */
export function commissionDifference(
  confirmed: string,
  planned: string,
): string {
  const cents = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const difference = cents(confirmed) - cents(planned);
  const absolute = difference < 0n ? -difference : difference;
  return `${difference < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
