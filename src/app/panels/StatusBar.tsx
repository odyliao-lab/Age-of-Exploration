import { xpToNext } from '@/game/captain';
import { useGame } from '../store';

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

  return (
    <header className="map-toolbar">
      <button type="button" onClick={backToMenu} aria-label="回到劇本選單">
        ←
      </button>
      <strong className="map-title">{scenario.name}</strong>
      <div className="stats-inline" aria-label="船長狀態">
        <span title="航海天數">第 {Math.floor(game.day) + 1} 天</span>
        <span title="金幣">💰 {game.gold}</span>
        <span title={`經驗 ${c.xp}/${xpToNext(c.level)}`}>Lv {c.level}</span>
      </div>
      <div className="map-actions">
        <button type="button" onClick={() => openPanel('codex')}>
          圖鑑
        </button>
        <button
          type="button"
          onClick={() => openPanel('captain')}
          className={c.points ? 'has-badge' : ''}
        >
          船長{c.points ? <span className="badge-dot">{c.points}</span> : null}
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
