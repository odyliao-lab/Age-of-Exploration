import { useRef, useState } from 'react';
import { ACHIEVEMENTS } from '@/game/achievements';
import { ATTRIBUTE_INFO, ATTRIBUTE_KEYS, xpToNext } from '@/game/captain';
import { SKILL_PATHS, SKILLS, type SkillPath } from '@/game/progression';
import { exportSaveJson, importSaveJson } from '@/game/save';
import { explorationPercent, skillStatus } from '@/game/state';
import { useGame } from '../store';

type Tab = 'captain' | 'skills' | 'achievements';

export function CaptainPanel() {
  const game = useGame((s) => s.game)!;
  const openPanel = useGame((s) => s.openPanel);
  const [tab, setTab] = useState<Tab>(game.skillPoints > 0 ? 'skills' : 'captain');
  const c = game.captain;

  return (
    <div className="modal-backdrop">
      <section className="modal sheet" role="dialog" aria-modal="true" aria-label="船長">
        <header className="sheet-head">
          <h2>船長 · 等級 {c.level}</h2>
          <button type="button" className="close" aria-label="關閉" onClick={() => openPanel(null)}>
            ×
          </button>
        </header>
        <div className="tabs" role="tablist">
          <TabButton id="captain" tab={tab} setTab={setTab} badge={c.points}>
            屬性與紀錄
          </TabButton>
          <TabButton id="skills" tab={tab} setTab={setTab} badge={game.skillPoints}>
            技能
          </TabButton>
          <TabButton id="achievements" tab={tab} setTab={setTab}>
            成就
          </TabButton>
        </div>
        {tab === 'captain' && <CaptainTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'achievements' && <AchievementsTab />}
      </section>
    </div>
  );
}

function TabButton(props: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  badge?: number;
  children: React.ReactNode;
}) {
  const active = props.id === props.tab;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? 'tab active' : 'tab'}
      onClick={() => props.setTab(props.id)}
    >
      {props.children}
      {props.badge ? <span className="badge-dot inline">{props.badge}</span> : null}
    </button>
  );
}

function CaptainTab() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const spend = useGame((s) => s.spend);
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
    <>
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
        <li>完成航行：{game.stats.voyages} 次</li>
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
        <li>度過風暴：{game.stats.stormsSurvived} 次</li>
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
    </>
  );
}

function SkillsTab() {
  const game = useGame((s) => s.game)!;
  const learn = useGame((s) => s.learn);
  return (
    <>
      <p className="meta">
        船長等級 3 起，每升兩級獲得 1 技能點。目前可用：<strong>{game.skillPoints}</strong> 點
      </p>
      <div className="skill-tree">
        {(Object.keys(SKILL_PATHS) as SkillPath[]).map((path) => (
          <div key={path} className="skill-path">
            <h3>{SKILL_PATHS[path]}</h3>
            {SKILLS.filter((s) => s.path === path).map((s) => {
              const status = skillStatus(game, s.id);
              return (
                <div key={s.id} className={`skill ${status}`}>
                  <strong>{s.name}</strong>
                  <span className="meta">{s.effect}</span>
                  {status === 'learned' ? (
                    <span className="learned-tag">已學會</span>
                  ) : (
                    <button
                      type="button"
                      disabled={status !== 'available' || game.skillPoints <= 0}
                      onClick={() => learn(s.id)}
                    >
                      {status === 'locked'
                        ? `等級 ${s.minLevel}${s.requires ? '・需前一技能' : ''}`
                        : '學習'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

function AchievementsTab() {
  const game = useGame((s) => s.game)!;
  const chooseTitle = useGame((s) => s.chooseTitle);
  const titles = ACHIEVEMENTS.filter((a) => a.title && game.achievements.includes(a.id));
  return (
    <>
      <label className="title-select">
        顯示稱號：
        <select value={game.title ?? ''} onChange={(e) => chooseTitle(e.target.value || null)}>
          <option value="">（不顯示）</option>
          {titles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </label>
      <p className="meta">
        已解鎖 {game.achievements.length} / {ACHIEVEMENTS.length}
      </p>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const done = game.achievements.includes(a.id);
          const secret = a.hidden && !done;
          return (
            <div key={a.id} className={done ? 'achievement done' : 'achievement'}>
              <span className="trophy" aria-hidden="true">
                {done ? '🏆' : '🔒'}
              </span>
              <div>
                <strong>{secret ? '隱藏成就' : a.name}</strong>
                <div className="meta">{secret ? '繼續探索就會發現…' : a.description}</div>
                {a.title && !secret && <div className="meta">稱號：{a.title}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
