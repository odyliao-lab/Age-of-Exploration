/**
 * 以 Vite 的 import.meta.glob 載入 content/ 下所有 JSON，並用 schema 驗證。
 * 開發時遇到內容錯誤會直接丟出，避免壞資料靜默進入遊戲。
 */
import {
  CodexEntry,
  CrewMember,
  Port,
  Quest,
  Scenario,
  SeaRegion,
  type ContentBundle,
} from './schema';
import { crossValidate } from './validate';

const regionFiles = import.meta.glob('@content/regions/*.json', { eager: true, import: 'default' });
const portFiles = import.meta.glob('@content/ports/*.json', { eager: true, import: 'default' });
const codexFiles = import.meta.glob('@content/codex/*.json', { eager: true, import: 'default' });
const questFiles = import.meta.glob('@content/quests/*.json', { eager: true, import: 'default' });
const scenarioFiles = import.meta.glob('@content/scenarios/*.json', {
  eager: true,
  import: 'default',
});
const crewFiles = import.meta.glob('@content/crew/*.json', { eager: true, import: 'default' });

function parseAll<T>(files: Record<string, unknown>, schema: { parse(v: unknown): T }): T[] {
  return Object.entries(files).map(([path, raw]) => {
    try {
      return schema.parse(raw);
    } catch (e) {
      throw new Error(`內容檔驗證失敗 ${path}\n${(e as Error).message}`, { cause: e });
    }
  });
}

export function loadContent(): ContentBundle {
  const bundle: ContentBundle = {
    regions: parseAll(regionFiles, SeaRegion),
    ports: parseAll(portFiles, Port),
    codex: parseAll(codexFiles, CodexEntry),
    quests: parseAll(questFiles, Quest),
    scenarios: parseAll(scenarioFiles, Scenario),
    crew: parseAll(crewFiles, CrewMember),
  };
  const issues = crossValidate(bundle);
  if (issues.length) {
    throw new Error(issues.map((i) => `${i.file}: ${i.message}`).join('\n'));
  }
  return bundle;
}
