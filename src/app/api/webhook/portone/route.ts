import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getPortonePayment, portoneMethodLabel, verifyPortoneWebhook } from '@/lib/portone';

/**
 * 포트원 V2 웹훅 — 결제 상태 동기화의 최종 안전망.
 * (브라우저 confirm이 유실돼도 웹훅으로 주문 상태가 맞춰진다)
 *
 * 1) Standard Webhooks 서명 검증 (PORTONE_WEBHOOK_SECRET)
 * 2) 웹훅 페이로드는 신뢰하지 않고 포트원 단건조회로 재확인
 * 3) sourcing_orders 상태 업데이트 (paid / cancelled)
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const verified = verifyPortoneWebhook(rawBody, {
    id: request.headers.get('webhook-id'),
    timestamp: request.headers.get('webhook-timestamp'),
    signature: request.headers.get('webhook-signature'),
  });
  if (!verified) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: { paymentId?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const paymentId = event.data?.paymentId;
  const type = event.type ?? '';
  // 결제 상태 변화 이벤트만 처리 (Transaction.Paid, Transaction.Cancelled 등)
  if (!paymentId || !type.startsWith('Transaction.')) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // 웹훅 내용은 신뢰하지 않는다 — 포트원 원장 재조회
  const payment = await getPortonePayment(paymentId);
  if (!payment) {
    // 일시 오류일 수 있으므로 5xx로 응답해 포트원이 재시도하게 한다
    return NextResponse.json({ error: 'lookup failed' }, { status: 502 });
  }

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('sourcing_orders')
    .select('id, status, total_krw, service_fee, shipping_fee')
    .eq('order_number', paymentId)
    .single();

  if (!order) {
    // 우리 주문이 아님 (다른 시스템 결제 등) — 정상 응답으로 재시도 중단
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (payment.status === 'PAID' && order.status === 'pending') {
    const expectedAmount =
      (order.total_krw ?? 0) + (order.shipping_fee ?? 0) + (order.service_fee ?? 0);
    if (payment.amount.total !== expectedAmount || payment.currency !== 'KRW') {
      console.error(
        `[webhook/portone] amount mismatch: order=${paymentId} expected=${expectedAmount} paid=${payment.amount.total} ${payment.currency}`
      );
      // 금액 불일치는 자동 확정하지 않고 관리자 확인 대상으로 남긴다
      return NextResponse.json({ ok: true, flagged: 'amount_mismatch' });
    }

    await supabase
      .from('sourcing_orders')
      .update({
        status: 'paid',
        payment_key: payment.transactionId || paymentId,
        payment_method: portoneMethodLabel(payment),
      })
      .eq('id', order.id)
      .eq('status', 'pending');
  } else if (
    (payment.status === 'CANCELLED' || payment.status === 'PARTIAL_CANCELLED') &&
    order.status === 'paid'
  ) {
    await supabase
      .from('sourcing_orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)
      .eq('status', 'paid');
  }

  return NextResponse.json({ ok: true });
}
