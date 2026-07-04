'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { clearCart } from '@/lib/cart';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 데스크톱 플로우: 체크아웃 페이지에서 이미 승인 확인 후 이동 (?orderId=..&confirmed=1)
  // 모바일 리다이렉트 플로우: 포트원이 ?paymentId=..(&code=..&message=..) 로 리다이렉트
  const orderId = searchParams.get('orderId');
  const confirmed = searchParams.get('confirmed') === '1';
  const paymentId = searchParams.get('paymentId');
  const errorCode = searchParams.get('code');
  const errorMessage = searchParams.get('message');

  const [state, setState] = useState<'confirming' | 'done'>(
    confirmed || (!paymentId && !errorCode) ? 'done' : 'confirming'
  );
  const [orderNumber, setOrderNumber] = useState<string | null>(orderId);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // 리다이렉트 결제 실패 → fail 페이지로
    if (errorCode) {
      router.replace(`/checkout/fail?message=${encodeURIComponent(errorMessage || '결제가 취소되었습니다.')}`);
      return;
    }

    // 리다이렉트 결제 성공 → 서버 승인 확인
    if (paymentId && !confirmed) {
      fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            router.replace(`/checkout/fail?message=${encodeURIComponent(data.error || '결제 확인에 실패했습니다.')}`);
            return;
          }
          clearCart();
          setOrderNumber(data.orderNumber || paymentId);
          setState('done');
        })
        .catch(() => {
          router.replace(`/checkout/fail?message=${encodeURIComponent('결제 확인 중 네트워크 오류가 발생했습니다.')}`);
        });
    }
  }, [paymentId, confirmed, errorCode, errorMessage, router]);

  if (state === 'confirming') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <Loader2 className="w-12 h-12 text-primary mx-auto mb-6 animate-spin" />
        <h1 className="text-lg font-semibold text-ink mb-2">결제 확인 중...</h1>
        <p className="text-sm text-muted">잠시만 기다려주세요. 창을 닫지 마세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-6" />
      <h1 className="text-2xl font-bold text-ink mb-2">결제 완료!</h1>
      <p className="text-muted mb-2">주문이 성공적으로 처리되었습니다.</p>
      {orderNumber && <p className="text-sm text-muted-soft mb-8">주문번호: {orderNumber}</p>}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/sourcing-orders"
          className="px-6 py-3 bg-primary text-white rounded-[var(--radius-md)] font-medium hover:opacity-90 transition-opacity"
        >
          주문 내역 보기
        </Link>
        <Link
          href="/shop"
          className="px-6 py-3 border border-hairline rounded-[var(--radius-md)] font-medium text-muted hover:bg-surface transition-colors"
        >
          계속 쇼핑하기
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
