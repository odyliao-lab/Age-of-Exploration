/**
 * 內容只載入與驗證一次，整個 App 共用。
 * 驗證失敗時保留錯誤訊息，讓介面顯示出來，而不是整頁空白。
 */
import { loadContent } from '@/data/load';
import type { ContentBundle } from '@/data/schema';

export type ContentResult =
  { content: ContentBundle; error: null } | { content: null; error: string };

function load(): ContentResult {
  try {
    return { content: loadContent(), error: null };
  } catch (e) {
    return { content: null, error: (e as Error).message };
  }
}

export const contentResult = load();
