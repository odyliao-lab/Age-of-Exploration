import { activeNavigateTargets, navigateHint } from '@/game/state';
import { useGame } from '../store';

export function QuestTracker() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;

  const active = Object.entries(game.quests).filter(([, p]) => p.status === 'active');
  if (active.length === 0) return null;
  const targets = activeNavigateTargets(world, game);

  return (
    <section className="quest-tracker" aria-label="進行中的任務">
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
          text = `發現「${world.codex.get(step.target)?.name}」：航經附近時瞭望員會回報`;
        } else if (step.type === 'dialogue') text = `與${step.speaker}交談`;
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
