import { MapScreen } from './MapScreen';

/** 延遲載入的遊戲畫面入口（default export 供 React.lazy 使用） */
export default function GameScreen() {
  return <MapScreen />;
}
