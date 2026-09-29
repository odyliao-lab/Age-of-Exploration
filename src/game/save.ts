/**
 * 存檔（企畫書 15.1.1）：本機優先，存在 IndexedDB。
 * 每個劇本一份存檔，以 scenarioId 為鍵。迷霧以 base64 位元組保存。
 */
import Dexie, { type Table } from 'dexie';
import { newCaptain } from './captain';
import { decodeFog, encodeFog } from './fog';
import { newSeed } from './rng';
import { fullCondition, shipType } from './ship';
import { skillPointsEarned } from './progression';
import { EMPTY_STATS } from './achievements';
import { defaultAppearance } from './cosmetics';
import { SAVE_VERSION, type GameState } from './state';

export interface SerializedSave extends Omit<GameState, 'fog'> {
  fog: string;
}

export interface SaveRecord {
  scenarioId: string;
  updatedAt: number;
  data: SerializedSave;
}

export function serialize(state: GameState): SerializedSave {
  return { ...state, fog: encodeFog(state.fog) };
}

/** 讀取舊版存檔時補上新欄位的預設值 */
export function deserialize(data: SerializedSave): GameState {
  return {
    ...data,
    version: SAVE_VERSION,
    fog: decodeFog(data.fog),
    captain: { ...newCaptain(), ...data.captain },
    quizLog: data.quizLog ?? [],
    quests: data.quests ?? {},
    discovered: data.discovered ?? [],
    visitedPorts: data.visitedPorts ?? [],
    unlockedPorts: data.unlockedPorts ?? [],
    // 第 2 版新增：曆法、船況、遭遇、亂數
    startDate: data.startDate ?? '1405-12-15',
    shipTypeId: data.shipTypeId ?? 'junk',
    condition: data.condition ?? fullCondition(shipType(data.shipTypeId ?? 'junk')),
    lastPortId: data.lastPortId ?? data.dockedAt ?? data.visitedPorts?.[0] ?? '',
    encounter: data.encounter ?? null,
    shipwrecks: data.shipwrecks ?? 0,
    seed: data.seed ?? newSeed(),
    // 第 3 版新增：隨機事件冷卻
    eventCooldownUntil: data.eventCooldownUntil ?? 0,
    // 第 4 版新增：技能、船員、成就
    skills: data.skills ?? [],
    skillPoints:
      data.skillPoints ??
      Math.max(0, skillPointsEarned(data.captain?.level ?? 1) - (data.skills?.length ?? 0)),
    crew: data.crew ?? [],
    achievements: data.achievements ?? [],
    title: data.title ?? null,
    stats: { ...EMPTY_STATS, ...data.stats },
    // 第 5 版新增：錯題回流、今日航程、航海紀錄
    reviews: data.reviews ?? [],
    daily: data.daily ?? null,
    log: data.log ?? [],
    // 第 6 版新增：外觀
    appearance: { ...defaultAppearance(), ...data.appearance },
    // 第 7 版新增：親手駕船
    helm: data.helm ?? null,
    rumors: data.rumors ?? [],
  };
}

class SaveDb extends Dexie {
  saves!: Table<SaveRecord, string>;
  constructor() {
    super('age-of-exploration');
    this.version(1).stores({ saves: 'scenarioId, updatedAt' });
  }
}

let db: SaveDb | null = null;
function getDb(): SaveDb | null {
  if (typeof indexedDB === 'undefined') return null;
  db ??= new SaveDb();
  return db;
}

export async function loadSave(scenarioId: string): Promise<GameState | null> {
  try {
    const rec = await getDb()?.saves.get(scenarioId);
    return rec ? deserialize(rec.data) : null;
  } catch (e) {
    console.warn('讀取存檔失敗', e);
    return null;
  }
}

export async function listSaves(): Promise<Pick<SaveRecord, 'scenarioId' | 'updatedAt'>[]> {
  try {
    const all = (await getDb()?.saves.toArray()) ?? [];
    return all.map(({ scenarioId, updatedAt }) => ({ scenarioId, updatedAt }));
  } catch {
    return [];
  }
}

/** 寫入本機存檔，回傳這次的更新時間（失敗時為 null） */
export async function writeSave(state: GameState): Promise<number | null> {
  try {
    const d = getDb();
    if (!d) return null;
    // 確保時間嚴格遞增，同步判斷才不會漏掉同一毫秒內的變更
    const prev = await d.saves.get(state.scenarioId);
    const updatedAt = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
    await d.saves.put({ scenarioId: state.scenarioId, updatedAt, data: serialize(state) });
    return updatedAt;
  } catch (e) {
    console.warn('寫入存檔失敗', e);
    return null;
  }
}

/** 讀取本機存檔與它的更新時間（雲端同步用） */
export async function loadSaveRecord(
  scenarioId: string,
): Promise<{ updatedAt: number; data: SerializedSave } | null> {
  try {
    const rec = await getDb()?.saves.get(scenarioId);
    return rec ? { updatedAt: rec.updatedAt, data: rec.data } : null;
  } catch {
    return null;
  }
}

export async function deleteSave(scenarioId: string): Promise<void> {
  try {
    await getDb()?.saves.delete(scenarioId);
  } catch (e) {
    console.warn('刪除存檔失敗', e);
  }
}

/** 匯出成 JSON 檔（企畫書 13：學習紀錄匯出、跨裝置手動搬移） */
export function exportSaveJson(state: GameState): string {
  return JSON.stringify({ app: 'age-of-exploration', save: serialize(state) }, null, 2);
}

export function importSaveJson(text: string): GameState {
  const parsed = JSON.parse(text) as { app?: string; save?: SerializedSave };
  if (parsed.app !== 'age-of-exploration' || !parsed.save?.scenarioId) {
    throw new Error('這不是 Age of Exploration 的存檔檔案');
  }
  return deserialize(parsed.save);
}
