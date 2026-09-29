import { environmentAt } from '@/game/state';
import { useGame } from '../store';

/** 船隻位置的風向與洋流（企畫書 5.2：學習大氣環流與洋流） */
export function WindCompass() {
  const game = useGame((s) => s.game)!;
  const env = environmentAt(game, game.ship.position, game.ship.heading);
  const w = env.wind;
  return (
    <div
      className="wind-compass"
      aria-label={`風：${w.name}${env.current ? `，洋流：${env.current.name}` : ''}`}
    >
      <svg viewBox="-24 -24 48 48" width="48" height="48" aria-hidden="true">
        <circle r="21" className="rose" />
        <text y="-13" className="n">
          北
        </text>
        {w.strength >= 0.2 && (
          <g transform={`rotate(${w.toward})`}>
            <line y1="12" y2="-10" className="arrow" />
            <polygon points="0,-15 -5,-7 5,-7" className="arrow-head" />
          </g>
        )}
        {w.strength < 0.2 && <circle r="4" className="calm" />}
      </svg>
      <div className="wind-text">
        <strong>{w.name}</strong>
        {w.strength >= 0.2 && <span>從{w.from}吹來</span>}
        {env.current && (
          <span className={env.current.warm === null ? '' : env.current.warm ? 'warm' : 'cold'}>
            {env.current.name}（
            {env.current.warm === null ? '季風洋流' : env.current.warm ? '暖流' : '寒流'}）
          </span>
        )}
      </div>
    </div>
  );
}
