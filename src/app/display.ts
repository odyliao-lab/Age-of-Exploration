/**
 * 顯示設定：大字模式（存在這台裝置的瀏覽器裡）。
 * 用 rem 設定大小的文字都會跟著放大。
 */
const KEY = 'aoe-large-text';

export function getLargeText(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function applyLargeText(on = getLargeText()) {
  document.documentElement.classList.toggle('large-text', on);
}

export function setLargeText(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // 私密瀏覽時只在這次生效
  }
  applyLargeText(on);
}
