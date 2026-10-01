/**
 * 錢的名稱與圖示依劇本而定：大部分劇本是「金幣」，玻里尼西亞沒有貨幣，改成交換用的「珍寶」。
 */
import { useGame } from './store';

export function useMoney(): string {
  return useGame((s) => (s.game && s.world?.scenarios.get(s.game.scenarioId)?.currency) || '金幣');
}

export function useMoneyIcon(): string {
  return useGame(
    (s) => (s.game && s.world?.scenarios.get(s.game.scenarioId)?.currency_icon) || '💰',
  );
}
