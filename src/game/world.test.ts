import { describe, expect, it } from 'vitest';
import { contentForTests } from './testContent';
import { buildWorld, scenarioWorld } from './world';

describe('scenarioWorld', () => {
  const content = contentForTests();
  const base = buildWorld(content);
  const sid = 'treasure-fleet';

  it('沒有要換的港口名稱時沿用原本的世界', () => {
    expect(scenarioWorld(base, sid)).toBe(base);
  });

  it('依劇本視角替港口換名字，其他資料不變', () => {
    const portId = content.ports[0].id;
    const renamed = buildWorld({
      ...content,
      scenarios: content.scenarios.map((s) =>
        s.id === sid ? { ...s, port_names: { [portId]: '刺桐' } } : s,
      ),
    });
    const w = scenarioWorld(renamed, sid);
    expect(w.ports.get(portId)!.name).toBe('刺桐');
    expect(w.content.ports.find((p) => p.id === portId)!.name).toBe('刺桐');
    expect(renamed.ports.get(portId)!.name).toBe(content.ports[0].name);
    expect(w.ports.get(portId)!.location).toEqual(content.ports[0].location);
    expect(scenarioWorld(renamed, sid)).toBe(w);
  });
});

describe('makeRenamer', () => {
  it('長的名字先換，其他文字不動', async () => {
    const { makeRenamer } = await import('./world');
    const r = makeRenamer({ 錫蘭山: '錫蘭', 古里: '卡利卡特', 阿丹: '亞丁' });
    expect(r('從古里到錫蘭山，再回阿丹。')).toBe('從卡利卡特到錫蘭，再回亞丁。');
    expect(r('沒有地名')).toBe('沒有地名');
  });
});
