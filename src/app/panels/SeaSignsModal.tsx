import { useState } from 'react';
import { compass8Name } from '@/game/state';
import { useGame } from '../store';

/**
 * 讀海上的徵兆（玻里尼西亞的航海術）：依海鳥、雲、湧浪判斷島在哪個方向。
 * 題目在打開時由 store 決定一次。
 */
export function SeaSignsModal() {
  const q = useGame((s) => s.seaSigns)!;
  const answer = useGame((s) => s.answerSeaSigns);
  const close = () => useGame.getState().openSeaSigns(false);
  const [result, setResult] = useState<{ correct: boolean; text: string; lesson: string } | null>(
    null,
  );
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="讀海上的徵兆">
        <h2>🌊 讀海上的徵兆</h2>
        <p>{q.prompt}</p>
        {result ? (
          <>
            <p className={result.correct ? 'result good' : 'result bad'}>{result.text}</p>
            <p className="lesson">
              <strong>地理小教室：</strong>
              {result.lesson}
            </p>
            <div className="row end">
              <button type="button" className="primary" autoFocus onClick={close}>
                繼續
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="choices">
              {q.choices.map((d) => (
                <button
                  type="button"
                  key={d}
                  className="choice"
                  onClick={() => setResult(answer(d))}
                >
                  {compass8Name(d)}方
                </button>
              ))}
            </div>
            <div className="row end">
              <button type="button" onClick={close}>
                先不要
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
