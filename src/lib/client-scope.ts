/**
 * 브라우저 로컬 상태(장바구니·최근 본 상품·최근 검색어)의 계정별 분리.
 *
 * localStorage는 기기 단위라 같은 브라우저를 여러 계정이 쓰면 데이터가 섞인다.
 * 활성 계정 uid를 저장해 두고, 각 저장소 키를 `base:u:<uid>`로 스코핑한다.
 * (비로그인은 base 키 그대로 = 게스트 저장소)
 *
 * 로그인 시 게스트 데이터는 해당 계정으로 병합 후 비운다
 * (비로그인으로 담고/보고/검색하다 로그인하는 흐름 보존).
 */

const UID_KEY = 'ddalkkak-uid';
const LEGACY_CART_UID_KEY = 'ddalkkak-cart-uid'; // 구버전 키 — 발견 시 정리

const CART_BASE = 'ddalkkak-cart';
const RECENT_VIEWED_BASE = 'ddalkkak-recently-viewed';
const RECENT_SEARCHES_BASE = 'ddalkkak-recent-searches';

export function getClientUid(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(UID_KEY);
}

/** 현재 활성 계정 기준의 저장소 키 */
export function scopedKey(base: string): string {
  const uid = getClientUid();
  return uid ? `${base}:u:${uid}` : base;
}

export function getScopedJSON<T>(base: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(scopedKey(base));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setScopedJSON(base: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(scopedKey(base), JSON.stringify(value));
}

export function removeScoped(base: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(scopedKey(base));
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface CartLike {
  product_id: string;
  sku_id?: string;
  quantity: number;
}
interface ViewedLike {
  product_id: string;
  visited_at?: string;
}

/** 로그인 시 게스트 저장소를 계정 저장소로 병합하고 게스트를 비운다 */
function mergeGuestIntoUser(uid: string): void {
  // 장바구니 — 같은 상품+옵션은 수량 합산, 최대 50
  const guestCart = readJSON<CartLike[]>(CART_BASE, []);
  if (guestCart.length > 0) {
    const userKey = `${CART_BASE}:u:${uid}`;
    const merged = readJSON<CartLike[]>(userKey, []);
    for (const item of guestCart) {
      const k = item.product_id + (item.sku_id || '');
      const existing = merged.find((c) => c.product_id + (c.sku_id || '') === k);
      if (existing) existing.quantity += item.quantity;
      else merged.push(item);
    }
    localStorage.setItem(userKey, JSON.stringify(merged.slice(-50)));
    localStorage.removeItem(CART_BASE);
  }

  // 최근 본 상품 — product_id 중복 제거, 최신순, 최대 12
  const guestViewed = readJSON<ViewedLike[]>(RECENT_VIEWED_BASE, []);
  if (guestViewed.length > 0) {
    const userKey = `${RECENT_VIEWED_BASE}:u:${uid}`;
    const userViewed = readJSON<ViewedLike[]>(userKey, []);
    const seen = new Set<string>();
    const merged = [...guestViewed, ...userViewed]
      .filter((v) => (seen.has(v.product_id) ? false : (seen.add(v.product_id), true)))
      .sort((a, b) => (b.visited_at || '').localeCompare(a.visited_at || ''))
      .slice(0, 12);
    localStorage.setItem(userKey, JSON.stringify(merged));
    localStorage.removeItem(RECENT_VIEWED_BASE);
  }

  // 최근 검색어 — 중복 제거, 게스트(최근 활동) 우선, 최대 10
  const guestSearches = readJSON<string[]>(RECENT_SEARCHES_BASE, []);
  if (guestSearches.length > 0) {
    const userKey = `${RECENT_SEARCHES_BASE}:u:${uid}`;
    const userSearches = readJSON<string[]>(userKey, []);
    const merged = [...new Set([...guestSearches, ...userSearches])].slice(0, 10);
    localStorage.setItem(userKey, JSON.stringify(merged));
    localStorage.removeItem(RECENT_SEARCHES_BASE);
  }
}

/**
 * 로그인/로그아웃 시 활성 계정을 전환한다 (Header의 인증 상태 감지에서 호출).
 * - 로그인: 게스트 데이터 병합 → 계정 스코프 활성화
 * - 로그아웃: 게스트(빈) 스코프로 복귀 — 각 계정 데이터는 자기 키에 보존
 */
export function setClientUser(userId: string | null): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LEGACY_CART_UID_KEY);

  const current = localStorage.getItem(UID_KEY);
  if ((current || null) === (userId || null)) return;

  if (userId) {
    mergeGuestIntoUser(userId);
    localStorage.setItem(UID_KEY, userId);
  } else {
    localStorage.removeItem(UID_KEY);
  }

  // 구독 컴포넌트 갱신 (장바구니 뱃지, 최근 본 상품 목록 등)
  window.dispatchEvent(new Event('cart-updated'));
  window.dispatchEvent(new Event('recent-updated'));
}
