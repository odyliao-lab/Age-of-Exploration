/**
 * 命令列內容驗證：npm run content:validate
 * 讀取 content/ 下所有 JSON，跑 schema 與交叉參照檢查，列出所有問題。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import {
  CodexEntry,
  Port,
  Quest,
  Scenario,
  SeaRegion,
  type ContentBundle,
} from '../src/data/schema';
import { crossValidate, type ContentIssue } from '../src/data/validate';

const root = join(process.cwd(), 'content');
const issues: ContentIssue[] = [];

function loadDir<T>(dir: string, schema: ZodType<T>): T[] {
  const out: T[] = [];
  const full = join(root, dir);
  for (const name of readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const file = `${dir}/${name}`;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(full, name), 'utf8'));
    } catch (e) {
      issues.push({ file, message: `JSON 解析失敗：${(e as Error).message}` });
      continue;
    }
    const r = schema.safeParse(raw);
    if (r.success) out.push(r.data);
    else
      for (const i of r.error.issues)
        issues.push({ file, message: `${i.path.join('.') || '(root)'}: ${i.message}` });
  }
  return out;
}

const bundle: ContentBundle = {
  regions: loadDir('regions', SeaRegion),
  ports: loadDir('ports', Port),
  codex: loadDir('codex', CodexEntry),
  quests: loadDir('quests', Quest),
  scenarios: loadDir('scenarios', Scenario),
};
issues.push(...crossValidate(bundle));

const counts = Object.entries(bundle)
  .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
  .join(' ');
if (issues.length === 0) {
  console.log(`內容驗證通過（${counts}）`);
} else {
  console.error(`內容驗證發現 ${issues.length} 個問題：`);
  for (const i of issues) console.error(`  ${i.file}: ${i.message}`);
  process.exit(1);
}
