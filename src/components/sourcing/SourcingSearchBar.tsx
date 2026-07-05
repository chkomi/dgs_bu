'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveRecentSearch } from '@/lib/recent-searches';

export { saveRecentSearch };

/** 1688 URL 또는 순수 상품 ID에서 product_id 추출 */
export function extract1688Id(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{10,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/offer\/(\d+)|detail\.1688\.com[^/]*\/(\d{10,})|[?&]offerId=(\d+)/);
  if (match) return match[1] || match[2] || match[3];
  return null;
}

interface Props {
  /** compact: 셸 상단 글로벌 바 / hero: 페이지 메인 검색 */
  variant?: 'compact' | 'hero';
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * 키워드 / 1688 URL / 상품 ID 검색바 — 모든 소싱 페이지(상세 포함)에서 공유.
 * 검색 시 `/shop?q=...`로 이동(필터 URL 스키마는 filters.ts의 `q`와 일치).
 * 상품 ID·URL이면 해당 상세(`/shop/[id]`)로 바로 이동.
 */
export default function SourcingSearchBar({
  variant = 'compact',
  className,
  placeholder = '상품명, 1688 URL 또는 상품 ID 검색',
  autoFocus,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    const id = extract1688Id(trimmed);
    if (id) {
      router.push(`/shop/${id}`);
      return;
    }

    saveRecentSearch(trimmed);
    fetch('/api/sourcing/search-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: trimmed }),
    }).catch(() => {});

    router.push(`/shop?q=${encodeURIComponent(trimmed)}`);
  };

  const isHero = variant === 'hero';

  return (
    <form onSubmit={handleSubmit} className={cn('relative w-full', className)}>
      <Search
        className={cn(
          'absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none',
          isHero ? 'w-5 h-5' : 'w-4 h-4'
        )}
      />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="상품 검색"
        className={cn(
          'w-full bg-canvas border border-hairline rounded-full text-ink placeholder:text-muted',
          'focus:outline-none focus:border-ink transition-colors',
          isHero ? 'pl-11 pr-24 py-3 text-sm' : 'pl-10 pr-4 py-2 text-sm'
        )}
      />
      {isHero && (
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-60 transition-colors"
        >
          검색
        </button>
      )}
    </form>
  );
}
