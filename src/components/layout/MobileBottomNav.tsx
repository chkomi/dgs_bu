'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Clock, History, X } from 'lucide-react';
import { adminNavItems, isActivePath, navItems, type NavItem } from '@/lib/navigation';
import { getRecentlyViewed, clearRecentlyViewed, type RecentlyViewedItem } from '@/lib/recently-viewed';
import { getRecentSearches, removeRecentSearch, clearRecentSearches } from '@/lib/recent-searches';
import { cn, formatPrice } from '@/lib/utils';

function proxyImg(url: string): string {
  if (!url) return '';
  if (url.includes('alicdn.com') || url.includes('1688.com/img')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function isAdminNavActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : isActivePath(pathname, href);
}

function MobileNavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1 text-[10px] font-medium leading-none transition-colors',
        active ? 'text-primary' : 'text-text-tertiary'
      )}
    >
      <item.icon className="h-5 w-5 flex-shrink-0" />
      <span className="w-full truncate text-center">{item.label}</span>
    </Link>
  );
}

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = pathname.startsWith('/admin');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setHistoryOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isAdmin) return;

    const loadHistory = () => {
      setRecentSearches(getRecentSearches());
      setRecentlyViewed(getRecentlyViewed());
    };

    loadHistory();
    window.addEventListener('storage', loadHistory);
    window.addEventListener('recent-updated', loadHistory);
    return () => {
      window.removeEventListener('storage', loadHistory);
      window.removeEventListener('recent-updated', loadHistory);
    };
  }, [isAdmin]);

  const removeRecent = (term: string) => {
    setRecentSearches(removeRecentSearch(term));
  };

  const clearAllRecent = () => {
    setRecentSearches([]);
    clearRecentSearches();
  };

  const handleSearchClick = (term: string) => {
    setHistoryOpen(false);
    router.push(`/shop?q=${encodeURIComponent(term)}`);
  };

  if (isAdmin) {
    return (
      <>
        <div
          className="lg:hidden h-[calc(var(--mobile-bottom-nav-height)+var(--safe-area-bottom))]"
          aria-hidden="true"
        />
        <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 h-[calc(var(--mobile-bottom-nav-height)+var(--safe-area-bottom))] border-t border-border bg-white px-1 pt-1 pb-[calc(0.25rem+var(--safe-area-bottom))]">
          <div className="flex h-full items-center justify-around gap-0.5">
            {adminNavItems.map((item) => (
              <MobileNavLink
                key={item.href}
                item={item}
                active={isAdminNavActive(pathname, item.href)}
              />
            ))}
          </div>
        </nav>
      </>
    );
  }

  return (
    <>
      <div
        className="md:hidden h-[calc(var(--mobile-bottom-nav-height)+var(--safe-area-bottom))]"
        aria-hidden="true"
      />

      {historyOpen && (
        <>
          <button
            type="button"
            aria-label="히스토리 닫기"
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="md:hidden fixed inset-x-0 bottom-[calc(var(--mobile-bottom-nav-height)+var(--safe-area-bottom))] z-50 max-h-[60vh] overflow-y-auto rounded-t-2xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
              <span className="text-sm font-semibold text-text-primary">히스토리</span>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="닫기">
                <X className="h-4 w-4 text-text-tertiary" />
              </button>
            </div>
            <div className="space-y-5 px-4 py-4">
              {recentSearches.length === 0 && recentlyViewed.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-tertiary">히스토리가 없습니다.</p>
              ) : (
                <>
                  {recentSearches.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-text-tertiary">
                          <Clock className="h-3 w-3" /> 최근 검색어
                        </p>
                        <button
                          type="button"
                          onClick={clearAllRecent}
                          className="text-[10px] text-text-tertiary transition-colors hover:text-danger"
                        >
                          삭제
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentSearches.slice(0, 6).map((term) => (
                          <span
                            key={term}
                            className="inline-flex items-center gap-0.5 rounded-full border border-border-light bg-surface py-0.5 pl-2 pr-1 text-[11px] text-text-secondary"
                          >
                            <button
                              type="button"
                              onClick={() => handleSearchClick(term)}
                              className="max-w-[100px] truncate transition-colors hover:text-primary"
                            >
                              {term}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRecent(term)}
                              className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center transition-colors hover:text-danger"
                              aria-label={`${term} 삭제`}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {recentlyViewed.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-text-tertiary">
                          <History className="h-3 w-3" /> 최근 본 상품
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            clearRecentlyViewed();
                            setRecentlyViewed([]);
                          }}
                          className="text-[10px] text-text-tertiary transition-colors hover:text-danger"
                        >
                          삭제
                        </button>
                      </div>
                      <div className="space-y-2">
                        {recentlyViewed.map((item) => (
                          <Link
                            key={item.product_id}
                            href={`/shop/${item.product_id}`}
                            onClick={() => setHistoryOpen(false)}
                            className="group flex items-center gap-2"
                          >
                            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-border-light bg-surface">
                              {item.image ? (
                                <Image
                                  src={proxyImg(item.image)}
                                  alt={item.title}
                                  width={40}
                                  height={40}
                                  unoptimized
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-text-tertiary">
                                  상품
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-1 text-[11px] text-text-secondary transition-colors group-hover:text-primary">
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
        </>
      )}

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[calc(var(--mobile-bottom-nav-height)+var(--safe-area-bottom))] border-t border-border-light bg-white px-1 pt-1 pb-[calc(0.25rem+var(--safe-area-bottom))]">
        <div className="flex h-full items-center justify-around gap-0.5">
          {navItems.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
            />
          ))}
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1 text-[10px] font-medium leading-none transition-colors',
              historyOpen ? 'text-primary' : 'text-text-tertiary'
            )}
          >
            <History className="h-5 w-5 flex-shrink-0" />
            <span className="w-full truncate text-center">히스토리</span>
          </button>
        </div>
      </nav>
    </>
  );
}
