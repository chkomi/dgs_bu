'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { XCircle } from 'lucide-react';

function FailContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message') || '결제 처리 중 오류가 발생했습니다.';

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <XCircle className="w-16 h-16 text-danger mx-auto mb-6" />
      <h1 className="text-2xl font-bold text-text-primary mb-2">결제 실패</h1>
      <p className="text-text-secondary mb-8">{message}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/checkout"
          className="px-6 py-3 bg-primary text-white rounded-[var(--radius-md)] font-medium hover:bg-primary-60 transition-colors"
        >
          다시 시도하기
        </Link>
        <Link
          href="/contact"
          className="px-6 py-3 border border-border rounded-[var(--radius-md)] font-medium text-text-secondary hover:bg-surface transition-colors"
        >
          문의하기
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutFailPage() {
  return (
    <Suspense>
      <FailContent />
    </Suspense>
  );
}
