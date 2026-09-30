import { LOW_MORALE, LOW_SUPPLY_DAYS } from '@/game/ship';
import { myShip, type GameState } from '@/game/state';

/** 船況一覽：淡水、糧食、士氣、船體 */
export function ConditionBars({ game, compact = false }: { game: GameState; compact?: boolean }) {
  const cap = myShip(game).supplyDays;
  const c = game.condition;
  const items = [
    {
      label: '淡水',
      value: c.supplies.water,
      max: cap,
      unit: '天',
      low: c.supplies.water <= LOW_SUPPLY_DAYS,
    },
    {
      label: '糧食',
      value: c.supplies.food,
      max: cap,
      unit: '天',
      low: c.supplies.food <= LOW_SUPPLY_DAYS,
    },
    { label: '士氣', value: c.morale, max: 100, unit: '', low: c.morale < LOW_MORALE },
    { label: '船體', value: c.hull, max: 100, unit: '', low: c.hull < 40 },
  ];
  return (
    <div className={compact ? 'condition compact' : 'condition'}>
      {items.map((it) => (
        <div
          key={it.label}
          className={it.low ? 'cond low' : 'cond'}
          title={`${it.label} ${Math.floor(it.value)}/${it.max}`}
        >
          <span className="cond-label">{it.label}</span>
          <span className="cond-bar">
            <span style={{ width: `${Math.max(0, Math.min(100, (it.value / it.max) * 100))}%` }} />
          </span>
          <span className="cond-value">
            {Math.floor(it.value)}
            {it.unit}
          </span>
        </div>
      ))}
    </div>
  );
}
