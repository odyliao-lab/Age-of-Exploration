import { environmentAt, speedKmPerDay } from '@/game/state';
import { useGame } from '../store';
import { ConditionBars } from './Condition';

export function SailBar() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const voyage = game.voyage!;
  const paused = useGame((s) => s.paused);
  const speed = useGame((s) => s.speed);
  const togglePause = useGame((s) => s.togglePause);
  const setSpeed = useGame((s) => s.setSpeed);
  const anchor = useGame((s) => s.anchor);

  const pct = Math.round((voyage.traveledKm / voyage.totalKm) * 100);
  const dest = voyage.destinationPortId ? world.ports.get(voyage.destinationPortId) : null;
  const env = environmentAt(game, game.ship.position, game.ship.heading);
  const kmPerDay = Math.round(speedKmPerDay(game) * env.factors.total);

  return (
    <section className="bottom-panel sailbar" aria-label="航行控制">
      <div className="progress" aria-label={`航程 ${pct}%`}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="env-line">
        <span className={`tag ${env.factors.windLabel}`}>
          {env.wind.name} · {env.factors.windLabel}
        </span>
        {env.current && (
          <span className={`tag ${env.factors.currentLabel ?? ''}`}>
            {env.current.name} · {env.factors.currentLabel}
          </span>
        )}
        <span className="meta">每天約 {kmPerDay} 公里</span>
      </div>
      <ConditionBars game={game} compact />
      <div className="row">
        <span className="meta">
          {dest ? `前往${dest.name}` : '航行中'} · {Math.round(voyage.traveledKm)} /{' '}
          {Math.round(voyage.totalKm)} 公里
        </span>
        <span className="spacer" />
        <button type="button" onClick={togglePause}>
          {paused ? '▶ 繼續' : '⏸ 暫停'}
        </button>
        {([1, 2, 4] as const).map((s) => (
          <button
            type="button"
            key={s}
            className={speed === s ? 'active' : ''}
            aria-pressed={speed === s}
            onClick={() => setSpeed(s)}
          >
            ×{s}
          </button>
        ))}
        <button type="button" onClick={anchor}>
          下錨
        </button>
      </div>
    </section>
  );
}
