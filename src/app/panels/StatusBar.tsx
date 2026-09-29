import { xpToNext } from '@/game/captain';
import { SEASON_OF_MONTH } from '@/game/calendar';
import { gameDate } from '@/game/state';
import { dailyComplete, dueReviews } from '@/game/learning';
import { ACHIEVEMENT_MAP } from '@/game/achievements';
import { useGame } from '../store';
import { useNow } from '../useNow';

export function StatusBar(props: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFindShip: () => void;
}) {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const backToMenu = useGame((s) => s.backToMenu);
  const openPanel = useGame((s) => s.openPanel);
  const scenario = world.scenarios.get(game.scenarioId)!;
  const c = game.captain;
  const now = useNow();
  const d = gameDate(game);
  const logBadge =
    dueReviews(game.reviews, now).length +
    (game.daily && !game.daily.claimed && dailyComplete(game.daily) ? 1 : 0);

  return (
    <header className="map-toolbar">
      <button type="button" onClick={backToMenu} aria-label="回到劇本選單">
        ←
      </button>
      <strong className="map-title">{scenario.name}</strong>
      <div className="stats-inline" aria-label="船長狀態">
        <span title={`航海第 ${Math.floor(game.day) + 1} 天`}>
          {d.year}/{d.month}/{d.day}（{SEASON_OF_MONTH[d.month]}）
        </span>
        <span title="金幣">💰 {game.gold}</span>
        <span title={`經驗 ${c.xp}/${xpToNext(c.level)}`}>
          Lv {c.level}
          {game.title && (
            <span className="title-tag">{ACHIEVEMENT_MAP.get(game.title)?.title}</span>
          )}
        </span>
      </div>
      <div className="map-actions">
        <button
          type="button"
          onClick={() => openPanel('logbook')}
          className={logBadge ? 'has-badge' : ''}
        >
          日誌{logBadge ? <span className="badge-dot">{logBadge}</span> : null}
        </button>
        <button type="button" onClick={() => openPanel('codex')}>
          圖鑑
        </button>
        <button type="button" onClick={() => openPanel('fleet')}>
          船隊
        </button>
        <button
          type="button"
          onClick={() => openPanel('captain')}
          className={c.points ? 'has-badge' : ''}
        >
          船長
          {c.points + game.skillPoints ? (
            <span className="badge-dot">{c.points + game.skillPoints}</span>
          ) : null}
        </button>
        <button type="button" className="zoom" aria-label="縮小" onClick={props.onZoomOut}>
          −
        </button>
        <button type="button" className="zoom" aria-label="放大" onClick={props.onZoomIn}>
          ＋
        </button>
        <button type="button" onClick={props.onFindShip}>
          找船
        </button>
      </div>
    </header>
  );
}
