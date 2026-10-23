/**
 * 주간 복기 — 이번 주(최근 7일) vs 지난주(그 전 7일)의 규율 지표를 나란히 보여 "나아지고 있나"를 잰다.
 * 매주 일요일 모닝 브리핑 텔레그램(/api/brief/telegram) 세 번째 메시지. (예전 coin-track 월요일 요약은 이걸로 대체)
 *
 * 판정은 일일 복기(lib/dailyReview.reviewTrade)와 같은 고정 규칙. 다만 2주치 매매를 크론 시간 안에 보려고
 * 진입 맥락은 1H 추세만(코인당 1H 캔들 1회) 쓰고 MAE/MFE·청산 뒤 흐름은 뺀다 — 그래서 '청산' 판정은 손절가 정리·손절 없이 버팀만 남는다.
 * 손익이 아니라 **규칙을 지킨 정도**가 주인공. 매매 신호 아님.
 */
import { fetchClosedPositions, type ClosedPosition } from '@/lib/bitgetPositions';
import { reviewTrade, type TradeReview } from '@/lib/dailyReview';
import { analyzeTimeframe, tfTrend } from '@/lib/coinAnalysis';

export interface WeekStats {
  n: number; wins: number; net: number; cost: number;
  slRate: number | null;        // 거래소 손절 주문 기록 있는 비율 %
  withTrendRate: number | null; // 1H 추세 방향 진입 비율 %(추세 판정된 것 중)
  revenge: number; scalpLoss: number; perDay: number;
  mistakes: Map<string, number>;
}

const MISTAKE: Record<string, string> = {
  'no-stop': '손절 주문 없음', 'trend-against': '추세 역행 진입', revenge: '복구 매매', 'scalp-loss': '초단타 손실',
  cost: '비용 과다', 'held-loser': '손절 없이 버팀', chase: '고점·저점 추격', 'rsi-chase': '과열 추격',
};

export function weekStats(rs: TradeReview[], days = 7): WeekStats {
  const notes = rs.flatMap((r) => [...r.entry, ...r.exit, ...r.trade]);
  const mistakes = new Map<string, number>();
  for (const n of notes) if (n.tone !== 'good' && MISTAKE[n.key]) mistakes.set(n.key, (mistakes.get(n.key) ?? 0) + 1);
  const judged = rs.filter((r) => r.entry.some((n) => n.key === 'trend-with' || n.key === 'trend-against'));
  return {
    n: rs.length, wins: rs.filter((r) => r.pos.netProfit > 0).length,
    net: rs.reduce((s, r) => s + r.pos.netProfit, 0),
    cost: rs.reduce((s, r) => s + Math.abs(r.pos.fee) + Math.max(0, -r.pos.funding), 0),
    slRate: rs.length ? Math.round((rs.filter((r) => r.pos.stop != null).length / rs.length) * 100) : null,
    withTrendRate: judged.length ? Math.round((judged.filter((r) => r.entry.some((n) => n.key === 'trend-with')).length / judged.length) * 100) : null,
    revenge: mistakes.get('revenge') ?? 0, scalpLoss: mistakes.get('scalp-loss') ?? 0,
    perDay: Math.round((rs.length / days) * 10) / 10,
    mistakes,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usdt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
/** 좋아짐/나빠짐 화살표 — higherIsBetter 기준 */
function arrow(cur: number | null, prev: number | null, higherIsBetter: boolean): string {
  if (cur == null || prev == null || cur === prev) return '';
  return (cur > prev) === higherIsBetter ? ' 🟢' : ' 🔴';
}
const pct = (v: number | null) => (v == null ? '–' : `${v}%`);

export function buildWeeklyMessage(cur: WeekStats, prev: WeekStats, opts: { base: string }): string {
  const head = '📅 <b>주간 복기</b> · 이번 주 vs 지난주(각 7일)';
  if (!cur.n) return `${head}\n이번 주 청산 매매 없음${prev.n ? ` (지난주 ${prev.n}건)` : ''} — 쉬는 것도 규율입니다.`;
  const rows = [
    `매매 <b>${cur.n}</b>건 (하루 ${cur.perDay}) ← ${prev.n}건${arrow(cur.n, prev.n, false)}`,
    `승패 ${cur.wins}승 ${cur.n - cur.wins}패 · 순손익 <b>${usdt(cur.net)}</b> ← ${usdt(prev.net)} USDT`,
    `비용 ${cur.cost.toFixed(1)} ← ${prev.cost.toFixed(1)}${arrow(cur.cost, prev.cost, false)}`,
    '',
    '<b>규칙 지킨 정도</b>',
    `🛡 손절 주문 설정 ${pct(cur.slRate)} ← ${pct(prev.slRate)}${arrow(cur.slRate, prev.slRate, true)}`,
    `🧭 1H 추세 방향 진입 ${pct(cur.withTrendRate)} ← ${pct(prev.withTrendRate)}${arrow(cur.withTrendRate, prev.withTrendRate, true)}`,
    `🔁 복구 매매 ${cur.revenge} ← ${prev.revenge}${arrow(cur.revenge, prev.revenge, false)} · ⏱ 초단타 손실 ${cur.scalpLoss} ← ${prev.scalpLoss}${arrow(cur.scalpLoss, prev.scalpLoss, false)}`,
  ];
  const top = [...cur.mistakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length) {
    rows.push('', '<b>이번 주 실수 Top 3</b>');
    top.forEach(([k, v], i) => rows.push(`${i + 1}. ${esc(MISTAKE[k])} ${v}회 ← ${prev.mistakes.get(k) ?? 0}회${arrow(v, prev.mistakes.get(k) ?? 0, false)}`));
  }
  rows.push('', `<i>🟢 좋아짐 · 🔴 나빠짐 — 손익이 아니라 규칙 기준 · 매매 신호 아님</i>\n🔗 ${opts.base}/journal`);
  return `${head}\n\n${rows.join('\n')}`;
}

/* ── 로더 ─────────────────────────────── */
async function h1Series(symbol: string) {
  const u = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=1000`;
  const j = await (await fetch(u, { signal: AbortSignal.timeout(8000), cache: 'no-store' })).json().catch(() => null);
  if (j?.code !== '00000') return [];
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +(r[6] ?? 0) })).sort((a, b) => a.ts - b.ts);
}

async function reviewLight(positions: ClosedPosition[]): Promise<TradeReview[]> {
  const syms = [...new Set(positions.map((p) => p.symbol))];
  const series = new Map(await Promise.all(syms.map(async (s) => [s, await h1Series(s)] as const)));
  const asc = [...positions].sort((a, b) => a.closeTs - b.closeTs);
  return asc.map((pos, i) => {
    const before = (series.get(pos.symbol) ?? []).filter((c) => c.ts + 3_600_000 <= pos.openTs).slice(-200);
    let h1Trend: 'up' | 'down' | 'flat' | null = null;
    try { if (before.length >= 60) h1Trend = tfTrend(analyzeTimeframe('1H', before)); } catch { /* 생략 */ }
    const prev = asc.slice(0, i).reverse().find((p) => p.closeTs <= pos.openTs) ?? null;
    return reviewTrade(pos, { h1Trend, rsi15: null, location: null, autopsy: null, ex: null, post: null }, prev);
  });
}

export async function weeklyReviewMessage(opts: { base: string; now?: number }): Promise<string> {
  const now = opts.now ?? Date.now(), W = 7 * 86_400_000;
  const { positions } = await fetchClosedPositions(now - 2 * W, now);
  const rs = await reviewLight(positions);
  const cur = rs.filter((r) => r.pos.closeTs > now - W), prev = rs.filter((r) => r.pos.closeTs <= now - W);
  return buildWeeklyMessage(weekStats(cur), weekStats(prev), { base: opts.base });
}
