import { describe, expect, it } from 'vitest';
import { crossValidate } from './validate';
import type { ContentBundle } from './schema';

const base = (): ContentBundle => ({
  regions: [
    {
      id: 'east-china-sea',
      name: '東海',
      name_en: 'East China Sea',
      center: [123, 28],
      bbox: [117, 20, 132, 41],
    },
  ],
  ports: [
    {
      id: 'quanzhou',
      name: '泉州',
      name_en: 'Quanzhou',
      historical_names: [],
      gossip: [],
      country: '中國',
      country_en: 'China',
      region: 'east-china-sea',
      location: [118.6, 24.9],
      kind: 'hub',
      goods: [],
      sights: [],
    },
  ],
  codex: [],
  crew: [],
  quests: [],
  scenarios: [
    {
      id: 'treasure-fleet',
      name: '東方寶船',
      name_en: 'Treasure Fleet',
      tagline: '',
      description: '',
      culture: '',
      era: '',
      inspiration: '',
      home_port: 'quanzhou',
      home_region: 'east-china-sea',
      starting_ports: [],
      ships: [],
      region_tiers: { 'east-china-sea': 0 },
      starting_ship: 'junk',
      start_date: '1405-12-15',
      recommended: true,
      domains: ['A'],
      estimated_hours: 1,
      chapters: [{ index: 0, title: '序章', tier: 0, summary: '' }],
    },
  ],
});

describe('crossValidate', () => {
  it('passes a consistent bundle', () => {
    expect(crossValidate(base())).toEqual([]);
  });

  it('rejects unknown region on a port', () => {
    const b = base();
    b.ports[0].region = 'nowhere';
    expect(crossValidate(b).some((i) => i.message.includes('未知的海域區'))).toBe(true);
  });

  it('requires home region tier 0', () => {
    const b = base();
    b.scenarios[0].region_tiers['east-china-sea'] = 1;
    expect(crossValidate(b).some((i) => i.message.includes('Tier 必須是 0'))).toBe(true);
  });

  it('requires science_note on legends', () => {
    const b = base();
    b.codex.push({
      id: 'kraken',
      category: 'legend',
      name: '海怪',
      name_en: 'Kraken',
      domains: ['D'],
      body: '北海的巨大海怪傳說，據說能拖沉整艘船，水手們聞之色變。',
      source: 'test',
      reviewed: false,
    });
    expect(crossValidate(b).some((i) => i.message.includes('science_note'))).toBe(true);
  });

  it('rejects quest steps pointing at unknown ports', () => {
    const b = base();
    b.quests.push({
      id: 'q',
      title: 't',
      scenario: 'treasure-fleet',
      chapter: 0,
      tier: 0,
      kind: 'main',
      giver_port: 'quanzhou',
      objectives: [{ domain: 'A', text: 'x' }],
      prerequisites: [],
      steps: [{ type: 'navigate', target: 'atlantis', hint_level: 1 }],
      reward: { xp: 0, gold: 0, reputation: 0, unlock_ports: [], codex: [] },
    });
    expect(crossValidate(b).some((i) => i.message.includes('未知的港口 atlantis'))).toBe(true);
  });
});
