import { describe, expect, it } from 'vitest';
import { hijriOf, hijriToJd, jdToHijri, julianCalendarToJd } from './hijri';

describe('Hijri calendar', () => {
  it('starts on 16 July 622 (Julian)', () => {
    expect(hijriOf({ year: 622, month: 7, day: 16 })).toEqual({ year: 1, month: 1, day: 1 });
  });

  it('round-trips and puts Ramadan 808 AH in early 1406', () => {
    for (let jd = 2233000; jd < 2234500; jd += 7) {
      const h = jdToHijri(jd);
      expect(hijriToJd(h.year, h.month, h.day)).toBe(jd);
      expect(h.day).toBeGreaterThanOrEqual(1);
      expect(h.day).toBeLessThanOrEqual(30);
    }
    const r = jdToHijri(hijriToJd(808, 9, 1));
    expect(r).toEqual({ year: 808, month: 9, day: 1 });
    // 伊斯蘭曆 808 年 9 月 1 日約在儒略曆 1406 年 2 月
    const jd = hijriToJd(808, 9, 1);
    expect(jd).toBeGreaterThan(julianCalendarToJd(1406, 1, 20));
    expect(jd).toBeLessThan(julianCalendarToJd(1406, 3, 10));
  });
});
