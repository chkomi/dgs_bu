'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, History, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/utils';
import { getRecentlyViewed, clearRecentlyViewed } from '@/lib/recently-viewed';
import type { RecentlyViewedItem } from '@/lib/recently-viewed';
import { getRecentSearches, removeRecentSearch, clearRecentSearches } from '@/lib/recent-searches';

function proxyImg(url: string): string {
  if (!url) return '';
  if (url.includes('alicdn.com') || url.includes('1688.com/img')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export default function HistoryDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => {
      setRecentSearches(getRecentSearches());
      setRecentlyViewed(getRecentlyViewed());
    };
    load();
    window.addEventListener('storage', load);
    window.addEventListener('recent-updated', load);
    return () => {
      window.removeEventListener('storage', load);
      window.removeEventListener('recent-updated', load);
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const removeRecent = (term: string) => {
    setRecentSearches(removeRecentSearch(term));
  };

  const clearAllRecent = () => {
    setRecentSearches([]);
    clearRecentSearches();
  };

  const handleSearchClick = (term: string) => {
    setIsOpen(false);
    router.push(`/shop?keyword=${encodeURIComponent(term)}`);
  };

  const hasHistory = recentSearches.length > 0 || recentlyViewed.length > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors',
          isOpen ? 'text-primary bg-primary-5' : 'text-text-secondary hover:text-primary hover:bg-surface'
        )}
      >
        <History className="w-4 h-4" />
        <span className="hidden lg:inline">히스토리</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-border-light overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
            <span className="text-sm font-semibold text-text-primary">히스토리</span>
            <button onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4 text-text-tertiary hover:text-text-primary transition-colors" />
            </button>
          </div>

          <div className="px-4 py-3 space-y-4 max-h-[400px] overflow-y-auto">
            {!hasHistory ? (
              <p className="text-sm text-text-tertiary text-center py-4">히스토리가 없습니다.</p>
            ) : (
              <>
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide flex items-center gap-1">
                        <Clock className="w-3 h-3" /> 최근 검색어
                      </p>
                      <button onClick={clearAllRecent} className="text-[10px] text-text-tertiary hover:text-danger transition-colors">
                        삭제
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSearches.slice(0, 6).map((term) => (
                        <span
                          key={term}
                          className="inline-flex items-center gap-0.5 pl-2 pr-1 py-0.5 bg-surface border border-border-light rounded-full text-[11px] text-text-secondary"
                        >
                          <button
                            onClick={() => handleSearchClick(term)}
                            className="hover:text-primary transition-colors truncate max-w-[100px]"
                          >
                            {term}
                          </button>
                          <button
                            onClick={() => removeRecent(term)}
                            className="w-3.5 h-3.5 flex items-center justify-center hover:text-danger transition-colors flex-shrink-0"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {recentlyViewed.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide flex items-center gap-1">
                        <History className="w-3 h-3" /> 최근 본 상품
                      </p>
                      <button
                        onClick={() => { clearRecentlyViewed(); setRecentlyViewed([]); }}
                        className="text-[10px] text-text-tertiary hover:text-danger transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[210px] overflow-y-auto">
                      {recentlyViewed.map((item) => (
                        <Link
                          key={item.product_id}
                          href={`/shop/${item.product_id}`}
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-2 group"
                        >
                          <div className="w-10 h-10 bg-surface border border-border-light rounded-[var(--radius-sm)] overflow-hidden flex-shrink-0">
                            {item.image ? (
                              <img
                                src={proxyImg(item.image)}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm">📦</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-text-secondary line-clamp-1 group-hover:text-primary transition-colors">
                              {item.title}
                            </p>
                            <p className="text-[11px] font-semibold text-primary">{formatPrice(item.price_krw)}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
