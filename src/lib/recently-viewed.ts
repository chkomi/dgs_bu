import { getScopedJSON, setScopedJSON, removeScoped } from './client-scope';

const KEY = 'ddalkkak-recently-viewed'; // 계정별 스코핑은 client-scope가 담당
const MAX = 12;

export interface RecentlyViewedItem {
  product_id: string;
  title: string;
  image: string;
  price_krw: number;
  visited_at: string;
}

export function getRecentlyViewed(): RecentlyViewedItem[] {
  return getScopedJSON<RecentlyViewedItem[]>(KEY, []);
}

export function addRecentlyViewed(item: Omit<RecentlyViewedItem, 'visited_at'>): void {
  const list = getRecentlyViewed().filter((i) => i.product_id !== item.product_id);
  list.unshift({ ...item, visited_at: new Date().toISOString() });
  if (list.length > MAX) list.length = MAX;
  setScopedJSON(KEY, list);
  window.dispatchEvent(new Event('recent-updated'));
}

export function clearRecentlyViewed(): void {
  removeScoped(KEY);
}
