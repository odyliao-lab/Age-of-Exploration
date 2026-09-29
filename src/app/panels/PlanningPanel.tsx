import { activeNavigateTargets } from '@/game/state';
import { planSummary, useGame } from '../store';

export function PlanningPanel() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const planning = useGame((s) => s.planning)!;
  const undo = useGame((s) => s.undoWaypoint);
  const cancel = useGame((s) => s.cancelPlanning);
  const setSail = useGame((s) => s.setSail);

  const suggest = useGame((s) => s.suggestRoute);
  const legs = planning.waypoints.length - 1;
  // 新手鷹架：提示等級 1 的任務目的地提供建議航線（企畫書 2.4）
  const easyTargets = activeNavigateTargets(world, game).filter(
    (t) => t.hintLevel <= 1 && t.portId !== game.dockedAt,
  );
  const sum = planSummary(world, game, planning);

  return (
    <section className="bottom-panel planning" aria-label="航線規劃">
      <h3>航線規劃</h3>
      {legs === 0 ? (
        <p>在海面上點選航點，最後點選目的港口。航線不能穿越陸地，沿著海岸多加幾個點吧。</p>
      ) : (
        <p>
          {legs} 段航線，全長約 <strong>{sum.nm}</strong> 海里（{sum.km} 公里），預計{' '}
          <strong>{sum.days}</strong> 天。
          {legs > 0 && sum.tailwindPct >= 50 && ` 約 ${sum.tailwindPct}% 航程順風。`}
          {legs > 0 && sum.headwindPct >= 50 && ` 約 ${sum.headwindPct}% 航程逆風，會比較慢。`}
          {sum.destination ? (
            <>
              {' '}
              目的地：<strong>{sum.destination}</strong>
            </>
          ) : (
            ' 終點不是港口，抵達後會在海上下錨。'
          )}
        </p>
      )}
      {legs > 0 && sum.storm && (
        <p className="warn">
          ⚠ 航線經過{sum.storm.name}好發海域。{sum.storm.lesson}
        </p>
      )}
      {legs > 0 && sum.supplyShort && (
        <p className="warn">⚠ 補給只剩 {sum.supplyDays} 天份，可能撐不到目的地。先在港口補給吧。</p>
      )}
      {planning.error && (
        <p className="warn" role="alert">
          {planning.error}
        </p>
      )}
      {easyTargets.length > 0 && (
        <div className="row">
          {easyTargets.map((t) => (
            <button type="button" key={t.portId} onClick={() => suggest(t.portId)}>
              🧭 建議航線：前往{world.ports.get(t.portId)?.name}
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <button type="button" onClick={undo} disabled={legs === 0}>
          復原一點
        </button>
        <button type="button" onClick={cancel}>
          取消
        </button>
        <button type="button" className="primary" onClick={setSail} disabled={legs === 0}>
          出航
        </button>
      </div>
    </section>
  );
}
