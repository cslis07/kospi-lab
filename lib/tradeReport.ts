/**
 * 매매일지 월별 보고서 — 순수함수(테스트 대상).
 * 입력은 거래소가 준 청산 포지션(TradePosition). 손으로 적은 승리 편향이 아니라
 * 거래소가 아는 실현손익/수수료/펀딩을 그대로 집계한다.
 */
import type { MoodKey } from './tradeMood';

/** ClosedPosition(app/api/bitget/history)의 구조적 부분집합 — 집계에 필요한 필드만 */
export interface TradePosition {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  openAvg: number;
  closeAvg: number;
  /** 수수료·펀딩까지 반영한 실현 순손익(USDT) */
  netProfit: number;
  fee: number;
  funding: number;
  openTs: number;
  closeTs: number;
}

/** ts(ms) → KST 기준 'YYYY-MM' */
export function kstMonth(ts: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date(ts));
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${y}-${m}`;
}

export interface MonthStat {
  month: string;            // 'YYYY-MM' (KST)
  count: number;
  wins: number;             // netProfit > 0
  winRate: number | null;   // %
  netSum: number;
  feeSum: number;
  fundingSum: number;
  longCount: number;
  shortCount: number;
  avgHoldMs: number | null;
  best: TradePosition | null;   // 순손익 최대
  worst: TradePosition | null;  // 순손익 최소
}

const sumBy = (list: TradePosition[], f: (p: TradePosition) => number) => list.reduce((a, p) => a + f(p), 0);

/** 월별 집계(최신 월 먼저). closeTs 기준 KST 월로 버킷팅. */
export function monthlyStats(positions: TradePosition[]): MonthStat[] {
  const byMonth = new Map<string, TradePosition[]>();
  for (const p of positions) {
    const k = kstMonth(p.closeTs);
    const arr = byMonth.get(k);
    if (arr) arr.push(p); else byMonth.set(k, [p]);
  }

  const out: MonthStat[] = [];
  for (const [month, list] of byMonth) {
    const wins = list.filter((p) => p.netProfit > 0).length;
    const holds = list.map((p) => p.closeTs - p.openTs).filter((h) => h > 0);
    const best = list.reduce<TradePosition | null>((a, p) => (a == null || p.netProfit > a.netProfit ? p : a), null);
    const worst = list.reduce<TradePosition | null>((a, p) => (a == null || p.netProfit < a.netProfit ? p : a), null);
    out.push({
      month,
      count: list.length,
      wins,
      winRate: list.length ? (wins / list.length) * 100 : null,
      netSum: sumBy(list, (p) => p.netProfit),
      feeSum: sumBy(list, (p) => p.fee),
      fundingSum: sumBy(list, (p) => p.funding),
      longCount: list.filter((p) => p.side === 'long').length,
      shortCount: list.filter((p) => p.side === 'short').length,
      avgHoldMs: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null,
      best,
      worst,
    });
  }
  return out.sort((a, b) => (a.month < b.month ? 1 : -1));
}

export interface MoodStat {
  mood: MoodKey;
  count: number;
  netSum: number;
  wins: number;
  winRate: number | null; // %
}

/** 기분별 성적 — 기분이 기록된 매매만. 입력 순서(MOOD 정의 순서)는 호출부가 정렬. */
export function moodStats(
  positions: TradePosition[],
  moods: Record<string, { mood: MoodKey }>,
): MoodStat[] {
  const byMood = new Map<MoodKey, TradePosition[]>();
  for (const p of positions) {
    const m = moods[p.positionId]?.mood;
    if (!m) continue;
    const arr = byMood.get(m);
    if (arr) arr.push(p); else byMood.set(m, [p]);
  }

  const out: MoodStat[] = [];
  for (const [mood, list] of byMood) {
    const wins = list.filter((p) => p.netProfit > 0).length;
    out.push({
      mood,
      count: list.length,
      netSum: sumBy(list, (p) => p.netProfit),
      wins,
      winRate: list.length ? (wins / list.length) * 100 : null,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
