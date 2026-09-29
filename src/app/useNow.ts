import { useEffect, useState } from 'react';

/** 目前時間（毫秒），每分鐘更新一次；給錯題複習的到期判斷使用 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
