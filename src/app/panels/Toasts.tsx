import { useEffect } from 'react';
import { useGame, type Toast } from '../store';

/** 顯示時間依字數調整：大約每秒讀 8 個字，至少 4.5 秒、最多 12 秒 */
const toastMs = (text: string) => Math.min(12000, Math.max(4500, 1500 + text.length * 120));

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGame((s) => s.dismissToast);
  const openPanel = useGame((s) => s.openPanel);
  const rename = useGame((s) => s.world?.rename ?? ((t: string) => t));
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), toastMs(toast.text));
    return () => clearTimeout(id);
  }, [toast.id, toast.text, dismiss]);
  return (
    <div className={`toast ${toast.kind}`}>
      <span>{rename(toast.text)}</span>
      {toast.codexId && (
        <button type="button" className="link" onClick={() => openPanel('codex', toast.codexId)}>
          查看
        </button>
      )}
    </div>
  );
}
