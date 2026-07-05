'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, ShoppingCart, ArrowLeft } from 'lucide-react';
import { getCart, updateCartQty, removeFromCart, clearCart } from '@/lib/cart';
import { formatPrice } from '@/lib/utils';
import { DOMESTIC_SHIPPING_FEE } from '@/lib/shipping';
import Button from '@/components/ui/Button';
import type { SourcingCartItem } from '@/types';

const SHIPPING_FEE = DOMESTIC_SHIPPING_FEE;

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<SourcingCartItem[]>([]);

  const reload = useCallback(() => setItems(getCart()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleQty = (item: SourcingCartItem, delta: number) => {
    const min = item.min_order || 1;
    const next = item.quantity + delta;
    if (next < min) return;
    updateCartQty(item.product_id, item.sku_id, next);
    reload();
  };

  const handleRemove = (item: SourcingCartItem) => {
    removeFromCart(item.product_id, item.sku_id);
    reload();
  };

  const handleClear = () => {
    clearCart();
    reload();
  };

  // price_krw is already the displayed Ddalkkak unit price (margin baked in by mapper).
  // Backend reconciliation stays unchanged — see /api/sourcing/orders.
  const subtotal = items.reduce((s, i) => s + i.price_krw * i.quantity, 0);
  const subtotalCny = items.reduce((s, i) => s + i.price_cny * i.quantity, 0);
  const total = subtotal + SHIPPING_FEE;

  // 주문 생성은 결제 단계(/checkout)에서 사업자정보·약관 검증 후 처리
  const handleCheckout = () => {
    if (items.length === 0) return;
    router.push('/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <ShoppingCart className="w-16 h-16 text-muted-soft mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-ink mb-2">장바구니가 비어있습니다</h2>
        <p className="text-sm text-muted mb-6">마음에 드는 상품을 담아보세요</p>
        <Link href="/shop">
          <Button>쇼핑 계속하기</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/shop" className="text-muted hover:text-ink transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-ink">
            장바구니 <span className="text-primary">{items.length}</span>
          </h1>
        </div>
        <button
          onClick={handleClear}
          className="text-sm text-muted hover:text-error transition-colors"
        >
          전체 삭제
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        {/* 상품 목록 */}
        <div className="lg:col-span-2 space-y-3 mb-6 lg:mb-0">
          {items.map((item) => {
            const key = item.product_id + (item.sku_id || '');
            return (
              <div key={key} className="bg-canvas border border-hairline rounded-[var(--radius-md)] p-4 flex gap-4">
                <div className="w-16 h-16 bg-surface-soft rounded-[var(--radius-sm)] flex-shrink-0 overflow-hidden">
                  {item.image ? (
                    // next/image 최적화는 쿼리스트링 있는 로컬 경로(이미지 프록시)를 400으로 거부하므로
                    // ProductCard와 동일하게 일반 img + 프록시 사용
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/image-proxy?url=${encodeURIComponent(item.image)}`}
                      alt={item.title}
                      width={64}
                      height={64}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink line-clamp-2 mb-1">{item.title}</p>
                  {item.sku_name && (
                    <p className="text-xs text-muted">{item.sku_name}</p>
                  )}
                  {item.min_order && item.min_order > 1 && (
                    <p className="text-xs text-warning mb-2">최소 주문 {item.min_order}개</p>
                  )}
                  <div className="flex items-center justify-between">
                    {/* 수량 조절 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQty(item, -1)}
                        disabled={item.quantity <= (item.min_order || 1)}
                        className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft disabled:opacity-40 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => handleQty(item, 1)}
                        className="w-7 h-7 rounded-full border border-hairline flex items-center justify-center hover:bg-surface-soft transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 가격 + 삭제 */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-ink">
                          {formatPrice(item.price_krw * item.quantity)}
                        </p>
                        <p className="text-xs text-muted">
                          ¥{(item.price_cny * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemove(item)}
                        className="text-muted hover:text-error transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 결제 요약 */}
        <div className="lg:col-span-1">
          <div className="bg-canvas border border-hairline rounded-[var(--radius-md)] p-5 sticky top-4">
            <h2 className="text-sm font-semibold mb-4">결제 요약</h2>
            <div className="space-y-2.5 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-muted">상품 금액</span>
                <div className="text-right">
                  <p>{formatPrice(subtotal)}</p>
                  <p className="text-xs text-muted">¥{subtotalCny.toFixed(2)}</p>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">배송비 (예상)</span>
                <span>{formatPrice(SHIPPING_FEE)}</span>
              </div>
              <div className="border-t border-hairline pt-2.5 flex justify-between font-bold text-base">
                <span>총 결제 금액</span>
                <span className="text-primary">{formatPrice(total)}</span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                국내 기본 배송비 기준이며, 제주·도서산간은 결제 단계에서 +3,000원이 적용됩니다.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleCheckout}
            >
              주문하기
            </Button>
            <Link href="/shop" className="block text-center text-xs text-muted hover:text-ink mt-3 transition-colors">
              쇼핑 계속하기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
