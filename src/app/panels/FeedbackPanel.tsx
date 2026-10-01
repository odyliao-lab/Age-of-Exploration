import { useMemo, useState } from 'react';
import {
  FEEDBACK_MAX_CHARS,
  FEEDBACK_TAGS,
  feedbackContext,
  feedbackReady,
  feedbackText,
  type FeedbackEntry,
} from '@/game/feedback';
import { cloudConfigured } from '../cloud';
import { useCloud } from '../cloudSync';
import { loadFeedback, submitFeedback, type SendResult } from '../feedbackOutbox';
import { useGame } from '../store';

function deviceInfo() {
  return {
    userAgent: navigator.userAgent.slice(0, 200),
    width: window.innerWidth,
    height: window.innerHeight,
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };
}

const RESULT_TEXT: Record<SendResult, string> = {
  sent: '收到了，謝謝你！開發者會看到這則回饋。',
  saved: '已經存在這台裝置上。按「複製」貼到訊息裡傳給邀請你試玩的人，就能讓開發者看到。',
  failed: '暫時送不出去，已經先存在這台裝置上，下次登入時會再試。也可以按「複製」直接傳給開發者。',
};

/** 試玩回饋：點標籤或寫幾句話，自動附上目前的遊戲狀況 */
export function FeedbackPanel() {
  const world = useGame((s) => s.world)!;
  const game = useGame((s) => s.game)!;
  const openPanel = useGame((s) => s.openPanel);
  const signedIn = useCloud((s) => !!s.user);
  const [tags, setTags] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ entry: FeedbackEntry; status: SendResult } | null>(null);
  const [copied, setCopied] = useState(false);
  const context = useMemo(
    () =>
      feedbackContext(world, game, {
        build: (import.meta.env.VITE_BUILD_TIME as string | undefined) ?? 'dev',
        device: deviceInfo(),
      }),
    // 打開面板當下的狀況（航行中也不會一直變）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [initialHistory] = useState(loadFeedback);
  // 送出後（result 改變）重新讀取紀錄
  const history = result ? loadFeedback() : initialHistory;

  const toggle = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const send = async () => {
    if (!feedbackReady(tags, message) || sending) return;
    setSending(true);
    const entry: FeedbackEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      tags,
      message: message.trim(),
      context,
      sent: false,
    };
    const status = await submitFeedback(entry);
    setResult({ entry, status });
    setSending(false);
  };

  const copy = async (entry: FeedbackEntry) => {
    try {
      await navigator.clipboard.writeText(feedbackText(entry));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section
        className="modal sheet feedback"
        role="dialog"
        aria-modal="true"
        aria-label="試玩回饋"
      >
        <header className="sheet-head">
          <h2>💬 試玩回饋</h2>
          <button type="button" className="close" aria-label="關閉" onClick={() => openPanel(null)}>
            ×
          </button>
        </header>
        {result ? (
          <div className="feedback-done">
            <p>{RESULT_TEXT[result.status]}</p>
            <pre className="feedback-preview">{feedbackText(result.entry)}</pre>
            <div className="feedback-actions">
              <button type="button" onClick={() => copy(result.entry)}>
                {copied ? '已複製 ✓' : '📋 複製'}
              </button>
              <button type="button" className="primary" onClick={() => openPanel(null)}>
                回到遊戲
              </button>
            </div>
          </div>
        ) : (
          <div className="feedback-form">
            <p className="hint">
              好玩、卡住、看不懂，都可以告訴我們！點下面的標籤，或寫幾句話。 會一起附上：
              {context.scenarioName}・{context.place}
              {context.quests[0] ? `・任務「${context.quests[0].title}」` : ''}。
            </p>
            <div className="feedback-tags" role="group" aria-label="快速標籤">
              {FEEDBACK_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tags.includes(t) ? 'chip on' : 'chip'}
                  aria-pressed={tags.includes(t)}
                  onClick={() => toggle(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="feedback-message">
              <span>想說的話（可以不寫）</span>
              <textarea
                value={message}
                maxLength={FEEDBACK_MAX_CHARS}
                rows={5}
                placeholder="例如：找不到海峽的入口，繞了好久……"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <p className="hint small">
              {cloudConfigured() && signedIn
                ? '你已登入，回饋會直接送給開發者。'
                : '沒有登入時，回饋會先存在這台裝置上，送出後可以複製傳給開發者。'}
            </p>
            <div className="feedback-actions">
              <button type="button" onClick={() => openPanel(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={!feedbackReady(tags, message) || sending}
                onClick={send}
              >
                {sending ? '送出中…' : '送出'}
              </button>
            </div>
            {history.length > 0 && (
              <details className="feedback-history">
                <summary>我之前寫的回饋（{history.length}）</summary>
                <ul>
                  {history.map((e) => (
                    <li key={e.id}>
                      <span>
                        {new Date(e.createdAt).toLocaleDateString('zh-TW')}{' '}
                        {[...e.tags, e.message].filter(Boolean).join('・').slice(0, 40)}
                      </span>
                      <span className="small">{e.sent ? '已送出' : '存在這台裝置'}</span>
                      <button type="button" onClick={() => copy(e)}>
                        複製
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
