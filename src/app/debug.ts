/**
 * 自動化測試用：網址加上 ?debug 時開放內部狀態。
 * 記在 sessionStorage，Google 登入轉址回來後仍然有效。
 */
export function isDebug(): boolean {
  try {
    if (new URLSearchParams(location.search).has('debug')) {
      sessionStorage.setItem('aoe-debug', '1');
      return true;
    }
    return sessionStorage.getItem('aoe-debug') === '1';
  } catch {
    return false;
  }
}
