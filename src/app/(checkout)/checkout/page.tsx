'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import * as PortOne from '@portone/browser-sdk/v2';
import { ArrowLeft, Building2, CreditCard, MapPin, Search, ShieldCheck, Wallet } from 'lucide-react';
import { getCart, clearCart } from '@/lib/cart';
import { formatPrice } from '@/lib/utils';
import { createClient } from '@/lib/supabase';
import {
  DOMESTIC_SHIPPING_FEE,
  getDomesticShippingFee,
  getRemoteAreaSurcharge,
} from '@/lib/shipping';
import { openPostcodeSearch } from '@/lib/daum-postcode';
import Button from '@/components/ui/Button';
import type { SourcingCartItem, BusinessInfo } from '@/types';

interface SavedAddress {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  address: string;
  address_detail: string | null;
  postal_code: string | null;
  is_default: boolean;
}

const EMPTY_BUSINESS: BusinessInfo = {
  company_name: '',
  registration_number: '',
  representative: '',
  business_type: '',
  business_item: '',
  address: '',
};

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<SourcingCartItem[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('manual');
  const [manual, setManual] = useState({ name: '', phone: '', postal_code: '', address: '', detail_address: '' });
  const [business, setBusiness] = useState<BusinessInfo>(EMPTY_BUSINESS);
  const [agree, setAgree] = useState({ terms: false, privacy: false, coupang: false });
  const [payMethod, setPayMethod] = useState<'CARD' | 'EASY_PAY'>('CARD');
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 결제 실패 후 재시도 시 중복 주문 생성을 막기 위해 생성된 주문을 기억
  const [pendingOrder, setPendingOrder] = useState<{
    order_number: string;
    amount: number;
    orderName: string;
  } | null>(null);

  useEffect(() => {
    setItems(getCart());
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login?redirect=/checkout');
        return;
      }
      // 지난 주문에서 저장된 사업자 정보 자동 입력
      supabase
        .from('profiles')
        .select('business_info')
        .eq('id', data.user.id)
        .single()
        .then(({ data: profile }) => {
          const saved = profile?.business_info as Partial<BusinessInfo> | null;
          if (saved && saved.company_name) {
            setBusiness({ ...EMPTY_BUSINESS, ...saved });
          }
        });
      fetch('/api/addresses')
        .then((r) => (r.ok ? r.json() : []))
        .then((list: SavedAddress[]) => {
          if (Array.isArray(list) && list.length) {
            setAddresses(list);
            const def = list.find((a) => a.is_default) || list[0];
            setSelectedAddressId(def.id);
          }
        })
        .catch(() => {})
        .finally(() => setLoaded(true));
    });
  }, [router]);

  const subtotal = items.reduce((s, i) => s + i.price_krw * i.quantity, 0);
  const subtotalCny = items.reduce((s, i) => s + i.price_cny * i.quantity, 0);

  const shippingAddress = useMemo(() => {
    const sel = addresses.find((a) => a.id === selectedAddressId);
    if (sel) {
      return {
        name: sel.recipient,
        phone: sel.phone,
        address: sel.address,
        detail_address: sel.address_detail || '',
        postal_code: sel.postal_code || '',
      };
    }
    return {
      name: manual.name,
      phone: manual.phone,
      address: manual.address,
      detail_address: manual.detail_address,
      postal_code: manual.postal_code,
    };
  }, [addresses, selectedAddressId, manual]);

  const remoteSurcharge = getRemoteAreaSurcharge(shippingAddress);
  const shippingFee = getDomesticShippingFee(shippingAddress);
  const total = subtotal + shippingFee;

  const setBiz = (key: keyof BusinessInfo, value: string) =>
    setBusiness((prev) => ({ ...prev, [key]: value }));

  const handleAddressSearch = async () => {
    try {
      await openPostcodeSearch(({ zonecode, address }) => {
        setManual((m) => ({ ...m, postal_code: zonecode, address }));
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '주소 검색을 열 수 없습니다.');
    }
  };

  const handleBizAddressSearch = async () => {
    try {
      await openPostcodeSearch(({ address }) => {
        setBiz('address', address);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '주소 검색을 열 수 없습니다.');
    }
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error('주문할 상품이 없습니다.');
      return;
    }
    if (!shippingAddress.name || !shippingAddress.phone || !shippingAddress.address) {
      toast.error('배송지 정보를 입력해주세요.');
      return;
    }
    const regDigits = business.registration_number.replace(/\D/g, '');
    if (
      !business.company_name ||
      !business.representative ||
      !business.business_type ||
      !business.business_item ||
      !business.address ||
      regDigits.length !== 10
    ) {
      toast.error('사업자 정보를 모두 정확히 입력해주세요. (사업자등록번호 10자리)');
      return;
    }
    if (!agree.terms || !agree.privacy || !agree.coupang) {
      toast.error('필수 약관에 모두 동의해주세요.');
      return;
    }

    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
    const channelKey =
      payMethod === 'CARD'
        ? process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_CARD
        : process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_EASYPAY;
    if (!storeId || !channelKey) {
      toast.error('결제 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      // 1) 주문 생성 (결제 실패 후 재시도면 기존 pending 주문 재사용)
      let order = pendingOrder;
      if (!order) {
        const res = await fetch('/api/sourcing/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map((i) => ({
              product_id: i.product_id,
              title: i.title,
              image: i.image,
              sku_name: i.sku_name,
              quantity: i.quantity,
              price_cny: i.price_cny,
              price_krw: i.price_krw,
            })),
            total_cny: subtotalCny,
            total_krw: subtotal,
            shipping_address: shippingAddress,
            business_info: business,
            terms_agreed: agree,
          }),
        });

        if (res.status === 401) {
          router.replace('/login?redirect=/checkout');
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '주문 생성에 실패했습니다.' }));
          toast.error(err.error || '주문 생성에 실패했습니다.');
          return;
        }

        const created = await res.json();
        const orderName =
          items.length > 1 ? `${items[0].title} 외 ${items.length - 1}건` : items[0].title;
        order = {
          order_number: created.order_number as string,
          // 결제 금액은 서버가 확정한 값 기준 (배송비 서버 재계산 반영)
          amount:
            (created.total_krw ?? 0) + (created.shipping_fee ?? 0) + (created.service_fee ?? 0),
          orderName: orderName.slice(0, 100),
        };
        setPendingOrder(order);
      }

      // 2) 포트원 결제창 호출 (모바일은 redirectUrl로 이동 후 success 페이지에서 승인 확인)
      const payment = await PortOne.requestPayment({
        storeId,
        channelKey,
        paymentId: order.order_number,
        orderName: order.orderName,
        totalAmount: order.amount,
        currency: 'CURRENCY_KRW',
        payMethod,
        customer: {
          fullName: shippingAddress.name,
          phoneNumber: shippingAddress.phone,
        },
        redirectUrl: `${window.location.origin}/checkout/success`,
      });

      if (!payment || payment.code !== undefined) {
        // 사용자가 창을 닫았거나 결제 실패 — 주문은 pending으로 유지, 재시도 가능
        toast.error(payment?.message || '결제가 취소되었습니다.');
        return;
      }

      // 3) 서버 승인 확인 (금액·상태 검증)
      const confirmRes = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.paymentId }),
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) {
        toast.error(confirmData.error || '결제 확인에 실패했습니다. 고객센터로 문의해주세요.');
        router.push(`/checkout/fail?message=${encodeURIComponent(confirmData.error || '결제 확인 실패')}`);
        return;
      }

      clearCart();
      router.push(`/checkout/success?orderId=${order.order_number}&confirmed=1`);
    } catch (e) {
      // 실제 원인(포트원 SDK 등)을 화면·콘솔에 노출해 진단 가능하게
      console.error('[checkout] payment error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`결제 처리 중 오류: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loaded && items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <ShieldCheck className="w-12 h-12 text-muted-soft mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-ink mb-2">주문할 상품이 없습니다</h1>
        <Link href="/shop" className="text-primary hover:underline text-sm">소싱하러 가기</Link>
      </div>
    );
  }

  const inputCls = 'w-full px-3 py-2.5 border border-hairline rounded-[var(--radius-sm)] text-sm bg-canvas focus:outline-none focus:border-ink';

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/cart" className="text-muted hover:text-ink transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-ink">주문/결제</h1>
      </div>

      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2 space-y-6 mb-6 lg:mb-0">
          {/* 배송지 */}
          <section className="bg-canvas border border-hairline rounded-[var(--radius-md)] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-4">
              <MapPin className="w-4 h-4 text-primary" /> 배송지
            </h2>
            {addresses.length > 0 && (
              <div className="space-y-2 mb-4">
                {addresses.map((a) => (
                  <label key={a.id} className="flex items-start gap-2.5 p-3 border border-hairline rounded-[var(--radius-sm)] cursor-pointer hover:border-ink transition-colors">
                    <input
                      type="radio"
                      name="addr"
                      checked={selectedAddressId === a.id}
                      onChange={() => setSelectedAddressId(a.id)}
                      className="mt-1 accent-[var(--color-primary)]"
                    />
                    <div className="text-sm">
                      <p className="font-medium text-ink">
                        {a.label} · {a.recipient}
                        {a.is_default && <span className="ml-2 text-[11px] text-primary">기본</span>}
                      </p>
                      <p className="text-muted text-xs mt-0.5">{a.phone}</p>
                      <p className="text-muted text-xs">
                        {a.postal_code ? `(${a.postal_code}) ` : ''}{a.address} {a.address_detail || ''}
                      </p>
                    </div>
                  </label>
                ))}
                <label className="flex items-center gap-2.5 p-3 border border-hairline rounded-[var(--radius-sm)] cursor-pointer hover:border-ink transition-colors">
                  <input
                    type="radio"
                    name="addr"
                    checked={!addresses.some((a) => a.id === selectedAddressId)}
                    onChange={() => setSelectedAddressId('manual')}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="text-sm text-ink">새 배송지 직접 입력</span>
                </label>
              </div>
            )}

            {!addresses.some((a) => a.id === selectedAddressId) && (
              <div className="grid sm:grid-cols-2 gap-3">
                <input className={inputCls} placeholder="받는 분" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
                <input className={inputCls} placeholder="연락처 (010-0000-0000)" value={manual.phone} onChange={(e) => setManual({ ...manual, phone: e.target.value })} />
                <div className="sm:col-span-2 flex gap-2">
                  <input
                    className={`${inputCls} max-w-[150px] bg-surface-soft cursor-pointer`}
                    placeholder="우편번호"
                    value={manual.postal_code}
                    readOnly
                    onClick={handleAddressSearch}
                  />
                  <button
                    type="button"
                    onClick={handleAddressSearch}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-[var(--radius-sm)] border border-ink text-sm font-medium text-ink hover:bg-surface-soft transition-colors whitespace-nowrap"
                  >
                    <Search className="w-4 h-4" />
                    주소 찾기
                  </button>
                </div>
                <input
                  className={`${inputCls} sm:col-span-2 bg-surface-soft cursor-pointer`}
                  placeholder="주소 (주소 찾기로 입력)"
                  value={manual.address}
                  readOnly
                  onClick={handleAddressSearch}
                />
                <input
                  className={`${inputCls} sm:col-span-2`}
                  placeholder="상세 주소 입력 (동/호수 등)"
                  value={manual.detail_address}
                  onChange={(e) => setManual({ ...manual, detail_address: e.target.value })}
                />
              </div>
            )}
          </section>

          {/* 사업자 정보 (필수) */}
          <section className="bg-canvas border border-hairline rounded-[var(--radius-md)] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold mb-1">
              <Building2 className="w-4 h-4 text-primary" /> 사업자 정보 <span className="text-error">*</span>
            </h2>
            <p className="text-xs text-muted mb-4">세금계산서 발행 및 수입 신고를 위해 정확히 입력해주세요. (B2B 전용)</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input className={inputCls} placeholder="상호 (회사명)" value={business.company_name} onChange={(e) => setBiz('company_name', e.target.value)} />
              <input className={inputCls} placeholder="사업자등록번호 (10자리)" value={business.registration_number} onChange={(e) => setBiz('registration_number', e.target.value)} />
              <input className={inputCls} placeholder="대표자명" value={business.representative} onChange={(e) => setBiz('representative', e.target.value)} />
              <div className="hidden sm:block" />
              <input className={inputCls} placeholder="업태 (예: 도소매)" value={business.business_type} onChange={(e) => setBiz('business_type', e.target.value)} />
              <input className={inputCls} placeholder="종목 (예: 전자상거래)" value={business.business_item} onChange={(e) => setBiz('business_item', e.target.value)} />
              <div className="sm:col-span-2 flex gap-2">
                <input
                  className={inputCls}
                  placeholder="사업장 주소 (주소 찾기 후 상세주소를 이어서 입력)"
                  value={business.address}
                  onChange={(e) => setBiz('address', e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleBizAddressSearch}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-[var(--radius-sm)] border border-ink text-sm font-medium text-ink hover:bg-surface-soft transition-colors whitespace-nowrap"
                >
                  <Search className="w-4 h-4" />
                  주소 찾기
                </button>
              </div>
            </div>
          </section>

          {/* 약관 동의 */}
          <section className="bg-canvas border border-hairline rounded-[var(--radius-md)] p-5">
            <h2 className="text-sm font-semibold mb-3">약관 동의 <span className="text-error">*</span></h2>

            <div className="bg-surface rounded-[var(--radius-sm)] p-3 mb-3 text-[11px] text-muted leading-relaxed max-h-28 overflow-y-auto">
              <strong className="text-ink">쿠팡 로켓그로스 입고 안내</strong><br />
              소싱한 상품을 쿠팡 로켓그로스로 입고하실 경우 원산지 표시(예: Made in China), 상품/박스 바코드 부착,
              쿠팡 입고·포장·라벨 규정 준수가 필요합니다. 관련 준비 및 규정 위반에 따른 책임은 셀러(주문자)에게 있으며,
              본 서비스는 1688 소싱·통관·배송 대행만 제공합니다.
            </div>

            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agree.terms} onChange={(e) => setAgree({ ...agree, terms: e.target.checked })} className="accent-[var(--color-primary)]" />
                <span className="text-ink">[필수] <Link href="/terms" target="_blank" className="text-primary hover:underline">이용약관</Link>에 동의합니다</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agree.privacy} onChange={(e) => setAgree({ ...agree, privacy: e.target.checked })} className="accent-[var(--color-primary)]" />
                <span className="text-ink">[필수] <Link href="/privacy" target="_blank" className="text-primary hover:underline">개인정보 처리방침</Link>에 동의합니다</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agree.coupang} onChange={(e) => setAgree({ ...agree, coupang: e.target.checked })} className="accent-[var(--color-primary)]" />
                <span className="text-ink">[필수] 쿠팡 로켓그로스 입고 안내를 확인했습니다</span>
              </label>
            </div>
          </section>
        </div>

        {/* 결제 요약 */}
        <div className="lg:col-span-1">
          <div className="bg-canvas border border-hairline rounded-[var(--radius-md)] p-5 sticky top-4">
            <h2 className="text-sm font-semibold mb-4">결제 요약</h2>
            <div className="space-y-2.5 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-muted">상품 금액 ({items.length})</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">국내 배송비</span>
                <span>{formatPrice(DOMESTIC_SHIPPING_FEE)}</span>
              </div>
              {remoteSurcharge > 0 && (
                <div className="flex justify-between text-warning">
                  <span>제주·도서산간 할증</span>
                  <span>+{formatPrice(remoteSurcharge)}</span>
                </div>
              )}
              <div className="border-t border-hairline pt-2.5 flex justify-between font-bold text-base">
                <span>총 결제 금액</span>
                <span className="text-primary">{formatPrice(total)}</span>
              </div>
            </div>

            {/* 결제수단 선택 */}
            <div className="mb-4">
              <p className="text-sm font-semibold mb-2">결제수단</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMethod('CARD')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 border rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
                    payMethod === 'CARD'
                      ? 'border-ink bg-surface text-ink'
                      : 'border-hairline text-muted hover:border-ink'
                  }`}
                >
                  <CreditCard className="w-4 h-4" /> 카드결제
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod('EASY_PAY')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 border rounded-[var(--radius-sm)] text-sm font-medium transition-colors ${
                    payMethod === 'EASY_PAY'
                      ? 'border-ink bg-surface text-ink'
                      : 'border-hairline text-muted hover:border-ink'
                  }`}
                >
                  <Wallet className="w-4 h-4" /> 간편결제
                </button>
              </div>
            </div>

            <Button className="w-full" onClick={handleSubmit} isLoading={submitting}>
              {formatPrice(total)} 결제하기
            </Button>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              결제 완료 후 소싱이 진행됩니다. 해외 국제운송·통관비는 별도 안내됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
