import type { QuestStep } from '@/data/schema';
import { useGame } from '../store';

/** 座標定位挑戰的提示列：玩家直接在海圖上點選 */
export function LocateBanner({ step }: { step: Extract<QuestStep, { type: 'locate' }> }) {
  const feedback = useGame((s) => s.locateFeedback);
  return (
    <section className="locate-banner" role="status" aria-live="polite">
      <strong>導航挑戰</strong>
      <p>{step.prompt}</p>
      <p className="meta">直接在海圖上點選位置。移動游標或拖曳地圖時，下方會顯示經緯度。</p>
      {feedback && <p className="warn">{feedback}</p>}
    </section>
  );
}
