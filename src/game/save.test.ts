import { describe, expect, it } from 'vitest';
import { revealAround } from './fog';
import { deserialize, exportSaveJson, importSaveJson, serialize } from './save';
import { newGame } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());

describe('save', () => {
  it('round-trips a game state including fog', () => {
    const { state } = newGame(world, 'treasure-fleet');
    revealAround(state.fog, [0, 0], 500);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
    expect(back).toEqual(state);
  });

  it('fills defaults for older saves', () => {
    const { state } = newGame(world, 'treasure-fleet');
    const old = serialize(state) as unknown as Record<string, unknown>;
    delete old.quizLog;
    const back = deserialize(old as never);
    expect(back.quizLog).toEqual([]);
  });

  it('exports and imports JSON files', () => {
    const { state } = newGame(world, 'treasure-fleet');
    expect(importSaveJson(exportSaveJson(state))).toEqual(state);
    expect(() => importSaveJson('{"foo":1}')).toThrow('不是');
  });
});
