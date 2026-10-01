import { useState, type ReactNode } from 'react';
import { useMoney } from '../money';
import type { QuestStep } from '@/data/schema';
import { ATTRIBUTE_INFO } from '@/game/captain';
import { STORM_CHOICES, shipwreckLoss, type StormChoice, type StormEncounter } from '@/game/ship';
import type { VoyageEvent } from '@/game/events';
import { regionAt } from '@/game/state';
import { formatLonLat } from '@/map/projection';
import { ConditionBars } from './Condition';
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
  const canEliminate = useGame((s) => s.game!.skills.includes('deduction'));
  const [wrong, setWrong] = useState<number[]>([]);
  const [eliminated, setEliminated] = useState<number | null>(null);
  const eliminate = () => {
    const candidates = step.choices
      .map((_, i) => i)
      .filter((i) => i !== step.answer && !wrong.includes(i));
    if (candidates.length) setEliminated(candidates[0]);
  };
  return (
    <ModalFrame title="航海學院的提問" label="問答">
      <p className="question">{step.question}</p>
      <div className="choices">
        {step.choices.map((c, i) => (
          <button
            type="button"
            key={i}
            className={wrong.includes(i) || eliminated === i ? 'choice wrong' : 'choice'}
            disabled={wrong.includes(i) || eliminated === i}
            onClick={() => {
              if (!answer(questId, i)) setWrong([...wrong, i]);
            }}
          >
            {c}
          </button>
        ))}
      </div>
      {canEliminate && eliminated === null && (
        <div className="row">
          <button type="button" onClick={eliminate}>
            推理：排除一個錯誤選項
          </button>
        </div>
      )}
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
  const money = useMoney();
  const world = useGame((s) => s.world)!;
  const dismiss = useGame((s) => s.dismissModal);
  const openPanel = useGame((s) => s.openPanel);

  if (modal.type === 'shipwreck') {
    return <ShipwreckModal modal={modal} />;
  }

  if (modal.type === 'info') {
    const r = world.rename;
    return (
      <ModalFrame title={r(modal.title)}>
        <p>{r(modal.text)}</p>
        {modal.stats && modal.stats.length > 0 && (
          <ul className="reward-list">
            {modal.stats.map((t) => (
              <li key={t}>{r(t)}</li>
            ))}
          </ul>
        )}
        {modal.lesson && (
          <p className="lesson">
            <strong>地理小教室：</strong>
            {r(modal.lesson)}
          </p>
        )}
        {modal.note && <p className="meta">{r(modal.note)}</p>}
        <div className="row end">
          <button type="button" className="primary" autoFocus onClick={dismiss}>
            繼續
          </button>
        </div>
      </ModalFrame>
    );
  }

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
        <li>
          {money} +{r.gold}
        </li>
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

export function StormModal({ encounter }: { encounter: StormEncounter }) {
  const game = useGame((s) => s.game)!;
  const weather = useGame((s) => s.weatherStorm);
  const r = encounter.risk;
  return (
    <ModalFrame title={`遭遇${r.name}！`} label="風暴">
      <p>
        {encounter.month} 月，船隊在 {formatLonLat(encounter.position, 0)} 附近遇上{r.name}
        ，狂風巨浪撲向甲板。船長，要怎麼做？
      </p>
      <p className="lesson">
        <strong>地理小教室：</strong>
        {r.lesson}
      </p>
      <ConditionBars game={game} compact />
      <div className="choices">
        {(Object.keys(STORM_CHOICES) as StormChoice[]).map((c) => (
          <button type="button" key={c} className="choice" onClick={() => weather(c)}>
            <strong>{STORM_CHOICES[c].label}</strong>
            <span className="meta"> — {STORM_CHOICES[c].hint}</span>
          </button>
        ))}
      </div>
    </ModalFrame>
  );
}

function ShipwreckModal({ modal }: { modal: Extract<Modal, { type: 'shipwreck' }> }) {
  const money = useMoney();
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const dismiss = useGame((s) => s.dismissModal);
  const port = world.ports.get(modal.portId);
  const scenario = world.scenarios.get(game.scenarioId)!;
  const region = regionAt(world, game.ship.position);
  const tier = region ? (scenario.region_tiers[region] ?? 3) : 3;
  return (
    <ModalFrame title="船難！" label="船難事後檢討">
      <p>
        {modal.month} 月，船隊遭遇{modal.cause.name}
        ，船體不堪負荷而沉沒。所幸船員都被附近的漁船救起， 你們回到了<strong>{port?.name}</strong>。
      </p>
      <ul className="reward-list">
        <li>
          損失{money} {modal.lostGold}（約 {Math.round(shipwreckLoss(tier) * 100)}%）
        </li>
        <li>船員、圖鑑、任務進度與經驗都保留下來了</li>
      </ul>
      <h3>事後檢討</h3>
      <p className="lesson">
        <strong>為什麼會遇到{modal.cause.name}？</strong>
        {modal.cause.lesson}
      </p>
      <ul className="objectives">
        <li>海圖上看到旋轉的雲團就繞開，並記住{modal.cause.name}的好發季節與海域。</li>
        <li>遇到風暴時，「下錨等待」最安全，只是會多花幾天和補給。</li>
        <li>出航前在船塢把船修好，船體越完整越能撐過風浪。</li>
      </ul>
      <div className="row end">
        <button type="button" className="primary" autoFocus onClick={dismiss}>
          重新振作
        </button>
      </div>
    </ModalFrame>
  );
}

export function EventModal({ event }: { event: VoyageEvent }) {
  const respond = useGame((s) => s.respondEvent);
  const r = useGame((s) => s.world?.rename ?? ((t: string) => t));
  // 海盜的「知識挑戰」選項會切換到問答畫面
  const [asking, setAsking] = useState(!event.choices && !!event.question);
  const q = event.question;
  return (
    <ModalFrame title={r(event.title)} label={event.title}>
      <p>{r(event.text)}</p>
      {asking && q ? (
        <>
          <p className="question">{r(q.prompt)}</p>
          <div className="choices">
            {q.choices.map((c, i) => (
              <button
                type="button"
                key={i}
                className="choice"
                onClick={() => respond({ answer: i })}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {event.lesson && event.id !== 'pirates' && (
            <p className="lesson">
              <strong>地理小教室：</strong>
              {r(event.lesson)}
            </p>
          )}
          <div className="choices">
            {event.choices ? (
              event.choices
                .filter((c) => c.id !== 'quiz' || q)
                .map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className="choice"
                    onClick={() =>
                      c.id === 'quiz' ? setAsking(true) : respond({ choiceId: c.id })
                    }
                  >
                    <strong>{r(c.label)}</strong>
                    <span className="meta"> — {r(c.hint)}</span>
                  </button>
                ))
            ) : (
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => respond({ choiceId: 'take' })}
              >
                撈起來看看
              </button>
            )}
          </div>
        </>
      )}
    </ModalFrame>
  );
}
