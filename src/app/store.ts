/**
 * 遊戲介面狀態。第一週切片只需要：目前畫面、選擇的劇本、選取的港口。
 * 存檔（IndexedDB）在第 9 小時加入。
 */
import { create } from 'zustand';

type Screen = 'menu' | 'map';

interface GameState {
  screen: Screen;
  scenarioId: string | null;
  selectedPortId: string | null;
  startScenario: (id: string) => void;
  backToMenu: () => void;
  selectPort: (id: string | null) => void;
}

export const useGame = create<GameState>((set) => ({
  screen: 'menu',
  scenarioId: null,
  selectedPortId: null,
  startScenario: (id) => set({ screen: 'map', scenarioId: id, selectedPortId: null }),
  backToMenu: () => set({ screen: 'menu', selectedPortId: null }),
  selectPort: (id) => set({ selectedPortId: id }),
}));
