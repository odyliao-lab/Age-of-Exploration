import {
  activeNavigateTargets,
  availableQuests,
  navigateHint,
  openRumors,
  pendingChallenges,
  rumorsAt,
} from '@/game/state';
import { useGame } from '../store';

export function QuestTracker() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;

  const active = Object.entries(game.quests).filter(([, p]) => p.status === 'active');
  const rumors = openRumors(world, game);
  // 開放世界的引導：沒有進行中的目標時，提示這個港口有什麼可做
  const port = game.dockedAt;
  const hints: string[] = [];
  if (port && !game.helm) {
    if (availableQuests(world, game, port).some((q) => q.kind !== 'academy'))
      hints.push('官府有新的差事');
    if (rumorsAt(world, game, port).length) hints.push('酒館裡有人在說新鮮事');
    if (pendingChallenges(world, game).length) hints.push('書院的學者出了考題');
  }
  if (active.length === 0 && rumors.length === 0 && hints.length === 0) return null;
  const targets = activeNavigateTargets(world, game);

  return (
    <section className="quest-tracker" aria-label="進行中的任務">
      {hints.length > 0 && active.length === 0 && (
        <div className="quest-item hint-item">
          <strong>下一步</strong>
          <div>{hints.join('；')}。</div>
        </div>
      )}
      {rumors.map((c) => (
        <details key={c.id} className="quest-item rumor-item">
          <summary>
            <strong>傳聞</strong>・{c.rumor!.from}說的地方
          </summary>
          <div>{c.rumor!.text}</div>
        </details>
      ))}
      {active.map(([id, p]) => {
        const quest = world.quests.get(id);
        if (!quest) return null;
        const step = quest.steps[p.step];
        let text: string;
        if (!step) text = '結算中…';
        else if (step.type === 'navigate') {
          const t = targets.find((x) => x.questId === id);
          text = t ? navigateHint(world, game, t) : '';
        } else if (step.type === 'discover') {
          const c = world.codex.get(step.target);
          text = c?.rumor
            ? '依航海日誌裡的線索找到傳聞中的地點，靠近後調查'
            : `發現「${c?.name}」：航經附近時瞭望員會回報`;
        } else if (step.type === 'dialogue') text = `與${step.speaker}交談`;
        else if (step.type === 'locate') text = '在海圖上點出指定的位置';
        else text = '回答問題';
        return (
          <div key={id} className="quest-item">
            <strong>{quest.title}</strong>
            <span className="step-count">
              {Math.min(p.step + 1, quest.steps.length)}/{quest.steps.length}
            </span>
            <div>{text}</div>
          </div>
        );
      })}
    </section>
  );
}
