/**
 * 交叉參照驗證：確認各資料檔引用的 id 都存在，
 * 以及企畫書規定的內容規則（傳說必附科學對照、任務至少一個學習目標等）。
 */
import { SHIPS } from '../game/progression';
import type { ContentBundle } from './schema';

export interface ContentIssue {
  file: string;
  message: string;
}

export function crossValidate(bundle: ContentBundle): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const regionIds = new Set(bundle.regions.map((r) => r.id));
  const portIds = new Set(bundle.ports.map((p) => p.id));
  const codexIds = new Set(bundle.codex.map((c) => c.id));
  const questIds = new Set(bundle.quests.map((q) => q.id));
  const scenarioIds = new Set(bundle.scenarios.map((s) => s.id));

  const dup = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push({ file: label, message: `重複的 id：${id}` });
      seen.add(id);
    }
  };
  dup(
    'regions',
    bundle.regions.map((r) => r.id),
  );
  dup(
    'ports',
    bundle.ports.map((p) => p.id),
  );
  dup(
    'codex',
    bundle.codex.map((c) => c.id),
  );
  dup(
    'quests',
    bundle.quests.map((q) => q.id),
  );
  dup(
    'scenarios',
    bundle.scenarios.map((s) => s.id),
  );

  for (const p of bundle.ports) {
    const f = `ports/${p.id}`;
    if (!regionIds.has(p.region)) issues.push({ file: f, message: `未知的海域區：${p.region}` });
    for (const g of p.goods)
      if (!codexIds.has(g)) issues.push({ file: f, message: `未知的物產 codex：${g}` });
    for (const g of p.sights)
      if (!codexIds.has(g)) issues.push({ file: f, message: `未知的名勝 codex：${g}` });
  }

  for (const c of bundle.codex) {
    const f = `codex/${c.id}`;
    if (c.category === 'legend' && !c.science_note)
      issues.push({ file: f, message: '傳說類知識卡必須附 science_note（企畫書 10.3）' });
    if (c.discover_radius_km && !c.location)
      issues.push({ file: f, message: '有 discover_radius_km 就必須有 location' });
    if (c.rumor && !c.location)
      issues.push({ file: f, message: '有傳聞就必須有 location（調查的地點）' });
    if (c.rumor && !portIds.has(c.rumor.port))
      issues.push({ file: f, message: `傳聞的港口不存在：${c.rumor.port}` });
  }

  // 可以在遊戲中被發現的知識卡：航經地標、港口特產、任務獎勵
  const discoverable = new Set<string>([
    ...bundle.codex
      .filter((c) => (c.location && (c.discover_radius_km || c.rumor)) || c.line)
      .map((c) => c.id),
    ...bundle.ports.flatMap((p) => [...p.goods, ...p.sights]),
    ...bundle.quests.flatMap((q) => q.reward.codex),
  ]);

  for (const q of bundle.quests) {
    const f = `quests/${q.id}`;
    if (!scenarioIds.has(q.scenario))
      issues.push({ file: f, message: `未知的劇本：${q.scenario}` });
    if (!portIds.has(q.giver_port))
      issues.push({ file: f, message: `未知的港口：${q.giver_port}` });
    for (const pre of q.prerequisites)
      if (!questIds.has(pre)) issues.push({ file: f, message: `未知的前置任務：${pre}` });
    for (const u of q.reward.unlock_ports)
      if (!portIds.has(u)) issues.push({ file: f, message: `未知的解鎖港口：${u}` });
    for (const c of q.reward.codex)
      if (!codexIds.has(c)) issues.push({ file: f, message: `未知的獎勵 codex：${c}` });
    q.steps.forEach((s, i) => {
      if (s.type === 'navigate' && !portIds.has(s.target))
        issues.push({ file: f, message: `步驟 ${i}：未知的港口 ${s.target}` });
      if (s.type === 'discover' && !codexIds.has(s.target))
        issues.push({ file: f, message: `步驟 ${i}：未知的 codex ${s.target}` });
      if (s.type === 'discover' && codexIds.has(s.target) && !discoverable.has(s.target))
        issues.push({
          file: f,
          message: `步驟 ${i}：codex ${s.target} 無法在遊戲中發現（需有 location 與 discover_radius_km、為港口特產，或為任務獎勵）`,
        });
      if (s.type === 'deliver') {
        if (!portIds.has(s.target))
          issues.push({ file: f, message: `步驟 ${i}：未知的港口 ${s.target}` });
        if (!bundle.ports.some((p) => p.goods.includes(s.good)))
          issues.push({ file: f, message: `步驟 ${i}：沒有港口出產 ${s.good}` });
      }
      if (s.type === 'quiz' && s.answer >= s.choices.length)
        issues.push({ file: f, message: `步驟 ${i}：answer 超出選項範圍` });
    });
  }

  dup(
    'crew',
    bundle.crew.map((c) => c.id),
  );
  for (const c of bundle.crew) {
    if (!portIds.has(c.home_port))
      issues.push({ file: `crew/${c.id}`, message: `未知的招募港口：${c.home_port}` });
  }

  for (const s of bundle.scenarios) {
    const f = `scenarios/${s.id}`;
    if (!portIds.has(s.home_port))
      issues.push({ file: f, message: `未知的家鄉港口：${s.home_port}` });
    if (!regionIds.has(s.home_region))
      issues.push({ file: f, message: `未知的家鄉海域區：${s.home_region}` });
    for (const ship of [s.starting_ship, ...s.ships])
      if (!SHIPS[ship]) issues.push({ file: f, message: `未知的船型：${ship}` });
    if (s.ships.length && s.ships[0] !== s.starting_ship)
      issues.push({ file: f, message: 'ships 的第一個必須是 starting_ship' });
    for (const sp of s.starting_ports)
      if (!portIds.has(sp)) issues.push({ file: f, message: `未知的起始港口：${sp}` });
    for (const rid of Object.keys(s.region_tiers))
      if (!regionIds.has(rid))
        issues.push({ file: f, message: `region_tiers 含未知海域區：${rid}` });
    if (s.region_tiers[s.home_region] !== 0)
      issues.push({ file: f, message: '家鄉海域區的 Tier 必須是 0' });
    const home = bundle.ports.find((p) => p.id === s.home_port);
    if (home && home.region !== s.home_region)
      issues.push({ file: f, message: '家鄉港口不在家鄉海域區內' });
  }

  return issues;
}
