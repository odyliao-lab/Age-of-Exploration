import { useRef, useState } from 'react';
import { ACHIEVEMENTS } from '@/game/achievements';
import { ATTRIBUTE_INFO, ATTRIBUTE_KEYS, xpToNext } from '@/game/captain';
import { SKILL_PATHS, SKILLS, type SkillPath } from '@/game/progression';
import { exportSaveJson, importSaveJson } from '@/game/save';
import { chartedArea, skillStatus } from '@/game/state';
import { useGame } from '../store';
import { getSoundSettings, setSoundSettings } from '../sound';
import { getLargeText, setLargeText } from '../display';
import { reputationRank } from '@/game/reputation';
import {
  COLORS,
  EMBLEMS,
  HATS,
  HULL_PAINTS,
  PAINT_PRICE,
  SAIL_PAINTS,
  SKIN_TONES,
  optionUnlocked,
  paintOwned,
  type StyleOption,
  SHIP_NAME_MAX,
} from '@/game/cosmetics';
import { ACHIEVEMENT_MAP } from '@/game/achievements';
import { Avatar, Emblem, Flag } from './Avatar';
import { CloudAccount } from './CloudAccount';

type Tab = 'captain' | 'skills' | 'achievements' | 'looks';

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
          <TabButton id="looks" tab={tab} setTab={setTab}>
            外觀
          </TabButton>
        </div>
        {tab === 'captain' && <CaptainTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'achievements' && <AchievementsTab />}
        {tab === 'looks' && <LooksTab />}
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
        <li>海圖面積：約 {chartedArea(game)} 萬平方公里</li>
        <li>
          造訪港口：{game.visitedPorts.length} / {world.content.ports.length}
        </li>
        <li>
          圖鑑：{game.discovered.length} / {world.content.codex.length}
        </li>
        <li>完成任務：{completed}</li>
        <li>
          名聲：{game.reputation}（{reputationRank(game.reputation).title}
          {reputationRank(game.reputation).next !== null &&
            `，${reputationRank(game.reputation).next} 升下一級`}
          ）
          {reputationRank(game.reputation).index > 0 && (
            <div className="meta">
              商人給你的價錢好 {reputationRank(game.reputation).index * 2}%、委託酬勞多{' '}
              {reputationRank(game.reputation).index * 5}%
            </div>
          )}
        </li>
        <li>
          問答：{quizzes} 題，一次答對 {firstTry} 題
        </li>
        <li>度過風暴：{game.stats.stormsSurvived} 次</li>
      </ul>

      <SoundSettings />

      <h3>存檔</h3>
      <CloudAccount />
      <p className="meta">
        進度會自動存在這台裝置的瀏覽器。也可以匯出存檔檔案，手動搬到其他裝置或留存學習紀錄。
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

function SoundSettings() {
  const [s, setS] = useState(getSoundSettings());
  const toggle = (key: 'sfx' | 'music') => {
    setSoundSettings({ [key]: !s[key] });
    setS(getSoundSettings());
  };
  return (
    <>
      <h3>聲音</h3>
      <div className="row">
        <button
          type="button"
          aria-pressed={s.sfx}
          className={s.sfx ? 'active' : ''}
          onClick={() => toggle('sfx')}
        >
          {s.sfx ? '🔊 音效：開' : '🔇 音效：關'}
        </button>
        <button
          type="button"
          aria-pressed={s.music}
          className={s.music ? 'active' : ''}
          onClick={() => toggle('music')}
        >
          {s.music ? '🎵 音樂：開' : '🎵 音樂：關'}
        </button>
      </div>
      <DisplaySettings />
    </>
  );
}

function DisplaySettings() {
  const [large, setLarge] = useState(getLargeText());
  return (
    <>
      <h3>文字</h3>
      <div className="row">
        <button
          type="button"
          aria-pressed={large}
          className={large ? 'active' : ''}
          onClick={() => {
            setLargeText(!large);
            setLarge(!large);
          }}
        >
          {large ? '🔠 大字：開' : '🔠 大字：關'}
        </button>
      </div>
    </>
  );
}

function LooksTab() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const customize = useGame((s) => s.customize);
  const buyPaint = useGame((s) => s.buyPaint);
  const look = game.appearance;
  const ach = game.achievements;
  const atHub = !!game.dockedAt && world.ports.get(game.dockedAt)?.kind === 'hub';
  const lockText = (o: StyleOption) => (o.achievement ? achievementHint(o.achievement, ach) : '');

  const choices = (
    list: StyleOption[],
    current: string,
    onPick: (id: string) => void,
    render: (o: StyleOption) => React.ReactNode,
  ) => (
    <div className="swatches">
      {list.map((o) => {
        const open = optionUnlocked(o, ach);
        return (
          <button
            key={o.id}
            type="button"
            className={o.id === current ? 'swatch active' : 'swatch'}
            aria-pressed={o.id === current}
            disabled={!open}
            title={open ? o.name : lockText(o)}
            onClick={() => onPick(o.id)}
          >
            {render(o)}
            <span>{open ? o.name : `🔒 ${o.name}`}</span>
          </button>
        );
      })}
    </div>
  );
  const chip = (o: StyleOption) => <i className="chip" style={{ background: o.color }} />;

  const paints = (kind: 'hull' | 'sail', list: StyleOption[], current: string) => (
    <div className="swatches">
      {list.map((o) => {
        const owned = paintOwned(kind, o, look, ach);
        const buyable = !owned && !o.achievement;
        return (
          <button
            key={o.id}
            type="button"
            className={o.id === current ? 'swatch active' : 'swatch'}
            aria-pressed={o.id === current}
            disabled={owned ? false : !buyable || !atHub || game.gold < PAINT_PRICE}
            title={
              owned ? o.name : o.achievement ? lockText(o) : `在主港造船廠購買（${PAINT_PRICE} 金）`
            }
            onClick={() => (owned ? customize({ [kind]: o.id }) : buyPaint(kind, o.id))}
          >
            {chip(o)}
            <span>
              {owned ? o.name : o.achievement ? `🔒 ${o.name}` : `${o.name} ${PAINT_PRICE}金`}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="looks-preview">
        <Avatar look={look} size={96} />
        <Flag look={look} size={72} />
      </div>
      <h3>頭像</h3>
      <div className="swatches">
        {SKIN_TONES.map((c, i) => (
          <button
            key={c}
            type="button"
            className={i === look.skin ? 'swatch active' : 'swatch'}
            aria-pressed={i === look.skin}
            aria-label={`膚色 ${i + 1}`}
            onClick={() => customize({ skin: i })}
          >
            <i className="chip" style={{ background: c }} />
          </button>
        ))}
      </div>
      {choices(
        HATS,
        look.hat,
        (id) => customize({ hat: id }),
        () => null,
      )}
      <h3>衣服顏色</h3>
      {choices(COLORS, look.coat, (id) => customize({ coat: id }), chip)}
      <h3>船旗</h3>
      {choices(COLORS, look.flagColor, (id) => customize({ flagColor: id }), chip)}
      {choices(
        EMBLEMS,
        look.emblem,
        (id) => customize({ emblem: id }),
        (o) => (
          <svg width="30" height="21" viewBox="0 0 60 42" aria-hidden="true">
            <rect width="60" height="42" rx="3" fill="#5a4630" />
            <Emblem id={o.id} color="#f4ecd8" />
          </svg>
        ),
      )}
      <h3>船名</h3>
      <input
        className="ship-name-input"
        type="text"
        maxLength={SHIP_NAME_MAX}
        placeholder="替你的船取個名字"
        defaultValue={look.shipName}
        onBlur={(e) => customize({ shipName: e.currentTarget.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label="船名"
      />
      <h3>船身塗裝</h3>
      {paints('hull', HULL_PAINTS, look.hull)}
      <h3>船帆</h3>
      {paints('sail', SAIL_PAINTS, look.sail)}
      <p className="meta">
        {atHub
          ? `新塗裝每種 ${PAINT_PRICE} 金，買過就能隨時換回。`
          : '新塗裝要停靠主港（泉州、麻六甲）時才能在造船廠購買。'}
      </p>
    </>
  );
}

/** 解鎖提示；隱藏成就不透露名稱 */
function achievementHint(id: string, unlocked: string[]): string {
  const a = ACHIEVEMENT_MAP.get(id);
  if (!a || (a.hidden && !unlocked.includes(id))) return '完成隱藏成就解鎖';
  return `成就「${a.name}」解鎖`;
}
