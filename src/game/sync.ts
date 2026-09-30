/**
 * 雲端存檔同步（企畫書 Q21）：純函式，決定本機與雲端存檔該怎麼對齊。
 *
 * 每台裝置記住「上次同步時」本機與雲端的更新時間（SyncBase）。
 * 只有一邊變了就沿用那一邊；兩邊都變了（例如兩台裝置離線各玩一段）就是衝突，交給玩家選。
 */
import { chartedArea, type GameState } from './state';

export interface SyncBase {
  /** 上次同步時本機存檔的更新時間 */
  local: number;
  /** 上次同步時雲端存檔的更新時間 */
  cloud: number;
}

export type SyncAction = 'none' | 'upload' | 'download' | 'conflict';

export function decideSync(
  localUpdatedAt: number | null,
  cloudUpdatedAt: number | null,
  base: SyncBase | null,
): SyncAction {
  if (localUpdatedAt === null && cloudUpdatedAt === null) return 'none';
  if (cloudUpdatedAt === null) return 'upload';
  if (localUpdatedAt === null) return 'download';
  // 這台裝置從未和雲端同步過，兩邊都有進度：不能猜，讓玩家選
  if (!base) return 'conflict';
  const localChanged = localUpdatedAt > base.local;
  const cloudChanged = cloudUpdatedAt > base.cloud;
  if (localChanged && cloudChanged) return 'conflict';
  if (localChanged) return 'upload';
  if (cloudChanged) return 'download';
  return 'none';
}

/**
 * 上傳時使用的雲端時間戳：至少比已知的雲端時間晚 1 毫秒，
 * 避免某台裝置時鐘偏慢時，其他裝置誤以為雲端沒有變化。
 */
export function nextCloudStamp(now: number, knownCloud: number | null): number {
  return knownCloud === null ? now : Math.max(now, knownCloud + 1);
}

/** 衝突時給玩家比較的進度摘要 */
export interface SaveSummary {
  updatedAt: number;
  day: number;
  level: number;
  questsDone: number;
  ports: number;
  codex: number;
  explored: number;
}

export function saveSummary(state: GameState, updatedAt: number): SaveSummary {
  return {
    updatedAt,
    day: Math.floor(state.day) + 1,
    level: state.captain.level,
    questsDone: Object.values(state.quests).filter((q) => q.status === 'completed').length,
    ports: state.visitedPorts.length,
    codex: state.discovered.length,
    explored: chartedArea(state),
  };
}
