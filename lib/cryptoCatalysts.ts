/**
 * 정책·규제 이벤트 워치 (ETH 체제 보드) — 날짜가 있는 '호재/변동성 트리거' 큐레이션.
 *
 * ⚠ 정직성(이 앱 원칙 + 원 자료의 단서 유지):
 *  - 무료 API로 못 가져오는 정성 정보라 **수동 큐레이션**이다(ASOF 기준, 자동 갱신 안 됨 — 오래되면 미표시).
 *  - **방향 신호가 아니라 '변동성 주의 일정'**이다(옵션 만기 카드와 같은 성격). 호재가 상승을 보장하지 않는다.
 *  - 규제는 대부분 **제안/의견수렴 단계이며 마감일은 승인일이 아니다.** '출시 계획'은 즉시 대량 매수를 뜻하지 않는다.
 *  - confluence(정렬도)에는 넣지 않는다 — 측정 불가한 정성 재료를 점수화하면 거짓이 된다.
 */

export type CatalystKind = 'regulation' | 'institution' | 'politics';

export interface CryptoCatalyst {
  date: string; // YYYY-MM-DD — 마감/예정/선거일 (승인일 아님)
  title: string;
  kind: CatalystKind;
  dateLabel: string; // '의견수렴 마감'·'출시 예정(보도)'·'선거일'
  desc: string;
  note: string; // 영향 맥락 + 정직한 한계
  source: string;
}

/** 큐레이션 기준일 — UI에 노출해 신선도를 알린다. */
export const CATALYSTS_ASOF = '2026-10-19';

export const CRYPTO_CATALYSTS: CryptoCatalyst[] = [
  {
    date: '2026-10-16',
    title: '도이체방크 디지털자산 수탁 진출',
    kind: 'institution',
    dateLabel: '출시 계획(보도)',
    desc: '독일 도이체방크가 수주 내 디지털자산 수탁 서비스 출시 계획(초기 BTC·ETH, 이후 스테이블코인·토큰화 상품).',
    note: '당장 ETH 대량 매수를 뜻하진 않음 — 은행의 가상자산 서비스 확대라 중장기 호재 후보.',
    source: 'Reuters',
  },
  {
    date: '2026-10-20',
    title: 'SEC Regulation Crypto Assets',
    kind: 'regulation',
    dateLabel: '의견수렴 마감',
    desc: '가상자산 관련 자금조달 규제 명확화 제안.',
    note: '제안 단계이며 마감일은 승인일이 아님. 최종 규정이 기관 진입을 쉽게 하면 호재 — 불확실.',
    source: 'SEC',
  },
  {
    date: '2026-11-03',
    title: '미국 중간선거',
    kind: 'politics',
    dateLabel: '선거일',
    desc: '선거 전후 가상자산 규제·유가 정책 관련 발언 가능.',
    note: '변동성 요인(방향 아님). 규제 우호/비우호 발언에 따라 단기 시장 반응 가능.',
    source: '—',
  },
  {
    date: '2026-12-07',
    title: 'SEC 가상자산 수탁 규칙',
    kind: 'regulation',
    dateLabel: '의견수렴 마감',
    desc: '자산운용사·투자회사의 코인 자산 보관·운용 제도 개선 제안.',
    note: '제안 단계. 최종 규정이 기관 수탁을 쉽게 하면 호재 후보 — 마감일≠승인일.',
    source: 'SEC',
  },
];

export interface CatalystWithDday extends CryptoCatalyst {
  dday: number; // 양수=남은 일수, 음수=지난 일수
}

/** 날짜 문자열(YYYY-MM-DD)을 UTC 자정 ms로 */
function dayMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * 지금 기준 '주목할' 이벤트 — 최근(지난 pastDays 이내)부터 미래 futureDays 이내, 가까운 순.
 * 지난 지 오래된 건 제외해 신선도 유지.
 */
export function upcomingCatalysts(
  list: CryptoCatalyst[],
  now: number,
  futureDays = 120,
  pastDays = 10,
): CatalystWithDday[] {
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  const out: CatalystWithDday[] = [];
  for (const c of list) {
    const t = dayMs(c.date);
    if (t == null) continue;
    const dday = Math.round((t - today) / 86_400_000);
    if (dday < -pastDays || dday > futureDays) continue;
    out.push({ ...c, dday });
  }
  return out.sort((a, b) => a.dday - b.dday);
}
