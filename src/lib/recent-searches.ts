import { getScopedJSON, setScopedJSON, removeScoped } from './client-scope';

const KEY = 'ddalkkak-recent-searches'; // 계정별 스코핑은 client-scope가 담당
const MAX_RECENT = 8;

export function getRecentSearches(): string[] {
  const parsed = getScopedJSON<string[]>(KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveRecentSearch(keyword: string): void {
  if (!keyword.trim()) return;
  const next = [keyword, ...getRecentSearches().filter((k) => k !== keyword)].slice(0, MAX_RECENT);
  setScopedJSON(KEY, next);
  window.dispatchEvent(new Event('recent-updated'));
}

/** 특정 검색어 삭제 후 남은 목록 반환 */
export function removeRecentSearch(term: string): string[] {
  const next = getRecentSearches().filter((k) => k !== term);
  setScopedJSON(KEY, next);
  window.dispatchEvent(new Event('recent-updated'));
  return next;
}

export function clearRecentSearches(): void {
  removeScoped(KEY);
  window.dispatchEvent(new Event('recent-updated'));
}
