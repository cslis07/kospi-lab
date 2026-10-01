/**
 * 보유 비중·쏠림 — 순수함수(테스트 대상). 참고: 토스증권 '내 자산 비중', Copilot Money 배분 도넛.
 *
 * 경고선(기본): **한 종목 25%**, **한 업종 40%**. 법·규정이 아니라 이 앱의 리스크 기준선이다
 * (한 종목이 반토막 나면 계좌가 12.5% 깎이는 선). 화면에 기준을 그대로 적어 '추천'으로 읽히지 않게 한다.
 * 평가금액 = 수량 × 현재가(현재가 없으면 평단가로 대체하고 estimated=true).
 */

export const STOCK_LIMIT = 25;
export const SECTOR_LIMIT = 40;

export interface HoldingIn {
  ticker: string;
  name: string;
  quantity: number;
  price: number | null;     // 현재가(없으면 null)
  avgPrice: number;
  sector?: string;          // 업종명(모르면 '업종 미확인')
}

export interface Slice { key: string; label: string; value: number; pct: number; estimated?: boolean }
export interface ConcentrationWarning { kind: 'stock' | 'sector'; label: string; pct: number; limit: number }
export interface Concentration {
  total: number;
  stocks: Slice[];          // 비중 큰 순
  sectors: Slice[];         // 비중 큰 순
  warnings: ConcentrationWarning[];
  estimated: boolean;       // 현재가 없이 평단으로 잡은 종목이 있음
}

const UNKNOWN_SECTOR = '업종 미확인';

export function concentration(holdings: HoldingIn[], stockLimit = STOCK_LIMIT, sectorLimit = SECTOR_LIMIT): Concentration {
  const rows = holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const estimated = !(h.price && h.price > 0);
      return { ...h, estimated, value: h.quantity * (estimated ? h.avgPrice : (h.price as number)) };
    })
    .filter((h) => h.value > 0);
  const total = rows.reduce((a, h) => a + h.value, 0);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const stocks: Slice[] = rows
    .map((h) => ({ key: h.ticker, label: h.name || h.ticker, value: h.value, pct: pct(h.value), estimated: h.estimated }))
    .sort((a, b) => b.value - a.value);

  const bySector = new Map<string, number>();
  for (const h of rows) { const s = h.sector?.trim() || UNKNOWN_SECTOR; bySector.set(s, (bySector.get(s) ?? 0) + h.value); }
  const sectors: Slice[] = [...bySector.entries()].map(([s, v]) => ({ key: s, label: s, value: v, pct: pct(v) })).sort((a, b) => b.value - a.value);

  const warnings: ConcentrationWarning[] = [];
  // 한 종목만 보유하면 100% 가 당연 → 그래도 경고(분산 0). 종목 경고는 비중 큰 순
  for (const s of stocks) if (s.pct > stockLimit) warnings.push({ kind: 'stock', label: s.label, pct: s.pct, limit: stockLimit });
  // '업종 미확인' 은 실제 쏠림인지 알 수 없어 경고하지 않는다
  for (const s of sectors) if (s.key !== UNKNOWN_SECTOR && s.pct > sectorLimit) warnings.push({ kind: 'sector', label: s.label, pct: s.pct, limit: sectorLimit });

  return { total, stocks, sectors, warnings, estimated: rows.some((h) => h.estimated) };
}
