import { contentResult } from '../content';
import { resolveConflict, signIn, signOut, syncNow, useCloud } from '../cloudSync';
import type { SaveSummary } from '@/game/sync';

const time = (t: number) => new Date(t).toLocaleString('zh-TW');

/** 登入與雲端存檔狀態：主選單與船長面板共用 */
export function CloudAccount() {
  const { status, user, lastSyncAt, message } = useCloud();
  if (status === 'off') return null;

  return (
    <div className="cloud-account" aria-live="polite">
      {user ? (
        <>
          <div>
            ☁️ 已登入：<strong>{user.name ?? user.email}</strong>
            {user.name && user.email && <span className="meta">（{user.email}）</span>}
          </div>
          <div className="meta">
            {status === 'syncing'
              ? '同步中…'
              : lastSyncAt
                ? `上次同步：${time(lastSyncAt)}`
                : '進度會自動同步到雲端'}
          </div>
          <div className="row">
            <button type="button" disabled={status === 'syncing'} onClick={() => void syncNow()}>
              立即同步
            </button>
            <button type="button" onClick={() => void signOut()}>
              登出
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="google-btn"
            disabled={status === 'loading'}
            onClick={() => void signIn()}
          >
            {status === 'loading' ? '連線中…' : '用 Google 登入，換裝置也能接著玩'}
          </button>
          <p className="meta">
            登入是選擇性的，不登入也能玩，進度存在這台裝置。登入後只會保存遊戲進度與你的 Google
            帳號識別碼、信箱，用來在不同裝置同步，不會讀取其他資料。
          </p>
        </>
      )}
      {message && (
        <p className="warn" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

/** 本機與雲端都有新進度時，讓玩家選要保留哪一份 */
export function SyncConflictModal() {
  const conflict = useCloud((s) => s.conflict);
  const busy = useCloud((s) => s.status === 'syncing');
  if (!conflict) return null;
  const scenario = contentResult.content?.scenarios.find((s) => s.id === conflict.scenarioId);

  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="選擇要保留的進度">
        <h2>選擇要保留的進度</h2>
        <p>
          「{scenario?.name ?? conflict.scenarioId}」在這台裝置和雲端各有一份不同的進度。
          請選一份保留，另一份會被取代。
        </p>
        <div className="conflict-grid">
          <SummaryCard title="這台裝置" s={conflict.local} />
          <SummaryCard title="雲端（其他裝置）" s={conflict.cloud} />
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void resolveConflict('local')}
          >
            保留這台裝置的進度
          </button>
          <button type="button" disabled={busy} onClick={() => void resolveConflict('cloud')}>
            改用雲端進度
          </button>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ title, s }: { title: string; s: SaveSummary }) {
  return (
    <div className="conflict-card">
      <h3>{title}</h3>
      <ul>
        <li>存檔時間：{time(s.updatedAt)}</li>
        <li>
          航海第 {s.day} 天・船長等級 {s.level}
        </li>
        <li>
          完成任務 {s.questsDone}・造訪港口 {s.ports}
        </li>
        <li>
          圖鑑 {s.codex} 張・海圖 {s.explored} 萬平方公里
        </li>
      </ul>
    </div>
  );
}
