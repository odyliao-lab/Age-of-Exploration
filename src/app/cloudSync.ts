/**
 * 雲端存檔同步流程：登入後、每次本機存檔後（延遲合併）、切到背景、回到選單、恢復網路時同步。
 * 規則在 src/game/sync.ts（純函式、有單元測試）；這裡負責讀寫本機、雲端與介面狀態。
 */
import { create } from 'zustand';
import { deserialize, listSaves, loadSaveRecord, writeSave } from '@/game/save';
import { SAVE_VERSION } from '@/game/state';
import {
  decideSync,
  nextCloudStamp,
  saveSummary,
  type SaveSummary,
  type SyncBase,
} from '@/game/sync';
import type { SerializedSave } from '@/game/save';
import {
  authErrorInUrl,
  cloudConfigured,
  fetchCloudSave,
  listCloudSaves,
  pushCloudSave,
  signInWithGoogle,
  signOut as cloudSignOut,
  watchAuth,
  type CloudUser,
} from './cloud';
import { flushSave, onLocalSave, useGame } from './store';
import { isDebug } from './debug';

export interface SyncConflict {
  scenarioId: string;
  local: SaveSummary;
  cloud: SaveSummary;
  cloudData: SerializedSave;
}

export type CloudStatus = 'off' | 'loading' | 'signedOut' | 'idle' | 'syncing' | 'error';

interface CloudStore {
  status: CloudStatus;
  user: CloudUser | null;
  lastSyncAt: number | null;
  message: string | null;
  conflict: SyncConflict | null;
}

export const useCloud = create<CloudStore>(() => ({
  status: cloudConfigured() ? 'loading' : 'off',
  user: null,
  lastSyncAt: null,
  message: null,
  conflict: null,
}));

// ---------------------------------------------------------------- 同步基準（每位使用者、每個劇本）

const baseKey = (userId: string, scenarioId: string) => `aoe-sync:${userId}:${scenarioId}`;

function readBase(userId: string, scenarioId: string): SyncBase | null {
  try {
    const raw = localStorage.getItem(baseKey(userId, scenarioId));
    return raw ? (JSON.parse(raw) as SyncBase) : null;
  } catch {
    return null;
  }
}

function writeBase(userId: string, scenarioId: string, base: SyncBase) {
  try {
    localStorage.setItem(baseKey(userId, scenarioId), JSON.stringify(base));
  } catch {
    // 無法記錄時，下次同步會當成第一次同步處理（最壞情況是多問一次玩家）
  }
}

// ---------------------------------------------------------------- 同步

let running: Promise<void> | null = null;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SYNC_MS = 20_000;

async function syncScenario(user: CloudUser, scenarioId: string, cloudStamp: number | null) {
  const local = await loadSaveRecord(scenarioId);
  const base = readBase(user.id, scenarioId);
  const action = decideSync(local?.updatedAt ?? null, cloudStamp, base);

  if (action === 'upload' && local) {
    const stamp = nextCloudStamp(Date.now(), cloudStamp);
    await pushCloudSave(user.id, { scenarioId, updatedAt: stamp, data: local.data }, SAVE_VERSION);
    writeBase(user.id, scenarioId, { local: local.updatedAt, cloud: stamp });
    return;
  }
  if (action === 'download' || action === 'conflict') {
    const cloud = await fetchCloudSave(scenarioId);
    if (!cloud) return;
    if (action === 'download') {
      await adoptCloud(user, scenarioId, cloud.data, cloud.updatedAt);
      useGame.getState().pushToast({ text: '已載入另一台裝置的最新進度', kind: 'success' });
      return;
    }
    const cloudState = deserialize(cloud.data);
    const localState = deserialize(local!.data);
    useCloud.setState({
      conflict: {
        scenarioId,
        local: saveSummary(localState, local!.updatedAt),
        cloud: saveSummary(cloudState, cloud.updatedAt),
        cloudData: cloud.data,
      },
    });
  }
}

/** 用雲端存檔取代本機存檔；正在玩同一個劇本時直接換成雲端進度 */
async function adoptCloud(
  user: CloudUser,
  scenarioId: string,
  data: SerializedSave,
  cloudAt: number,
) {
  const state = deserialize(data);
  const localAt = await writeSave(state);
  if (localAt !== null) writeBase(user.id, scenarioId, { local: localAt, cloud: cloudAt });
  const st = useGame.getState();
  if (st.screen === 'map' && st.game?.scenarioId === scenarioId) st.loadGame(state, true);
  void st.refreshSaves();
}

async function syncAll() {
  const user = useCloud.getState().user;
  if (!user) return;
  useCloud.setState({ status: 'syncing', message: null });
  try {
    await flushSave();
    const [cloud, local] = await Promise.all([listCloudSaves(), listSaves()]);
    // 雲端存檔來自較新的遊戲版本：不覆蓋，請玩家更新
    if (cloud.some((c) => c.saveVersion > SAVE_VERSION)) {
      useCloud.setState({
        status: 'error',
        message: '雲端存檔來自較新的遊戲版本，請重新整理頁面更新遊戲後再同步。',
      });
      return;
    }
    const ids = new Set([...cloud.map((c) => c.scenarioId), ...local.map((l) => l.scenarioId)]);
    const pending = useCloud.getState().conflict?.scenarioId;
    for (const id of ids) {
      if (id === pending) continue;
      const stamp = cloud.find((c) => c.scenarioId === id)?.updatedAt ?? null;
      await syncScenario(user, id, stamp);
    }
    useCloud.setState({ status: 'idle', lastSyncAt: Date.now() });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    useCloud.setState({
      status: 'error',
      message: offline ? '目前離線，恢復網路後會自動同步。' : (e as Error).message,
    });
  }
}

/** 立即同步；同步進行中再次要求時，結束後再跑一次 */
export function syncNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (running) {
    rerun = true;
    return running;
  }
  running = syncAll().finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      void syncNow();
    }
  });
  return running;
}

function scheduleSync(delay = AUTO_SYNC_MS) {
  if (!useCloud.getState().user) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** 衝突時玩家的選擇 */
export async function resolveConflict(keep: 'local' | 'cloud') {
  const { conflict, user } = useCloud.getState();
  if (!conflict || !user) return;
  useCloud.setState({ status: 'syncing' });
  try {
    if (keep === 'cloud') {
      await adoptCloud(user, conflict.scenarioId, conflict.cloudData, conflict.cloud.updatedAt);
    } else {
      await flushSave();
      const local = await loadSaveRecord(conflict.scenarioId);
      if (local) {
        const stamp = nextCloudStamp(Date.now(), conflict.cloud.updatedAt);
        const save = { scenarioId: conflict.scenarioId, updatedAt: stamp, data: local.data };
        await pushCloudSave(user.id, save, SAVE_VERSION);
        writeBase(user.id, conflict.scenarioId, { local: local.updatedAt, cloud: stamp });
      }
    }
    useCloud.setState({ conflict: null, status: 'idle', lastSyncAt: Date.now(), message: null });
  } catch (e) {
    useCloud.setState({ status: 'error', message: (e as Error).message });
  }
}

// ---------------------------------------------------------------- 登入

export async function signIn() {
  useCloud.setState({ status: 'loading', message: null });
  try {
    await signInWithGoogle();
    // 瀏覽器會轉到 Google，回來後由 initCloud 還原登入狀態
  } catch (e) {
    useCloud.setState({ status: 'signedOut', message: (e as Error).message });
  }
}

export async function signOut() {
  await syncNow();
  try {
    await cloudSignOut();
  } catch (e) {
    useCloud.setState({ message: (e as Error).message });
  }
  useCloud.setState({ user: null, status: 'signedOut', conflict: null, lastSyncAt: null });
}

let started = false;

/** App 啟動時呼叫一次 */
export function initCloud() {
  if (started || !cloudConfigured()) return;
  started = true;
  const urlError = authErrorInUrl();
  void watchAuth((user) => {
    const prev = useCloud.getState().user;
    useCloud.setState({
      user,
      status: user ? 'idle' : 'signedOut',
      ...(urlError && !user ? { message: `登入沒有完成：${urlError}` } : {}),
    });
    if (user && user.id !== prev?.id) {
      void syncNow();
      // 之前沒登入時寫的試玩回饋，登入後補送
      void import('./feedbackOutbox').then((m) => m.flushFeedback()).catch(() => {});
    }
  }).catch(() => {
    // 離線或載入失敗：照常用本機存檔
    useCloud.setState({ status: 'signedOut', message: '目前無法連線到雲端存檔服務。' });
  });

  onLocalSave(() => scheduleSync());
  if (isDebug()) Object.assign(window, { __aoeCloud: { useCloud, syncNow, useGame } });
  window.addEventListener('online', () => scheduleSync(1000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && useCloud.getState().user) void syncNow();
  });
}
