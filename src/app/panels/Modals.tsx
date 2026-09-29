import { useState, type ReactNode } from 'react';
import type { QuestStep } from '@/data/schema';
import { ATTRIBUTE_INFO } from '@/game/captain';
import { useGame, type Modal } from '../store';

function ModalFrame({
  title,
  children,
  label,
}: {
  title: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={label ?? title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function DialogueModal({
  questId,
  step,
}: {
  questId: string;
  step: Extract<QuestStep, { type: 'dialogue' }>;
}) {
  const close = useGame((s) => s.closeDialogue);
  const [line, setLine] = useState(0);
  const last = line >= step.lines.length - 1;
  return (
    <ModalFrame title={step.speaker} label={`與${step.speaker}的對話`}>
      <p className="dialogue-line">{step.lines[line]}</p>
      <div className="row end">
        <span className="meta">
          {line + 1}/{step.lines.length}
        </span>
        <button
          type="button"
          className="primary"
          autoFocus
          onClick={() => (last ? close(questId) : setLine(line + 1))}
        >
          {last ? '好的' : '繼續'}
        </button>
      </div>
    </ModalFrame>
  );
}

export function QuizModal({
  questId,
  step,
}: {
  questId: string;
  step: Extract<QuestStep, { type: 'quiz' }>;
}) {
  const answer = useGame((s) => s.answer);
  const [wrong, setWrong] = useState<number[]>([]);
  return (
    <ModalFrame title="航海學院的提問" label="問答">
      <p className="question">{step.question}</p>
      <div className="choices">
        {step.choices.map((c, i) => (
          <button
            type="button"
            key={i}
            className={wrong.includes(i) ? 'choice wrong' : 'choice'}
            disabled={wrong.includes(i)}
            onClick={() => {
              if (!answer(questId, i)) setWrong([...wrong, i]);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {wrong.length > 0 && (
        <p className="warn" role="alert">
          不對喔，再想想看。
          {step.explanation && wrong.length >= 2 ? `提示：${step.explanation}` : ''}
        </p>
      )}
    </ModalFrame>
  );
}

export function RewardModal({ modal }: { modal: Modal }) {
  const world = useGame((s) => s.world)!;
  const dismiss = useGame((s) => s.dismissModal);
  const openPanel = useGame((s) => s.openPanel);

  if (modal.type === 'levelUp') {
    return (
      <ModalFrame title={`升級！船長等級 ${modal.level}`}>
        <p>你獲得 1 點屬性點，可以在「船長」面板分配。</p>
        <ul className="attr-hints">
          {Object.values(ATTRIBUTE_INFO).map((a) => (
            <li key={a.name}>
              <strong>{a.name}</strong>：{a.effect}
            </li>
          ))}
        </ul>
        <div className="row end">
          <button type="button" onClick={dismiss}>
            稍後
          </button>
          <button
            type="button"
            className="primary"
            autoFocus
            onClick={() => {
              dismiss();
              openPanel('captain');
            }}
          >
            分配屬性點
          </button>
        </div>
      </ModalFrame>
    );
  }

  const quest = world.quests.get(modal.questId);
  const r = modal.reward;
  return (
    <ModalFrame title="任務完成！">
      <p>
        <strong>{quest?.title}</strong>
      </p>
      <ul className="reward-list">
        <li>經驗 +{r.xp}</li>
        <li>金幣 +{r.gold}</li>
        {r.reputation > 0 && <li>名聲 +{r.reputation}</li>}
        {r.unlockPorts.map((id) => (
          <li key={id}>新港口：{world.ports.get(id)?.name}</li>
        ))}
        {r.codex.map((id) => (
          <li key={id}>新知識卡：{world.codex.get(id)?.name}</li>
        ))}
      </ul>
      {quest && (
        <>
          <h3>這次學到的</h3>
          <ul className="objectives">
            {quest.objectives.map((o, i) => (
              <li key={i}>{o.text}</li>
            ))}
          </ul>
        </>
      )}
      <div className="row end">
        <button type="button" className="primary" autoFocus onClick={dismiss}>
          太好了
        </button>
      </div>
    </ModalFrame>
  );
}
