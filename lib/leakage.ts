/**
 * 수익 누수 계량 — 수익률을 갉아먹는 건 예측 실패보다 이것들이다:
 * 손절 초과 손실 · 계획 없는 매매의 손실 · 복구(리벤지) 매매 · 수수료 · 펀딩비.
 * 각각을 USDT와 시드 대비 %로 낸다. 방향 판단과 무관한 순수 산수.
 */
export interface LeakRow {
  ts: number; result: 'open' | 'win' | 'loss' | 'even'; resultR: number | null;
  realizedUsdt?: number | null; riskPct?: number | null; seedUsdt?: number | null;
}
export interface LeakItem { key: string; label: string; usdt: number; count: number; note?: string }
export interface Leakage { items: LeakItem[]; totalUsdt: number; pctOfSeed: number }
export interface LeakOpts {
  seed: number; defaultRiskPct: number; sinceTs: number;
  fees?: number; funding?: number;
  /** 손절 직후 이 시간 안의 재진입을 복구 매매로 본다(기본 30분). ts는 기록 시각이라 근사 */
  revengeWindowMs?: number;
}
const riskAmt = (r: LeakRow, o: LeakOpts) => ((r.seedUsdt ?? o.seed) * (r.riskPct ?? o.defaultRiskPct)) / 100;
const lossOf = (r: LeakRow, o: LeakOpts) =>
  r.realizedUsdt != null && r.realizedUsdt < 0 ? -r.realizedUsdt : (r.resultR != null && r.resultR < 0 ? -r.resultR * riskAmt(r, o) : 0);

export function computeLeakage(rows: LeakRow[], o: LeakOpts): Leakage {
  const win = o.revengeWindowMs ?? 30 * 60_000;
  const closed = rows.filter((r) => r.result !== 'open' && r.ts >= o.sinceTs).sort((a, b) => a.ts - b.ts);
  // 1) 손절 초과: 계획한 1R보다 더 잃은 만큼
  let stopOverrun = 0, stopN = 0;
  for (const r of closed) if (r.resultR != null && r.resultR < -1) { stopOverrun += (-r.resultR - 1) * riskAmt(r, o); stopN++; }
  // 2) 계획 없는 매매 손실: R 없이 진입해 잃은 것
  let unplanned = 0, unplN = 0;
  for (const r of closed) if (r.resultR == null && r.realizedUsdt != null && r.realizedUsdt < 0) { unplanned += -r.realizedUsdt; unplN++; }
  // 3) 복구 매매: 손절 직후 창 안의 재진입이 또 손실
  let revenge = 0, revN = 0;
  for (let i = 1; i < closed.length; i++) {
    const prev = closed[i - 1], cur = closed[i];
    if (prev.result === 'loss' && cur.result === 'loss' && cur.ts - prev.ts <= win) { revenge += lossOf(cur, o); revN++; }
  }
  const items: LeakItem[] = [
    { key: 'stop', label: '손절 초과 손실', usdt: stopOverrun, count: stopN, note: '계획한 1R보다 더 잃은 초과분' },
    { key: 'unplanned', label: '계획 없는 매매 손실', usdt: unplanned, count: unplN, note: '손절·사이징 없이 진입해 잃은 금액' },
    { key: 'revenge', label: '복구 매매 손실', usdt: revenge, count: revN, note: '손절 직후 30분 내 재진입 손실(근사)' },
    { key: 'fees', label: '수수료', usdt: Math.max(0, o.fees ?? 0), count: 0, note: '거래소 체결 수수료' },
    { key: 'funding', label: '펀딩비', usdt: Math.max(0, o.funding ?? 0), count: 0, note: '무기한 선물 펀딩 지출' },
  ];
  const totalUsdt = items.reduce((a, i) => a + i.usdt, 0);
  return { items, totalUsdt, pctOfSeed: o.seed > 0 ? (totalUsdt / o.seed) * 100 : 0 };
}
