import { useState } from 'react';
import { NOTE_MAX_CHARS } from '@/game/state';
import { formatLonLat } from '@/map/projection';
import { useGame } from '../store';

/** 在海圖上寫註記或修改註記：地名、提醒，寫什麼都可以 */
export function NoteEditor() {
  const edit = useGame((s) => s.noteEdit)!;
  const save = useGame((s) => s.saveNote);
  const close = () => useGame.getState().openNoteEditor(null);
  const [text, setText] = useState(edit.text);
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-label="海圖註記">
        <h2>{edit.id === null ? '在海圖上寫字' : '修改註記'}</h2>
        <p className="meta">
          📍 {formatLonLat(edit.at)}
          ——幫這裡取個名字，或寫下提醒（例如「淺灘小心」「補水的好地方」）。
        </p>
        <input
          className="ship-name-input"
          type="text"
          autoFocus
          maxLength={NOTE_MAX_CHARS}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(text);
          }}
          aria-label="註記內容"
        />
        <div className="row end">
          {edit.id !== null && (
            <button type="button" onClick={() => save('')}>
              🗑️ 擦掉
            </button>
          )}
          <button type="button" onClick={close}>
            取消
          </button>
          <button type="button" className="primary" onClick={() => save(text)}>
            寫上去
          </button>
        </div>
      </section>
    </div>
  );
}
