/**
 * 伊斯蘭曆（希吉拉曆）換算：用來決定齋月與開齋節。
 * 遊戲裡的 15 世紀日期當作儒略曆，先換成儒略日，再用「表格式伊斯蘭曆」換算，
 * 和天文觀測的新月可能差一兩天，遊戲用途足夠。
 */

export interface HijriDate {
  year: number;
  month: number;
  day: number;
}

/** 儒略曆日期 → 儒略日（中午為整數） */
export function julianCalendarToJd(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
}

/** 表格式伊斯蘭曆的起點（西元 622 年 7 月 16 日，儒略曆） */
const ISLAMIC_EPOCH = 1948440;

export function jdToHijri(jd: number): HijriDate {
  let year = Math.floor((30 * (jd - ISLAMIC_EPOCH) + 10646) / 10631);
  while (hijriToJd(year, 1, 1) > jd) year--;
  while (hijriToJd(year + 1, 1, 1) <= jd) year++;
  let month = 12;
  while (hijriToJd(year, month, 1) > jd) month--;
  return { year, month, day: jd - hijriToJd(year, month, 1) + 1 };
}

export function hijriToJd(year: number, month: number, day: number): number {
  return (
    day +
    Math.ceil(29.5 * (month - 1)) +
    (year - 1) * 354 +
    Math.floor((3 + 11 * year) / 30) +
    ISLAMIC_EPOCH -
    1
  );
}

export function hijriOf(date: { year: number; month: number; day: number }): HijriDate {
  return jdToHijri(julianCalendarToJd(date.year, date.month, date.day));
}
