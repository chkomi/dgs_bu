'use client';

import { usePathname } from 'next/navigation';
import SidebarNav from '@/components/layout/SidebarNav';
import SourcingSearchBar from '@/components/sourcing/SourcingSearchBar';
import { cn } from '@/lib/utils';

export default function SourcingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 상품 상세·도구 페이지에는 전역 검색바 노출 (shop 목록은 자체 검색 보유)
  const showGlobalSearch = pathname !== '/shop';
  const isProductDetail = pathname.startsWith('/shop/');

  return (
    <div className="min-h-[calc(100vh-64px)]">
      {/* Desktop sidebar + main content */}
      <div className="md:flex">
        <SidebarNav />
        <main className="flex-1 min-w-0 bg-surface min-h-[calc(100vh-64px)]">
          {showGlobalSearch && (
            <div
              className={cn(
                'px-4 sm:px-6 lg:px-8',
                isProductDetail
                  ? 'sticky top-[calc(64px+var(--safe-area-top))] z-30 border-b border-border-light bg-surface/95 py-3 backdrop-blur'
                  : 'pt-4'
              )}
            >
              <div className="max-w-[1280px] mx-auto">
                <SourcingSearchBar variant="compact" />
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
