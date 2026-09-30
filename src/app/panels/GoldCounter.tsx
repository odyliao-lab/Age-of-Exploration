import { useEffect, useState } from 'react';
import { useGame } from '../store';

interface Pop {
  id: number;
  delta: number;
}

let popSeq = 0;

/** 金幣數字：金幣變多或變少時，旁邊飄出「+N」或「−N」 */
export function GoldCounter() {
  const gold = useGame((s) => s.game?.gold ?? 0);
  const [pops, setPops] = useState<Pop[]>([]);

  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        const a = prev.game?.gold;
        const b = s.game?.gold;
        // 讀檔或換存檔時不顯示
        if (
          a === undefined ||
          b === undefined ||
          a === b ||
          prev.game?.scenarioId !== s.game?.scenarioId
        )
          return;
        const pop = { id: ++popSeq, delta: b - a };
        setPops((ps) => [...ps.slice(-2), pop]);
        setTimeout(() => setPops((ps) => ps.filter((p) => p.id !== pop.id)), 1600);
      }),
    [],
  );

  return (
    <span className="gold-counter" title="金幣">
      💰 {gold}
      {pops.map((p) => (
        <span key={p.id} className={p.delta > 0 ? 'gold-pop gain' : 'gold-pop loss'}>
          {p.delta > 0 ? `+${p.delta}` : `−${-p.delta}`}
        </span>
      ))}
    </span>
  );
}
