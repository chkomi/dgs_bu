'use client';

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, ImagePlus, X, Upload, ArrowUpDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import ProductCard from '@/components/sourcing/ProductCard';
import FilterSidebar from '@/components/sourcing/FilterSidebar';
import { useShopFilters } from '@/lib/sourcing/use-shop-filters';
import {
  applyClientFilters,
  countActiveFilters,
  SORT_OPTIONS,
} from '@/lib/sourcing/filters';
import { cn } from '@/lib/utils';
import { saveRecentSearch } from '@/lib/recent-searches';
import type { SourcingProduct, SourcingCategory, PaginatedResponse } from '@/types';

const WISHLIST_KEY = 'ddalkkak-wishlist';
const POPULAR_KEYWORDS = [
  '블루투스 이어폰', '후드티', '텀블러', '무선 마우스', '레깅스',
  '에어팟 케이스', '캠핑 용품', '주방 용품', '반려동물 용품', '운동화',
  '선글라스', '파우치', '충전기', '스티커', '미니 선풍기',
];

// 1688 URL 또는 순수 상품 ID에서 product_id 추출
function extract1688Id(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{10,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/offer\/(\d+)|detail\.1688\.com[^/]*\/(\d{10,})|[?&]offerId=(\d+)/);
  if (match) return match[1] || match[2] || match[3];
  return null;
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="p-6 lg:p-8">로딩 중...</div>}>
      <ShopPageInner />
    </Suspense>
  );
}

function ShopPageInner() {
  const router = useRouter();
  const { filters, update, reset } = useShopFilters();

  // 검색바 입력 (즉시 URL 반영하지 않고 form submit 시 반영)
  const [searchInput, setSearchInput] = useState(filters.keyword);
  useEffect(() => {
    setSearchInput(filters.keyword);
  }, [filters.keyword]);

  const [searchMode, setSearchMode] = useState<'keyword' | 'image'>('keyword');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isImageSearching, setIsImageSearching] = useState(false);
  const [imageResults, setImageResults] = useState<SourcingProduct[] | null>(null);
  const [similarSearchSource, setSimilarSearchSource] = useState<string | null>(null);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [popularPage, setPopularPage] = useState(0);
  const [wishlistSet, setWishlistSet] = useState<Set<string>>(new Set());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const POPULAR_PAGE_SIZE = 6;
  const popularTotalPages = Math.ceil(POPULAR_KEYWORDS.length / POPULAR_PAGE_SIZE);
  const visibleKeywords = POPULAR_KEYWORDS.slice(
    popularPage * POPULAR_PAGE_SIZE,
    (popularPage + 1) * POPULAR_PAGE_SIZE
  );

  // 사용자명 & 취향 카테고리 + 찜 목록 로드
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setIsLoggedIn(true);
        supabase
          .from('profiles')
          .select('preferred_categories')
          .eq('id', data.user.id)
          .single()
          .then(({ data: profile }) => {
            if (profile?.preferred_categories?.length) {
              setPreferredCategories(profile.preferred_categories);
            }
          });
        fetch('/api/sourcing/wishlist')
          .then((r) => r.json())
          .then((items: { product_id: string }[]) => {
            if (Array.isArray(items)) {
              setWishlistSet(new Set(items.map((i) => i.product_id)));
            }
          })
          .catch(() => {});
      } else {
        setIsLoggedIn(false);
        try {
          const local = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
          if (Array.isArray(local)) {
            setWishlistSet(new Set(local.map((i: { product_id: string }) => i.product_id)));
          }
        } catch {}
      }
    });
  }, []);

  const handleToggleWishlist = useCallback(
    async (product: SourcingProduct) => {
      const id = product.product_id;
      const wasWishlisted = wishlistSet.has(id);

      setWishlistSet((prev) => {
        const next = new Set(prev);
        if (wasWishlisted) next.delete(id);
        else next.add(id);
        return next;
      });

      const payload = {
        product_id: id,
        title: product.title,
        title_zh: product.title_zh,
        image: product.images[0] || '',
        price_krw: product.price_krw,
        price_cny: product.price_cny,
        seller_name: product.seller?.name,
      };

      try {
        if (isLoggedIn) {
          if (wasWishlisted) {
            await fetch(`/api/sourcing/wishlist?product_id=${id}`, { method: 'DELETE' });
            toast.success('찜 해제');
          } else {
            await fetch('/api/sourcing/wishlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            toast.success('찜 목록에 추가');
          }
        } else {
          const local = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
          const filtered = local.filter((i: { product_id: string }) => i.product_id !== id);
          if (wasWishlisted) {
            localStorage.setItem(WISHLIST_KEY, JSON.stringify(filtered));
            toast.success('찜 해제');
          } else {
            filtered.push({ ...payload, added_at: new Date().toISOString() });
            localStorage.setItem(WISHLIST_KEY, JSON.stringify(filtered));
            toast.success('찜 목록에 추가');
          }
        }
      } catch {
        setWishlistSet((prev) => {
          const next = new Set(prev);
          if (wasWishlisted) next.add(id);
          else next.delete(id);
          return next;
        });
        toast.error('잠시 후 다시 시도해주세요');
      }
    },
    [isLoggedIn, wishlistSet]
  );

  const { data: categories } = useQuery<SourcingCategory[]>({
    queryKey: ['sourcing-categories'],
    queryFn: () => fetch('/api/sourcing/categories').then((r) => r.json()),
  });

  // 서버 필터: keyword + category + sort 만 키에 포함 (캐시 재사용 극대화)
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<SourcingProduct>>({
    queryKey: [
      'sourcing-search',
      { keyword: filters.keyword, category: filters.category, sort: filters.sort },
    ],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.keyword) params.set('keyword', filters.keyword);
      if (filters.category) params.set('category', filters.category);
      params.set('sort', filters.sort);
      params.set('page', String(pageParam));
      params.set('per_page', '10');
      return fetch(`/api/sourcing/search?${params}`).then((r) => r.json());
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    enabled: !imageResults,
    staleTime: 5 * 60 * 1000,
  });

  // 무한 스크롤
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // 클라이언트 필터 적용 + raw 결과
  const rawProducts = imageResults || infiniteData?.pages.flatMap((p) => p.data) || [];
  const displayProducts = useMemo(
    () => applyClientFilters(rawProducts, filters),
    [rawProducts, filters]
  );

  // 다중 클라이언트 필터로 결과가 적게 남으면 자동 추가 prefetch (최대 5번)
  const prefetchCountRef = useRef(0);
  const filterFingerprint = useMemo(
    () =>
      JSON.stringify({
        priceMin: filters.priceMin,
        priceMax: filters.priceMax,
        priceCurrency: filters.priceCurrency,
        rating: filters.rating,
        repurchase: filters.repurchase,
        shipping: filters.shipping,
        features: filters.features,
      }),
    [filters]
  );
  useEffect(() => {
    prefetchCountRef.current = 0;
  }, [filterFingerprint, filters.keyword, filters.category, filters.sort]);

  useEffect(() => {
    if (imageResults) return;
    if (countActiveFilters(filters) === 0) return;
    if (displayProducts.length >= 12) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (prefetchCountRef.current >= 5) return;
    prefetchCountRef.current += 1;
    fetchNextPage();
  }, [
    displayProducts.length,
    filters,
    hasNextPage,
    imageResults,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();

    const extractedId = extract1688Id(trimmed);
    if (extractedId) {
      router.push(`/shop/${extractedId}`);
      return;
    }

    setImageResults(null);
    setSimilarSearchSource(null);
    update({ keyword: trimmed });
    if (trimmed) {
      saveRecentSearch(trimmed);
      window.dispatchEvent(new Event('recent-updated'));
      fetch('/api/sourcing/search-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed }),
      }).catch(() => {});
    }
  };

  const handlePopularKeywordClick = (kw: string) => {
    setSearchInput(kw);
    setImageResults(null);
    setSimilarSearchSource(null);
    update({ keyword: kw });
    saveRecentSearch(kw);
    window.dispatchEvent(new Event('recent-updated'));
    fetch('/api/sourcing/search-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: kw }),
    }).catch(() => {});
  };

  const searchByImageUrl = async (imageUrl: string, showAsSource?: boolean) => {
    setIsImageSearching(true);
    setImagePreview(imageUrl);
    setSearchMode('image');
    if (showAsSource) setSimilarSearchSource(imageUrl);
    try {
      const res = await fetch('/api/sourcing/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.data) {
        setImageResults(data.data);
      }
    } catch {
      toast.error('이미지 검색에 실패했습니다');
    } finally {
      setIsImageSearching(false);
    }
  };

  const handleImageSelect = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setIsImageSearching(true);
    setSimilarSearchSource(null);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(file);
      });

      const res = await fetch('/api/sourcing/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: base64 }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.data) {
        setImageResults(data.data);
      }
    } catch {
      toast.error('이미지 검색에 실패했습니다');
    } finally {
      setIsImageSearching(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleImageSelect(file);
    }
  };

  const clearImageSearch = () => {
    setImagePreview(null);
    setImageResults(null);
    setSimilarSearchSource(null);
    setSearchMode('keyword');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totalCount = infiniteData?.pages[0]?.total ?? 0;

  // 취향 카테고리를 앞으로 정렬
  const sortedCategories = categories
    ? [
        ...(categories.filter((c) => preferredCategories.includes(c.name))),
        ...(categories.filter((c) => !preferredCategories.includes(c.name))),
      ]
    : [];

  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">아이템 검색</h1>
        <p className="text-sm text-muted mt-1">1688에서 원하는 상품을 키워드, URL 또는 이미지로 검색하세요</p>
      </div>

      {/* Search Section */}
      <div className="bg-canvas rounded-[var(--radius-md)] border border-hairline p-5 mb-6">
        {/* Search Mode Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setSearchMode('keyword'); clearImageSearch(); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              searchMode === 'keyword' ? 'bg-ink text-on-primary' : 'bg-canvas text-ink border border-hairline hover:border-ink'
            )}
          >
            <Search className="w-3.5 h-3.5" />
            키워드 검색
          </button>
          <button
            onClick={() => setSearchMode('image')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              searchMode === 'image' ? 'bg-ink text-on-primary' : 'bg-canvas text-ink border border-hairline hover:border-ink'
            )}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            이미지 검색
          </button>
        </div>

        {searchMode === 'keyword' ? (
          <>
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="상품명, 1688 URL 또는 상품 ID를 입력하세요"
                  className="w-full pl-11 pr-4 py-3 border border-hairline rounded-[var(--radius-sm)] text-sm focus:outline-none focus:border-2 focus:border-ink focus:px-[calc(2.75rem-1px)] focus:py-[11px] bg-canvas"
                />
              </div>
              <Button type="submit" size="lg">
                검색
              </Button>
            </form>

            {/* 인기 검색어 슬라이더 */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-muted flex-shrink-0 font-medium">🔥 인기</span>
              <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
                {visibleKeywords.map((kw) => (
                  <button
                    key={kw}
                    onClick={() => handlePopularKeywordClick(kw)}
                    className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs bg-canvas text-ink hover:border-ink transition-colors border border-hairline"
                  >
                    {kw}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => setPopularPage((p) => (p - 1 + popularTotalPages) % popularTotalPages)}
                  className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-ink transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPopularPage((p) => (p + 1) % popularTotalPages)}
                  className="w-6 h-6 flex items-center justify-center rounded text-muted hover:text-ink transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-hairline rounded-[var(--radius-md)] p-8 text-center"
          >
            {imagePreview ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="검색 이미지" className="w-32 h-32 object-cover rounded-[var(--radius-sm)]" />
                  <button
                    onClick={clearImageSearch}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-error text-on-primary rounded-full flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {isImageSearching && (
                  <p className="text-sm text-primary animate-pulse-soft">이미지로 상품 검색 중...</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-10 h-10 text-muted" />
                <div>
                  <p className="text-sm font-medium text-ink">이미지를 드래그하거나 클릭하여 업로드</p>
                  <p className="text-xs text-muted mt-1">JPG, PNG 형식 지원</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  이미지 선택
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />
          </div>
        )}
      </div>

      {/* Similar Search Source Banner */}
      {similarSearchSource && imageResults && (
        <div className="flex items-center gap-3 bg-canvas border border-hairline rounded-[var(--radius-md)] p-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={similarSearchSource} alt="" className="w-12 h-12 object-cover rounded-[var(--radius-sm)] flex-shrink-0" referrerPolicy="no-referrer" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink">유사 상품 검색 결과</p>
            <p className="text-xs text-muted">이 이미지와 비슷한 상품 {imageResults.length}개를 찾았습니다</p>
          </div>
          <button onClick={clearImageSearch} className="text-xs text-ink hover:underline flex-shrink-0">
            검색 초기화
          </button>
        </div>
      )}

      {/* Category Pills (Phase 3 에서 nav bar 화) */}
      {!imageResults && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => update({ category: '' })}
            className={cn(
              'flex-shrink-0 h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              !filters.category ? 'bg-ink text-on-primary' : 'bg-canvas text-ink border border-hairline hover:border-ink'
            )}
          >
            전체
          </button>
          {sortedCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => update({ category: cat.name })}
              className={cn(
                'flex-shrink-0 h-8 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                filters.category === cat.name
                  ? 'bg-ink text-on-primary'
                  : 'bg-canvas text-ink border border-hairline hover:border-ink'
              )}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Main: sidebar + results */}
      <div className="flex gap-5 lg:gap-6">
        {/* Desktop sidebar */}
        {!imageResults && (
          <FilterSidebar
            filters={filters}
            onChange={update}
            onReset={reset}
            resultCount={displayProducts.length}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Sort + Mobile filter trigger */}
          {!imageResults && (
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <button
                onClick={() => setMobileFilterOpen(true)}
                className={cn(
                  'lg:hidden inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm font-medium',
                  activeFilterCount > 0 ? 'bg-ink text-on-primary border-ink' : 'bg-canvas text-ink border-hairline'
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
              </button>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1 min-w-0">
                <ArrowUpDown className="w-4 h-4 text-muted flex-shrink-0" />
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ sort: opt.value })}
                    className={cn(
                      'flex-shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors',
                      filters.sort === opt.value
                        ? 'bg-ink text-on-primary'
                        : 'bg-canvas border border-hairline text-ink hover:border-ink'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {isLoading || isImageSearching ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-square w-full rounded-[var(--radius-md)]" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {!similarSearchSource && (
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted">
                    {imageResults ? (
                      <>이미지 검색 결과 <strong className="text-ink">{displayProducts.length}</strong>개</>
                    ) : (
                      <>총 <strong className="text-ink">{totalCount}</strong>개 상품
                        {activeFilterCount > 0 && (
                          <span className="ml-1 text-primary">(필터 적용: {displayProducts.length}개)</span>
                        )}
                      </>
                    )}
                  </p>
                  {imageResults && (
                    <button onClick={clearImageSearch} className="text-xs text-ink hover:underline">
                      검색 초기화
                    </button>
                  )}
                </div>
              )}

              {displayProducts.length === 0 ? (
                <div className="bg-canvas rounded-[var(--radius-md)] border border-hairline py-20 text-center">
                  <Search className="w-12 h-12 text-muted-soft mx-auto mb-4" />
                  <p className="text-ink font-semibold mb-1">검색 결과가 없습니다</p>
                  <p className="text-sm text-muted">
                    {activeFilterCount > 0 ? '필터를 줄여서 다시 시도해보세요' : '다른 키워드로 검색해보세요'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
                  {displayProducts.map((product) => (
                    <ProductCard
                      key={product.product_id}
                      product={product}
                      isWishlisted={wishlistSet.has(product.product_id)}
                      onToggleWishlist={handleToggleWishlist}
                      onSimilarSearch={(url) => {
                        searchByImageUrl(url, true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                  ))}
                </div>
              )}

              {/* 무한 스크롤 sentinel */}
              {!imageResults && (
                <div ref={sentinelRef} className="h-12 flex items-center justify-center mt-8">
                  {isFetchingNextPage && (
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 bg-primary/40 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  )}
                  {!hasNextPage && displayProducts.length > 0 && (
                    <p className="text-xs text-muted">모든 상품을 불러왔습니다</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {!imageResults && (
        <FilterSidebar
          filters={filters}
          onChange={update}
          onReset={reset}
          isOpen={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          resultCount={displayProducts.length}
        />
      )}
    </div>
  );
}
