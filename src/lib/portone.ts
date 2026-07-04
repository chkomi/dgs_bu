/**
 * 포트원(PortOne) V2 서버 헬퍼 — 서버 전용 (API Secret 사용)
 *
 * - getPortonePayment(): 결제 단건조회. 클라이언트가 보낸 금액을 절대 신뢰하지 않고
 *   포트원 원장으로 상태·금액을 검증하는 데 사용한다.
 * - verifyPortoneWebhook(): V2 웹훅 서명 검증 (Standard Webhooks 규격,
 *   HMAC-SHA256 + webhook-id/timestamp/signature 헤더).
 */

import crypto from 'node:crypto';

const PORTONE_API_BASE = 'https://api.portone.io';

/** 결제 단건조회 응답에서 사용하는 필드만 추린 타입 */
export interface PortonePayment {
  status:
    | 'READY'
    | 'PAY_PENDING'
    | 'PAID'
    | 'FAILED'
    | 'CANCELLED'
    | 'PARTIAL_CANCELLED'
    | 'VIRTUAL_ACCOUNT_ISSUED';
  id: string; // paymentId (우리 order_number)
  transactionId?: string;
  orderName?: string;
  amount: { total: number; paid?: number; cancelled?: number };
  currency: string;
  method?: { type?: string; provider?: string; card?: unknown; easyPay?: { provider?: string } };
  customData?: string;
}

/**
 * 포트원 결제 단건조회. 실패 시 null.
 */
export async function getPortonePayment(paymentId: string): Promise<PortonePayment | null> {
  const secret = process.env.PORTONE_V2_API_SECRET;
  if (!secret) return null;

  try {
    const res = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: { Authorization: `PortOne ${secret}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as PortonePayment;
  } catch {
    return null;
  }
}

/** method.type → 사용자 표시용 결제수단 문자열 */
export function portoneMethodLabel(payment: PortonePayment): string {
  const type = payment.method?.type ?? '';
  if (type.includes('EasyPay')) {
    const provider = payment.method?.easyPay?.provider;
    return provider ? `간편결제(${provider})` : '간편결제';
  }
  if (type.includes('Card')) return '카드';
  if (type.includes('VirtualAccount')) return '가상계좌';
  if (type.includes('Transfer')) return '계좌이체';
  return type || '기타';
}

const WEBHOOK_TOLERANCE_SEC = 5 * 60;

/**
 * 포트원 V2 웹훅 서명 검증 (Standard Webhooks).
 * @param rawBody  요청 본문 원문 문자열 (파싱 전!)
 * @returns 검증 통과 여부
 */
export function verifyPortoneWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null }
): boolean {
  const secretEnv = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secretEnv || !headers.id || !headers.timestamp || !headers.signature) return false;

  // 재전송 공격 방지: 타임스탬프 허용 오차 검사
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_SEC) return false;

  // 시크릿은 "whsec_" 접두사 + base64 페이로드
  const secretB64 = secretEnv.startsWith('whsec_') ? secretEnv.slice(6) : secretEnv;
  let key: Buffer;
  try {
    key = Buffer.from(secretB64, 'base64');
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  // 헤더는 "v1,<sig>" 형식이 공백 구분으로 여러 개 올 수 있음
  for (const part of headers.signature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}
