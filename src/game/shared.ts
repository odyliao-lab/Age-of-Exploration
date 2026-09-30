/**
 * 跨劇本共用的進度（企畫書 3.3 第 6 點）：圖鑑與成就跨劇本共用；Tier、章節進度與船隊各劇本獨立。
 */
import type { World } from './world';

/**
 * 在其他劇本發現的知識卡與解鎖的成就：id → 劇本名稱。
 * 圖鑑、成就跨劇本共用；Tier、章節與船隊各劇本獨立。
 */
export function sharedProgress(
  world: World,
  saves: { scenarioId: string; discovered: string[]; achievements: string[] }[],
  scenarioId: string,
): { discovered: Map<string, string>; achievements: Map<string, string> } {
  const discovered = new Map<string, string>();
  const achievements = new Map<string, string>();
  for (const s of saves) {
    if (s.scenarioId === scenarioId) continue;
    const name = world.scenarios.get(s.scenarioId)?.name ?? s.scenarioId;
    for (const id of s.discovered) if (!discovered.has(id)) discovered.set(id, name);
    for (const id of s.achievements) if (!achievements.has(id)) achievements.set(id, name);
  }
  return { discovered, achievements };
}

/**
 * 想補強某個學習領域時，可以玩哪些劇本（企畫書 12：日誌中看到「哪些劇本能補強我的弱項」）。
 * 回傳其他涵蓋這個領域的劇本名稱。
 */
export function scenariosFor(world: World, domain: string, exceptScenarioId: string): string[] {
  return world.content.scenarios
    .filter((s) => s.id !== exceptScenarioId && (s.domains as string[]).includes(domain))
    .map((s) => s.name);
}
