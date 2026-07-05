import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { generateOrderNumber } from '@/lib/utils';
import { getDomesticShippingFee } from '@/lib/shipping';
import type { BusinessInfo } from '@/types';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('sourcing_orders')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { items, total_cny, total_krw, service_fee, shipping_address, business_info, terms_agreed } = body as {
    items: Array<{ product_id: string; title: string; image: string; sku_name?: string; quantity: number; price_cny: number; price_krw: number }>;
    total_cny: number;
    total_krw: number;
    service_fee: number;
    shipping_address: { name?: string; phone?: string; address?: string; detail_address?: string; postal_code?: string } | null;
    business_info: Partial<BusinessInfo> | null;
    terms_agreed: { terms?: boolean; privacy?: boolean; coupang?: boolean } | null;
  };

  // 입력값 검증
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: '주문 상품이 없습니다.' }, { status: 400 });
  }

  for (const item of items) {
    if (!item.product_id || !item.title || typeof item.quantity !== 'number' || item.quantity < 1) {
      return NextResponse.json({ error: '상품 정보가 올바르지 않습니다.' }, { status: 400 });
    }
    if (typeof item.price_cny !== 'number' || item.price_cny <= 0 || typeof item.price_krw !== 'number' || item.price_krw <= 0) {
      return NextResponse.json({ error: '상품 가격이 올바르지 않습니다.' }, { status: 400 });
    }
  }

  if (typeof total_krw !== 'number' || total_krw <= 0) {
    return NextResponse.json({ error: '총 금액이 올바르지 않습니다.' }, { status: 400 });
  }

  // 배송지 검증 (필수)
  if (!shipping_address || !shipping_address.name || !shipping_address.phone || !shipping_address.address) {
    return NextResponse.json({ error: '배송지 정보를 입력해주세요.' }, { status: 400 });
  }

  // 사업자정보 검증 (B2B 필수)
  const regDigits = (business_info?.registration_number || '').replace(/\D/g, '');
  if (
    !business_info ||
    !business_info.company_name ||
    !business_info.representative ||
    !business_info.business_type ||
    !business_info.business_item ||
    !business_info.address ||
    regDigits.length !== 10
  ) {
    return NextResponse.json({ error: '사업자 정보를 모두 정확히 입력해주세요. (사업자등록번호 10자리)' }, { status: 400 });
  }

  // 약관 동의 검증 (이용약관/개인정보/쿠팡 로켓그로스)
  if (!terms_agreed || !terms_agreed.terms || !terms_agreed.privacy || !terms_agreed.coupang) {
    return NextResponse.json({ error: '필수 약관에 모두 동의해주세요.' }, { status: 400 });
  }

  // 배송비는 서버에서 배송지 기반으로 재계산 (클라이언트 값 신뢰하지 않음)
  const shipping_fee = getDomesticShippingFee(shipping_address);

  const normalizedBusinessInfo: BusinessInfo = {
    company_name: business_info.company_name,
    registration_number: regDigits.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3'),
    representative: business_info.representative,
    business_type: business_info.business_type,
    business_item: business_info.business_item,
    address: business_info.address,
  };

  // 최근 10초 내 동일 사용자의 주문이 있는지 확인 (중복 방지)
  const { data: recentOrder } = await supabase
    .from('sourcing_orders')
    .select('id')
    .eq('user_id', user.id)
    .gte('created_at', new Date(Date.now() - 10000).toISOString())
    .limit(1)
    .single();

  if (recentOrder) {
    return NextResponse.json({ error: '잠시 후 다시 시도해주세요. (중복 주문 방지)' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('sourcing_orders')
    .insert({
      user_id: user.id,
      order_number: generateOrderNumber(),
      items,
      total_cny: total_cny || 0,
      total_krw,
      service_fee: service_fee || 0,
      shipping_fee,
      shipping_address,
      business_info: normalizedBusinessInfo,
      terms_agreed: {
        terms: true,
        privacy: true,
        coupang: true,
        agreed_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 다음 주문 자동 입력을 위한 저장 (실패해도 주문에는 영향 없음)
  try {
    // 1) 사업자 정보 → 프로필에 저장 (체크아웃 프리필용)
    await supabase
      .from('profiles')
      .update({ business_info: normalizedBusinessInfo })
      .eq('id', user.id);

    // 2) 직접 입력한 배송지면 저장 목록에 자동 추가 (중복 제외)
    const { data: existing } = await supabase
      .from('shipping_addresses')
      .select('id, recipient, phone, address, address_detail')
      .eq('user_id', user.id);

    const norm = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim();
    const isDuplicate = (existing ?? []).some(
      (a) =>
        norm(a.recipient) === norm(shipping_address.name) &&
        norm(a.phone) === norm(shipping_address.phone) &&
        norm(a.address) === norm(shipping_address.address) &&
        norm(a.address_detail) === norm(shipping_address.detail_address)
    );

    if (!isDuplicate) {
      await supabase.from('shipping_addresses').insert({
        user_id: user.id,
        label: '최근 배송지',
        recipient: shipping_address.name,
        phone: shipping_address.phone,
        address: shipping_address.address,
        address_detail: shipping_address.detail_address || null,
        postal_code: shipping_address.postal_code || null,
        is_default: (existing ?? []).length === 0, // 첫 배송지는 기본으로
      });
    }
  } catch {
    // 프리필 저장 실패는 무시
  }

  return NextResponse.json(data, { status: 201 });
}
