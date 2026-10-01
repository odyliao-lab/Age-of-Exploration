/**
 * Google 登入與雲端存檔（企畫書 Q21），使用 Supabase。
 *
 * - 只有建置時設定了 VITE_SUPABASE_URL／VITE_SUPABASE_ANON_KEY 才啟用；沒設定就照常只用本機存檔。
 * - supabase-js 動態載入，不拖慢主選單，也不影響離線遊玩。
 * - 資料表 saves 以列層級權限（RLS）限定每位玩家只能讀寫自己的存檔
 *   （supabase/migrations/0001_saves.sql）。這裡仍明確帶上 user_id，讓錯誤更早暴露。
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { SerializedSave } from '@/game/save';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface CloudUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface CloudSave {
  scenarioId: string;
  updatedAt: number;
  data: SerializedSave;
}

export function cloudConfigured(): boolean {
  return !!URL && !!KEY;
}

let clientPromise: Promise<SupabaseClient> | null = null;

function client(): Promise<SupabaseClient> {
  if (!cloudConfigured()) return Promise.reject(new Error('雲端存檔未設定'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL!, KEY!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
  return clientPromise;
}

function toUser(session: Session | null): CloudUser | null {
  const u = session?.user;
  if (!u) return null;
  const meta = u.user_metadata as { full_name?: string; name?: string } | undefined;
  return { id: u.id, email: u.email ?? null, name: meta?.full_name ?? meta?.name ?? null };
}

/** OAuth 回來時網址上的參數：交換完就從網址移除，避免重新整理或分享時外洩 */
function cleanAuthParams() {
  const url = new window.URL(window.location.href);
  const keys = ['code', 'error', 'error_code', 'error_description', 'state'];
  if (!keys.some((k) => url.searchParams.has(k))) return;
  for (const k of keys) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

/** 登入回呼網址中的錯誤（例如使用者取消、不在測試名單） */
export function authErrorInUrl(): string | null {
  const p = new window.URL(window.location.href).searchParams;
  return p.get('error_description') ?? p.get('error');
}

/**
 * 啟動時呼叫：還原登入狀態（含 OAuth 回來時交換授權碼），並監聽之後的變化。
 * 回傳取消監聽的函式。
 */
export async function watchAuth(onChange: (user: CloudUser | null) => void): Promise<() => void> {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  cleanAuthParams();
  onChange(toUser(data.session));
  const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    onChange(toUser(session));
  });
  return () => sub.subscription.unsubscribe();
}

export async function signInWithGoogle(): Promise<void> {
  const sb = await client();
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw new Error(`無法開始登入：${error.message}`, { cause: error });
}

export async function signOut(): Promise<void> {
  const sb = await client();
  // 只登出這台裝置
  const { error } = await sb.auth.signOut({ scope: 'local' });
  if (error) throw new Error(`登出失敗：${error.message}`, { cause: error });
}

interface SaveRow {
  scenario_id: string;
  updated_at: string;
  data: SerializedSave;
}

/** 讀取目前玩家某個劇本的雲端存檔（沒有則回傳 null） */
export async function fetchCloudSave(scenarioId: string): Promise<CloudSave | null> {
  const sb = await client();
  const { data, error } = await sb
    .from('saves')
    .select('scenario_id, updated_at, data')
    .eq('scenario_id', scenarioId)
    .maybeSingle<SaveRow>();
  if (error) throw new Error(`讀取雲端存檔失敗：${error.message}`, { cause: error });
  if (!data) return null;
  return { scenarioId: data.scenario_id, updatedAt: Date.parse(data.updated_at), data: data.data };
}

export interface CloudStamp {
  scenarioId: string;
  updatedAt: number;
  saveVersion: number;
}

/** 列出目前玩家所有雲端存檔的更新時間與版本（不下載存檔內容） */
export async function listCloudSaves(): Promise<CloudStamp[]> {
  const sb = await client();
  const { data, error } = await sb
    .from('saves')
    .select('scenario_id, updated_at, save_version')
    .returns<{ scenario_id: string; updated_at: string; save_version: number }[]>();
  if (error) throw new Error(`讀取雲端存檔失敗：${error.message}`, { cause: error });
  return (data ?? []).map((r) => ({
    scenarioId: r.scenario_id,
    updatedAt: Date.parse(r.updated_at),
    saveVersion: r.save_version,
  }));
}

export async function pushCloudSave(
  userId: string,
  save: CloudSave,
  saveVersion: number,
): Promise<void> {
  const sb = await client();
  const { error } = await sb.from('saves').upsert(
    {
      user_id: userId,
      scenario_id: save.scenarioId,
      save_version: saveVersion,
      data: save.data,
      updated_at: new Date(save.updatedAt).toISOString(),
    },
    { onConflict: 'user_id,scenario_id' },
  );
  if (error) throw new Error(`上傳雲端存檔失敗：${error.message}`, { cause: error });
}

/** 送出一則試玩回饋（資料表 feedback 只能新增，玩家讀不到；supabase/migrations/0002_feedback.sql） */
export async function pushFeedback(entry: {
  scenarioId: string;
  tags: string[];
  message: string;
  context: unknown;
}): Promise<void> {
  const sb = await client();
  const { error } = await sb.from('feedback').insert({
    scenario_id: entry.scenarioId,
    tags: entry.tags,
    message: entry.message,
    context: entry.context,
  });
  if (error) throw new Error(`送出回饋失敗：${error.message}`, { cause: error });
}
