import { formatPaise, parseRupeesToPaise, parseRupeesAllowZero, isValidPaise } from '../src/domain/money';

describe('money', () => {
  test('parses rupees to exact paise', () => {
    expect(parseRupeesToPaise('1')).toBe(100);
    expect(parseRupeesToPaise('125.50')).toBe(12550);
    expect(parseRupeesToPaise('125.5')).toBe(12550);
    expect(parseRupeesToPaise('₹1,000.00')).toBe(100000);
    expect(parseRupeesToPaise('0.29')).toBe(29);   // classic float trap (0.29*100 = 28.999…)
    expect(parseRupeesToPaise('1.15')).toBe(115);
  });
  test('rejects invalid input', () => {
    for (const s of ['', '0', '0.00', '-5', 'abc', '1.234', '1e5', '1..2', '999999999999']) expect(parseRupeesToPaise(s)).toBeNull();
  });
  test('allow-zero variant', () => {
    expect(parseRupeesAllowZero('')).toBe(0);
    expect(parseRupeesAllowZero('0')).toBe(0);
    expect(parseRupeesAllowZero('50')).toBe(5000);
    expect(parseRupeesAllowZero('x')).toBeNull();
  });
  test('formats with Indian grouping', () => {
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(12550)).toBe('₹125.50');
    expect(formatPaise(123456750)).toBe('₹12,34,567.50');
    expect(formatPaise(-5000)).toBe('-₹50.00');
    expect(formatPaise(5000, { showSign: true })).toBe('+₹50.00');
  });
  test('isValidPaise', () => {
    expect(isValidPaise(1)).toBe(true);
    expect(isValidPaise(0)).toBe(false);
    expect(isValidPaise(1.5)).toBe(false);
    expect(isValidPaise(NaN)).toBe(false);
  });
});
