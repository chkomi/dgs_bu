import type { SourcingCartItem } from '@/types';
import { getScopedJSON, setScopedJSON, removeScoped } from './client-scope';

const CART_KEY = 'ddalkkak-cart'; // 계정별 스코핑은 client-scope가 담당
const MAX_ITEMS = 50;

export function getCart(): SourcingCartItem[] {
  return getScopedJSON<SourcingCartItem[]>(CART_KEY, []);
}

function saveCart(items: SourcingCartItem[]) {
  setScopedJSON(CART_KEY, items);
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
  removeScoped(CART_KEY);
  // 헤더 뱃지 등 구독자 동기화 (saveCart와 동일한 알림)
  window.dispatchEvent(new Event('cart-updated'));
}

// 장바구니 항목(상품 종류) 개수 — 수량 합계가 아님
export function getCartCount(): number {
  return getCart().length;
}
