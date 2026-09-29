import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * 離線遊玩（企畫書 PWA）：建置完成後掃描輸出目錄，產生預先快取全部檔案的 sw.js。
 * 版本號取自檔案內容雜湊，內容一變瀏覽器就會換新快取。
 */
export function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'aoe-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const out = config.build.outDir;
      const files = walk(out)
        .map((f) => relative(out, f).split(sep).join('/'))
        .filter((f) => !f.endsWith('.map') && f !== 'sw.js' && !f.startsWith('_'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
      const version = hash.digest('hex').slice(0, 12);
      const urls = files.map((f) => (f === 'index.html' ? '/' : `/${f}`));
      writeFileSync(join(out, 'sw.js'), swSource(version, urls));
    },
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function swSource(version: string, urls: string[]): string {
  return `// 由 tools/serviceWorker.ts 產生，請勿手動修改
const CACHE = 'aoe-${version}';
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // 頁面：先試網路（拿到最新版），離線時用快取
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/', { cacheName: CACHE, ignoreVary: true })));
    return;
  }
  // 其他檔案：快取優先
  event.respondWith(caches.match(req, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || fetch(req)));
});
`;
}
