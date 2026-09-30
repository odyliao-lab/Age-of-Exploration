/**
 * 遊戲用的內容索引：把 ContentBundle 轉成以 id 查詢的表，
 * 並預先計算每個港口的港區半徑。
 */
import type {
  CodexEntry,
  ContentBundle,
  CrewMember,
  Port,
  Quest,
  Scenario,
  SeaRegion,
} from '@/data/schema';
import { distanceKm } from '@/geo/geo';
import { isLand, MASK_RES } from '@/geo/landmask';
import type { Harbor } from './voyage';
import type { CoastIndex } from '@/geo/coast';

export interface World {
  content: ContentBundle;
  ports: Map<string, Port>;
  regions: Map<string, SeaRegion>;
  codex: Map<string, CodexEntry>;
  quests: Map<string, Quest>;
  scenarios: Map<string, Scenario>;
  crew: Map<string, CrewMember>;
  /** 航經時可自動發現的地標 */
  landmarks: CodexEntry[];
  /** 要依傳聞調查才會發現的地點 */
  rumors: CodexEntry[];
  harbors: Map<string, Harbor>;
  /** 1:50m 精確海岸（親手駕船的碰撞判定）；沒有時退回 0.25° 陸地遮罩 */
  coast: CoastIndex | null;
}

/** 港區半徑 = 港口到最近海域格的距離 + 餘裕，讓河港（如廣州）也能出海 */
const HARBOR_MARGIN_KM = 25;
const HARBOR_SEARCH_DEG = 2;

function harborFor(port: Port): Harbor {
  let nearest = 0;
  if (isLand(port.location)) {
    nearest = Infinity;
    for (let dy = -HARBOR_SEARCH_DEG; dy <= HARBOR_SEARCH_DEG; dy += MASK_RES) {
      for (let dx = -HARBOR_SEARCH_DEG; dx <= HARBOR_SEARCH_DEG; dx += MASK_RES) {
        const q: [number, number] = [port.location[0] + dx, port.location[1] + dy];
        if (!isLand(q)) nearest = Math.min(nearest, distanceKm(port.location, q));
      }
    }
    if (!Number.isFinite(nearest)) nearest = 150;
  }
  return { center: port.location, radiusKm: nearest + HARBOR_MARGIN_KM };
}

export function buildWorld(content: ContentBundle, coast: CoastIndex | null = null): World {
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const ports = byId(content.ports);
  return {
    content,
    ports,
    regions: byId(content.regions),
    codex: byId(content.codex),
    quests: byId(content.quests),
    scenarios: byId(content.scenarios),
    crew: byId(content.crew),
    landmarks: content.codex.filter((c) => c.location && c.discover_radius_km && !c.rumor),
    rumors: content.codex.filter((c) => c.location && c.rumor),
    harbors: new Map(content.ports.map((p) => [p.id, harborFor(p)])),
    coast,
  };
}

const scenarioWorlds = new WeakMap<World, Map<string, World>>();

/**
 * 劇本用的世界：依劇本的文化視角替港口換名字（例如阿拉伯商人把泉州叫做刺桐）。
 * 沒有要換的名字時直接回傳原本的世界。
 */
export function scenarioWorld(base: World, scenarioId: string): World {
  const names = base.scenarios.get(scenarioId)?.port_names ?? {};
  if (!Object.keys(names).length) return base;
  let cache = scenarioWorlds.get(base);
  if (!cache) scenarioWorlds.set(base, (cache = new Map()));
  const hit = cache.get(scenarioId);
  if (hit) return hit;
  const ports = base.content.ports.map((p) => (names[p.id] ? { ...p, name: names[p.id] } : p));
  const world: World = {
    ...base,
    content: { ...base.content, ports },
    ports: new Map(ports.map((p) => [p.id, p])),
  };
  cache.set(scenarioId, world);
  return world;
}
