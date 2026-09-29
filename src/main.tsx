import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { unlockAudio } from './app/sound';
import { initCloud } from './app/cloudSync';
import './app/styles.css';

// 瀏覽器要求使用者互動後才能播放聲音
window.addEventListener('pointerdown', unlockAudio, { once: true });

// 離線遊玩：正式版才註冊 service worker，開發時避免快取干擾
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 不支援或被封鎖時照常線上遊玩
    });
  });
}

// 還原 Google 登入狀態並開始雲端同步（沒有設定雲端時什麼都不做）
initCloud();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
