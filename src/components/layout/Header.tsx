'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, User, LogOut, ShoppingCart } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { getCartCount } from '@/lib/cart';
import { setClientUser } from '@/lib/client-scope';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import MobileMenu from './MobileMenu';

export default function Header() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setClientUser(data.user?.id ?? null); // 계정별 로컬 상태(장바구니·최근본상품·검색어) 활성화
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setClientUser(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setCartCount(getCartCount());
    const onStorage = () => setCartCount(getCartCount());
    window.addEventListener('storage', onStorage);
    window.addEventListener('cart-updated', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cart-updated', onStorage);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-40 transition-all duration-200',
          isScrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-white'
        )}
        style={{ paddingTop: 'var(--safe-area-top)' }}
      >
        <div className="mx-auto px-2 sm:px-3 lg:px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-1 lg:gap-2">
              <Link href="/" className="flex items-center gap-2 text-xl font-bold text-primary flex-shrink-0">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="28" height="28" rx="8" fill="#ff385c" />
                  <path d="M8 14.5L12.5 19L20 9.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="20" cy="8" r="3" fill="#ff7a90" />
                </svg>
                <span className="hidden sm:inline">딸깍소싱</span>
              </Link>
            </div>

            {/* Right: Cart + Auth */}
            <div className="flex items-center gap-2 lg:gap-3">
              <Link
                href="/cart"
                className="relative p-2 text-text-secondary hover:text-primary transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>

              {user ? (
                <div className="hidden md:flex items-center gap-3">
                  <Link
                    href="/mypage"
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
                  >
                    <User className="w-4 h-4" />
                    마이페이지
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-danger transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="hidden md:inline-flex items-center px-4 py-2 bg-primary text-white text-[15px] font-bold rounded-[var(--radius-md)] hover:bg-primary-60 transition-colors"
                >
                  로그인
                </Link>
              )}

              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="md:hidden p-2 text-text-secondary hover:text-primary transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        user={user}
        onLogout={handleLogout}
      />

      <div className="h-16" style={{ marginTop: 'var(--safe-area-top)' }} />
    </>
  );
}
