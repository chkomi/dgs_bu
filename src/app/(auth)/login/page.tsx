'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/mypage';
  const queryError = searchParams.get('error');
  const [hashError, setHashError] = useState<string | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [agreePrivacy, setAgreePrivacy] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const canLogin = agreeTerms && agreePrivacy;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLogin || emailLoading) return;
    setEmailLoading(true);
    setEmailError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setEmailError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setEmailLoading(false);
      return;
    }
    window.location.href = redirect;
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const desc = params.get('error_description');
      if (desc) setHashError(decodeURIComponent(desc));
    }
  }, []);

  const errorMessage = hashError || (queryError === 'auth_failed' ? '로그인에 실패했습니다. 다시 시도해주세요.' : null);

  const handleOAuth = async (provider: 'google' | 'kakao') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/callback?redirect=${encodeURIComponent(redirect)}`,
        ...(provider === 'kakao' && {
          scopes: 'account_email profile_nickname',
        }),
      },
    });
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">로그인</h1>
          <p className="text-sm text-text-tertiary">소셜 계정으로 간편하게 시작하세요</p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-3 bg-danger-5 border border-danger/20 rounded-[var(--radius-md)] text-sm text-danger">
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => handleOAuth('google')}
            disabled={!canLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-[var(--radius-md)] hover:bg-surface transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google로 계속하기
          </button>

          <button
            onClick={() => handleOAuth('kakao')}
            disabled={!canLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#FEE500] rounded-[var(--radius-md)] hover:bg-[#FDD800] transition-colors text-sm font-medium text-[#191919] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#FEE500]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#191919">
              <path d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24l-1.12 4.16a.37.37 0 00.56.4l4.83-3.2c.44.04.89.06 1.35.06 5.52 0 10-3.36 10-7.5S17.52 3 12 3z" />
            </svg>
            카카오로 계속하기
          </button>
        </div>

        {/* 이메일/비밀번호 로그인 */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-text-tertiary">또는 이메일로 로그인</span>
          <div className="flex-1 border-t border-border" />
        </div>
        <form onSubmit={handleEmailLogin} className="space-y-2.5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoComplete="email"
            className="w-full px-4 py-3 border border-border rounded-[var(--radius-md)] text-sm focus:outline-none focus:border-primary"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="w-full px-4 py-3 border border-border rounded-[var(--radius-md)] text-sm focus:outline-none focus:border-primary"
          />
          {emailError && <p className="text-xs text-danger">{emailError}</p>}
          <button
            type="submit"
            disabled={!canLogin || emailLoading || !email || !password}
            className="w-full px-4 py-3 bg-primary text-white rounded-[var(--radius-md)] text-sm font-bold hover:bg-primary-60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {emailLoading ? '로그인 중...' : '이메일로 로그인'}
          </button>
        </form>

        <div className="mt-6 space-y-2.5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
            />
            <span className="text-xs text-text-secondary">
              <span className="text-primary font-semibold">[필수]</span>{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">
                이용약관
              </a>에 동의합니다
            </span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
            />
            <span className="text-xs text-text-secondary">
              <span className="text-primary font-semibold">[필수]</span>{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">
                개인정보처리방침
              </a>에 동의합니다
            </span>
          </label>
          {!canLogin && (
            <p className="text-[11px] text-text-tertiary pl-6">약관에 모두 동의해야 로그인할 수 있습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
