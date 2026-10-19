/**
 * 레이어4 보조 — ETH 옵션 만기·맥스페인 (변동성 트리거 일정)
 *
 * Deribit 공개 API(무키, 2026-10-19 실측 통과): get_book_summary_by_currency 가 전 미결제 옵션의
 * instrument_name(행사가·만기·콜/풋)과 open_interest 를 한 번에 준다.
 *  - 월·분기 만기 = 변동성이 몰리는 '일정'(경제 캘린더에 더함)
 *  - 맥스페인 = 옵션 매수자 손실이 최대가 되는 정산가. '중력'처럼 가격이 끌릴 수 있다고 보는 참고치이지
 *    방향 예측이 아니다(큰 뉴스·추세엔 쉽게 무시됨). 어디까지나 '만기일 변동성 주의'용.
 */

export type OptType = 'C' | 'P';

export interface ParsedOption {
  expiry: string; // 예: 27NOV26
  strike: number;
  type: OptType;
}
export interface StrikeOi {
  strike: number;
  type: OptType;
  oi: number;
}
export interface ExpirySummary {
  expiry: string;
  expiryTs: number;
  daysToExpiry: number;
  totalOiEth: number;
  maxPain: number | null;
}
export interface OptionsLayer {
  expiries: ExpirySummary[]; // 가까운 만기 순, 최대 5개
  nearest: ExpirySummary | null;
  asof: number;
}

const MON: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

/** ETH-27NOV26-3100-P → { expiry:'27NOV26', strike:3100, type:'P' } */
export function parseInstrument(name: string): ParsedOption | null {
  const m = /^[A-Z]+-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/.exec(name);
  if (!m) return null;
  return { expiry: m[1], strike: Number(m[2]), type: m[3] as OptType };
}

/** Deribit 만기(DDMMMYY)를 UTC ts로 — 만기 시각 08:00 UTC */
export function expiryToTs(expiry: string): number | null {
  const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(expiry);
  if (!m) return null;
  const mon = MON[m[2]];
  if (mon === undefined) return null;
  return Date.UTC(2000 + Number(m[3]), mon, Number(m[1]), 8, 0, 0);
}

/**
 * 맥스페인 = 총 옵션 내재가치 지급액이 최소가 되는 행사가.
 * 후보 정산가 K에 대해 지급액 = Σ콜OI·max(0,K-행사가) + Σ풋OI·max(0,행사가-K), 이를 최소화하는 K.
 */
export function maxPain(opts: StrikeOi[]): number | null {
  const strikes = [...new Set(opts.map((o) => o.strike))].sort((a, b) => a - b);
  if (!strikes.length) return null;
  let best = strikes[0];
  let bestPain = Infinity;
  for (const K of strikes) {
    let pain = 0;
    for (const o of opts) {
      pain += o.type === 'C' ? Math.max(0, K - o.strike) * o.oi : Math.max(0, o.strike - K) * o.oi;
    }
    if (pain < bestPain) {
      bestPain = pain;
      best = K;
    }
  }
  return best;
}

interface BookRow {
  instrument_name?: string;
  open_interest?: number;
}

/** 만기별로 묶어 totalOI·맥스페인 계산, 가까운 만기 순 최대 5개 */
export function summarizeOptions(rows: BookRow[], now = Date.now()): OptionsLayer {
  const byExpiry = new Map<string, StrikeOi[]>();
  for (const r of rows) {
    if (!r.instrument_name || !(r.open_interest! > 0)) continue;
    const p = parseInstrument(r.instrument_name);
    if (!p) continue;
    const list = byExpiry.get(p.expiry) ?? [];
    list.push({ strike: p.strike, type: p.type, oi: r.open_interest! });
    byExpiry.set(p.expiry, list);
  }
  const expiries: ExpirySummary[] = [];
  for (const [expiry, list] of byExpiry) {
    const ts = expiryToTs(expiry);
    if (ts === null || ts < now) continue;
    expiries.push({
      expiry,
      expiryTs: ts,
      daysToExpiry: Math.round((ts - now) / 86_400_000),
      totalOiEth: Math.round(list.reduce((s, o) => s + o.oi, 0)),
      maxPain: maxPain(list),
    });
  }
  expiries.sort((a, b) => a.expiryTs - b.expiryTs);
  const top = expiries.slice(0, 5);
  return { expiries: top, nearest: top[0] ?? null, asof: now };
}

export async function getOptionsLayer(): Promise<OptionsLayer> {
  try {
    const res = await fetch(
      'https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=ETH&kind=option',
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { result?: BookRow[] };
    return summarizeOptions(j.result ?? []);
  } catch {
    return { expiries: [], nearest: null, asof: Date.now() };
  }
}
