/**
 * 遊戲引擎的延遲載入入口：建立內容索引（含陸地遮罩、精確海岸與港區計算）並交給 store。
 * 劇本選單只需要讀存檔清單，不需要這些。
 */
import { buildWorld } from '@/game/world';
import { CoastIndex } from '@/geo/coast';
import { loadDetailedLand } from '@/map/land';
import { contentResult } from './content';
import { useGame } from './store';

export async function ensureWorld() {
  const st = useGame.getState();
  if (st.world || !contentResult.content) return;
  // 近距離航行用的 1:50m 海岸線：畫面與碰撞判定共用
  const rings = await loadDetailedLand();
  st.init(buildWorld(contentResult.content, new CoastIndex(rings)));
}
