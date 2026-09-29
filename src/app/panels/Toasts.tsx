import { useEffect } from 'react';
import { useGame, type Toast } from '../store';

const TOAST_MS = 4500;

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
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast.id, dismiss]);
  return (
    <div className={`toast ${toast.kind}`}>
      <span>{toast.text}</span>
      {toast.codexId && (
        <button type="button" className="link" onClick={() => openPanel('codex', toast.codexId)}>
          查看
        </button>
      )}
    </div>
  );
}
