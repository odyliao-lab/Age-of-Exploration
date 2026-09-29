import { useRef, useState } from 'react';
import { ATTRIBUTE_INFO, ATTRIBUTE_KEYS, xpToNext } from '@/game/captain';
import { exportSaveJson, importSaveJson } from '@/game/save';
import { explorationPercent } from '@/game/state';
import { useGame } from '../store';

export function CaptainPanel() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const spend = useGame((s) => s.spend);
  const openPanel = useGame((s) => s.openPanel);
  const loadGame = useGame((s) => s.loadGame);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const c = game.captain;
  const need = xpToNext(c.level);
  const completed = Object.values(game.quests).filter((q) => q.status === 'completed').length;
  const quizzes = game.quizLog.length;
  const firstTry = game.quizLog.filter((q) => q.firstTry).length;

  const download = () => {
    const blob = new Blob([exportSaveJson(game)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `age-of-exploration-${game.scenarioId}-day${Math.floor(game.day) + 1}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async (file: File) => {
    try {
      const state = importSaveJson(await file.text());
      if (!world.scenarios.has(state.scenarioId)) throw new Error('存檔的劇本不存在');
      loadGame(state);
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal sheet" role="dialog" aria-modal="true" aria-label="船長">
        <header className="sheet-head">
          <h2>船長 · 等級 {c.level}</h2>
          <button type="button" className="close" aria-label="關閉" onClick={() => openPanel(null)}>
            ×
          </button>
        </header>
        <div className="xp-bar" aria-label={`經驗 ${c.xp} / ${need}`}>
          <div className="xp-fill" style={{ width: `${(c.xp / need) * 100}%` }} />
          <span>
            經驗 {c.xp} / {need}
          </span>
        </div>

        <h3>屬性 {c.points > 0 && <span className="badge">可分配 {c.points} 點</span>}</h3>
        <ul className="attrs">
          {ATTRIBUTE_KEYS.map((k) => (
            <li key={k}>
              <span className="attr-name">{ATTRIBUTE_INFO[k].name}</span>
              <span className="attr-value">{c.attrs[k]}</span>
              <span className="meta">{ATTRIBUTE_INFO[k].effect}</span>
              <button
                type="button"
                aria-label={`提升${ATTRIBUTE_INFO[k].name}`}
                disabled={c.points <= 0}
                onClick={() => spend(k)}
              >
                ＋
              </button>
            </li>
          ))}
        </ul>

        <h3>航海紀錄</h3>
        <ul className="records">
          <li>航海天數：{Math.floor(game.day) + 1} 天</li>
          <li>世界探索率：{explorationPercent(game)}%</li>
          <li>
            造訪港口：{game.visitedPorts.length} / {world.content.ports.length}
          </li>
          <li>
            圖鑑：{game.discovered.length} / {world.content.codex.length}
          </li>
          <li>完成任務：{completed}</li>
          <li>名聲：{game.reputation}</li>
          <li>
            問答：{quizzes} 題，一次答對 {firstTry} 題
          </li>
        </ul>

        <h3>存檔</h3>
        <p className="meta">
          進度會自動存在這台裝置的瀏覽器。要換裝置或留存學習紀錄，可以匯出存檔檔案。
        </p>
        <div className="row">
          <button type="button" onClick={download}>
            匯出存檔
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}>
            匯入存檔
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </div>
        {importError && (
          <p className="warn" role="alert">
            {importError}
          </p>
        )}
      </section>
    </div>
  );
}
