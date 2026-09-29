import { describe, expect, it } from 'vitest';
import { revealAround } from './fog';
import { deserialize, exportSaveJson, importSaveJson, serialize } from './save';
import { newGame, type GameState } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());

/** 迷霧有四百萬格，逐格深比較太慢：分開比對位元組 */
function expectSameState(a: GameState, b: GameState) {
  expect(Buffer.from(a.fog).equals(Buffer.from(b.fog))).toBe(true);
  expect({ ...a, fog: null }).toEqual({ ...b, fog: null });
}

describe('save', () => {
  it('round-trips a game state including fog', () => {
    const { state } = newGame(world, 'treasure-fleet', 1);
    revealAround(state.fog, [0, 0], 500);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
    expectSameState(back, state);
  });

  it('fills defaults for older saves', () => {
    const { state } = newGame(world, 'treasure-fleet', 1);
    const old = serialize(state) as unknown as Record<string, unknown>;
    delete old.quizLog;
    const back = deserialize(old as never);
    expect(back.quizLog).toEqual([]);
  });

  it('exports and imports JSON files', () => {
    const { state } = newGame(world, 'treasure-fleet', 1);
    expectSameState(importSaveJson(exportSaveJson(state)), state);
    expect(() => importSaveJson('{"foo":1}')).toThrow('不是');
  });
});
