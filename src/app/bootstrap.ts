/**
 * 遊戲引擎的延遲載入入口：建立內容索引（含陸地遮罩與港區計算）並交給 store。
 * 劇本選單只需要讀存檔清單，不需要這些。
 */
import { buildWorld } from '@/game/world';
import { contentResult } from './content';
import { useGame } from './store';

export async function ensureWorld() {
  const st = useGame.getState();
  if (st.world || !contentResult.content) return;
  st.init(buildWorld(contentResult.content));
}
