import type { CodexEntry } from '@/data/schema';

export const CATEGORY_LABELS: Record<CodexEntry['category'], string> = {
  landmark: '地理地標',
  island: '島嶼與群島',
  river: '河流與河口',
  mountain: '山脈與高原',
  wildlife: '動植物',
  culture: '文化與建築',
  goods: '物產',
  phenomenon: '天文與氣候現象',
  legend: '傳說',
};
