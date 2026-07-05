import type { SourcingCartItem } from '@/types';

const CART_KEY = 'ddalkkak-cart'; // 게스트(비로그인) 장바구니 — 레거시 키 유지
const CART_UID_KEY = 'ddalkkak-cart-uid'; // 현재 활성 계정 (없으면 게스트)
const MAX_ITEMS = 50;

// 같은 브라우저를 여러 계정이 쓰더라도 장바구니가 섞이지 않도록 계정별 키를 사용
function cartKey(): string {
  if (typeof window === 'undefined') return CART_KEY;
  const uid = localStorage.getItem(CART_UID_KEY);
  return uid ? `${CART_KEY}:u:${uid}` : CART_KEY;
}

function readCart(key: string): SourcingCartItem[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

export function getCart(): SourcingCartItem[] {
  if (typeof window === 'undefined') return [];
  return readCart(cartKey());
}

function saveCart(items: SourcingCartItem[]) {
  localStorage.setItem(cartKey(), JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
}

/**
 * 로그인/로그아웃 시 활성 장바구니를 계정별로 전환한다.
 * - 로그인: 게스트 장바구니를 해당 계정 장바구니로 병합(같은 상품+옵션은 수량 합산) 후 게스트 비움
 * - 로그아웃: 게스트(빈) 장바구니로 복귀 — 각 계정 장바구니는 자기 키에 보존
 */
export function setCartUser(userId: string | null): void {
  if (typeof window === 'undefined') return;
  const current = localStorage.getItem(CART_UID_KEY);
  if ((current || null) === (userId || null)) return;

  if (userId) {
    const guestItems = readCart(CART_KEY);
    const userKey = `${CART_KEY}:u:${userId}`;
    if (guestItems.length > 0) {
      const merged = readCart(userKey);
      for (const item of guestItems) {
        const key = item.product_id + (item.sku_id || '');
        const existing = merged.find((c) => c.product_id + (c.sku_id || '') === key);
        if (existing) existing.quantity += item.quantity;
        else merged.push(item);
      }
      localStorage.setItem(userKey, JSON.stringify(merged.slice(-MAX_ITEMS)));
      localStorage.removeItem(CART_KEY);
    }
    localStorage.setItem(CART_UID_KEY, userId);
  } else {
    localStorage.removeItem(CART_UID_KEY);
  }
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(item: SourcingCartItem): { success: boolean; removed?: boolean } {
  const cart = getCart();
  const key = item.product_id + (item.sku_id || '');
  const existing = cart.find((c) => c.product_id + (c.sku_id || '') === key);
  let removed = false;
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    if (cart.length >= MAX_ITEMS) {
      cart.shift();
      removed = true;
    }
    cart.push({ ...item });
  }
  saveCart(cart);
  return { success: true, removed };
}

export function updateCartQty(productId: string, skuId: string | undefined, quantity: number): void {
  const cart = getCart();
  const key = productId + (skuId || '');
  const item = cart.find((c) => c.product_id + (c.sku_id || '') === key);
  if (!item) return;
  if (quantity <= 0) {
    removeFromCart(productId, skuId);
    return;
  }
  item.quantity = quantity;
  saveCart(cart);
}

export function removeFromCart(productId: string, skuId: string | undefined): void {
  const key = productId + (skuId || '');
  saveCart(getCart().filter((c) => c.product_id + (c.sku_id || '') !== key));
}

export function clearCart(): void {
  localStorage.removeItem(cartKey());
  // 헤더 뱃지 등 구독자 동기화 (saveCart와 동일한 알림)
  window.dispatchEvent(new Event('cart-updated'));
}

// 장바구니 항목(상품 종류) 개수 — 수량 합계가 아님
export function getCartCount(): number {
  return getCart().length;
}
