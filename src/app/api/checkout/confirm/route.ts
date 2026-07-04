import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getPortonePayment, portoneMethodLabel } from '@/lib/portone';

/**
 * 포트원 V2 결제 승인 확인.
 * 클라이언트는 paymentId(= order_number)만 보내고, 금액·상태는 반드시
 * 포트원 단건조회 원장과 DB 주문 금액을 대조해 검증한다.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let paymentId: string;
  try {
    const body = await request.json();
    paymentId = String(body.paymentId || '');
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId가 필요합니다.' }, { status: 400 });
  }

  // 1) 주문 조회 (본인 주문만)
  const { data: order, error: orderError } = await supabase
    .from('sourcing_orders')
    .select('id, order_number, status, total_krw, service_fee, shipping_fee')
    .eq('order_number', paymentId)
    .eq('user_id', user.id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: '주문을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 이미 처리된 주문이면 그대로 성공 반환 (웹훅과의 경합 대비, 멱등)
  if (order.status === 'paid') {
    return NextResponse.json({ success: true, status: 'paid' });
  }
  if (order.status !== 'pending') {
    return NextResponse.json({ error: '결제 가능한 주문 상태가 아닙니다.' }, { status: 409 });
  }

  // 2) 포트원 원장 단건조회
  const payment = await getPortonePayment(paymentId);
  if (!payment) {
    return NextResponse.json({ error: '결제 정보를 확인할 수 없습니다.' }, { status: 502 });
  }

  if (payment.status !== 'PAID') {
    return NextResponse.json(
      { error: `결제가 완료되지 않았습니다. (상태: ${payment.status})` },
      { status: 400 }
    );
  }

  // 3) 금액 검증 — 위·변조 방지의 핵심
  const expectedAmount =
    (order.total_krw ?? 0) + (order.shipping_fee ?? 0) + (order.service_fee ?? 0);
  if (payment.amount.total !== expectedAmount || payment.currency !== 'KRW') {
    console.error(
      `[checkout/confirm] amount mismatch: order=${order.order_number} expected=${expectedAmount} paid=${payment.amount.total} ${payment.currency}`
    );
    return NextResponse.json(
      { error: '결제 금액이 주문 금액과 일치하지 않습니다. 고객센터로 문의해주세요.' },
      { status: 400 }
    );
  }

  // 4) 주문 확정
  const { error: updateError } = await supabase
    .from('sourcing_orders')
    .update({
      status: 'paid',
      payment_key: payment.transactionId || paymentId,
      payment_method: portoneMethodLabel(payment),
    })
    .eq('id', order.id)
    .eq('user_id', user.id)
    .eq('status', 'pending'); // 동시 요청 멱등 보장

  if (updateError) {
    return NextResponse.json({ error: '주문 상태 업데이트에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: 'paid', orderNumber: order.order_number });
}
