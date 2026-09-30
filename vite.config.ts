import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { serviceWorker } from './tools/serviceWorker';

export default defineConfig({
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@content': fileURLToPath(new URL('./content', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // 1:50m 海岸線資料（land-50m，約 550 kB、gzip 後更小）是純資料，進入遊戲才載入；其餘程式都在 500 kB 以下
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // 把大型函式庫拆成獨立檔案，改版時玩家不必重新下載
        advancedChunks: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
});
