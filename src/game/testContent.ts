/** 測試用：以 Node 讀取 content/ 下的正式內容 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CodexEntry, Port, Quest, Scenario, SeaRegion, type ContentBundle } from '@/data/schema';

function dir<T>(name: string, schema: { parse(v: unknown): T }): T[] {
  const d = join(process.cwd(), 'content', name);
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => schema.parse(JSON.parse(readFileSync(join(d, f), 'utf8'))));
}

export function contentForTests(): ContentBundle {
  return {
    regions: dir('regions', SeaRegion),
    ports: dir('ports', Port),
    codex: dir('codex', CodexEntry),
    quests: dir('quests', Quest),
    scenarios: dir('scenarios', Scenario),
  };
}
