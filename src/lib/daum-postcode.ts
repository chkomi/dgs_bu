/**
 * 다음(카카오) 우편번호 서비스 로더 — 도로명/지번 주소 검색.
 * 무료·무키. 스크립트를 1회 로드하고 팝업으로 검색창을 연다.
 */
const SCRIPT_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

interface DaumPostcodeData {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  address: string;
  buildingName: string;
  userSelectedType: 'R' | 'J';
}

interface DaumPostcodeConstructor {
  new (options: { oncomplete: (data: DaumPostcodeData) => void }): { open: () => void };
}

declare global {
  interface Window {
    daum?: { Postcode?: DaumPostcodeConstructor };
  }
}

let loadingPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loadingPromise = null;
      reject(new Error('주소 검색 서비스를 불러오지 못했습니다.'));
    };
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export interface PostcodeResult {
  zonecode: string; // 우편번호(5자리)
  address: string; // 도로명 주소 (없으면 지번)
  buildingName: string;
}

/** 우편번호 검색 팝업을 열고 선택 결과를 콜백으로 반환 */
export async function openPostcodeSearch(onComplete: (r: PostcodeResult) => void): Promise<void> {
  await loadScript();
  const Postcode = window.daum?.Postcode;
  if (!Postcode) throw new Error('주소 검색 서비스를 사용할 수 없습니다.');
  new Postcode({
    oncomplete: (data) => {
      const base = data.userSelectedType === 'J' ? data.jibunAddress : data.roadAddress;
      onComplete({
        zonecode: data.zonecode,
        address: base || data.address,
        buildingName: data.buildingName || '',
      });
    },
  }).open();
}
