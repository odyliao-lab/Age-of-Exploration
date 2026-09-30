import { describe, expect, it } from 'vitest';
import { contentForTests } from '@/game/testContent';
import { folkLines, greetingFor } from './folkTalk';
import { cultureOf } from './layout';
import { festivalAt } from './festivals';

describe('townsfolk talk', () => {
  const ports = contentForTests().ports;

  it('gives every port something to say, starting with the local greeting', () => {
    for (const p of ports) {
      const lines = folkLines(p.id, cultureOf(p.country), p.gossip);
      expect(lines.length, p.id).toBeGreaterThanOrEqual(4);
      const g = greetingFor(p.id);
      if (g) expect(lines[0]).toContain(g.lang);
    }
  });

  it('greets in the language of the place', () => {
    expect(greetingFor('quanzhou')?.lang).toBe('閩南話');
    expect(greetingFor('malacca')?.lang).toBe('馬來語');
    expect(greetingFor('kilwa')?.lang).toBe('斯瓦希里語');
  });
});

describe('festivals', () => {
  it('decorate the right ports in the right months', () => {
    const on = (month: number, day = 10) => ({ year: 1406, month, day });
    expect(festivalAt('quanzhou', on(2))?.name).toBe('元宵節');
    expect(festivalAt('quanzhou', on(3))).toBeNull();
    expect(festivalAt('cochin', on(9))?.decor).toBe('flowers');
    expect(festivalAt('galle', on(5))?.name).toBe('衛塞節');
    expect(festivalAt('hormuz', on(5))).toBeNull();
  });

  it('follows the Islamic calendar in Muslim ports, a little earlier every year', () => {
    const ramadanDays = (year: number) => {
      const days: number[] = [];
      for (let m = 1; m <= 12; m++)
        for (let d = 1; d <= 28; d++)
          if (festivalAt('aden', { year, month: m, day: d })?.name === '齋月')
            days.push(m * 31 + d);
      return days;
    };
    const a = ramadanDays(1406);
    const b = ramadanDays(1407);
    expect(a.length).toBeGreaterThan(20);
    expect(b[0]).toBeLessThan(a[0]);
  });

  it('let townsfolk talk about the festival right after the greeting', () => {
    const f = festivalAt('quanzhou', { year: 1406, month: 2, day: 10 })!;
    const lines = folkLines('quanzhou', 'minnan', [], f.text);
    expect(lines[1]).toBe(f.text);
  });
});
