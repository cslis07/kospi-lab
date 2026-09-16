/**
 * 매매 해부 — 진입/손절이 그 순간의 차트 구조·변동성에 비춰 잘 실행됐는가를 사후 계산한다.
 * ⚠ 예측이 아니다. 전부 진입 이후를 아는 상태의 실행 품질 평가(백워드-룩킹).
 *  - 손절 폭 vs ATR: 너무 타이트하면 노이즈에 털린다
 *  - 진입 위치: 룩백 고/저 어디서 들어갔나(추격 vs 눌림)
 *  - MAE/MFE: 진입 직후 얼마나 역행/순행했나(R 단위) → 타이밍·익절 규율 진단
 */
export interface Candle { ts: number; o: number; h: number; l: number; c: number }
export interface AutopsyInput {
  entry: number; stop: number; target1?: number | null;
  direction: 'long' | 'short'; entryTs: number; exitTs?: number | null;
  result?: 'open' | 'win' | 'loss' | 'even';
}
export interface Finding { key: string; severity: 'good' | 'warn' | 'bad'; title: string; fix?: string }
export interface Autopsy {
  risk: number; atr: number | null; stopInAtr: number | null;
  entryLocationPct: number | null; maeR: number | null; mfeR: number | null;
  lookbackN: number; forwardN: number; findings: Finding[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Wilder ATR — 진입 직전 캔들들로 계산 */
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  const last = trs.slice(-period);
  return last.reduce((a, v) => a + v, 0) / period;
}

export function analyzeTrade(inp: AutopsyInput, candles: Candle[], opts?: { forwardMs?: number; lookbackN?: number }): Autopsy {
  const cs = [...candles].sort((a, b) => a.ts - b.ts);
  const long = inp.direction === 'long';
  const risk = Math.abs(inp.entry - inp.stop);
  const lookbackN = opts?.lookbackN ?? 24;
  const forwardMs = opts?.forwardMs ?? 5 * 86_400_000;

  const before = cs.filter((c) => c.ts <= inp.entryTs);
  const a = atr(before.length >= 15 ? before : cs.slice(0, Math.max(15, before.length)));
  const stopInAtr = a && a > 0 ? risk / a : null;

  // 진입 위치: 진입 전 lookbackN 캔들의 [저,고] 중 진입가 위치(0~1)
  const lb = before.slice(-lookbackN);
  let entryLocationPct: number | null = null;
  if (lb.length >= 4) {
    const lo = Math.min(...lb.map((c) => c.l)), hi = Math.max(...lb.map((c) => c.h));
    if (hi > lo) entryLocationPct = Math.max(0, Math.min(1, (inp.entry - lo) / (hi - lo)));
  }

  // MAE/MFE: 진입 후 보유 구간(exit 또는 forward 한도)에서 최대 역행/순행
  const end = inp.exitTs ?? inp.entryTs + forwardMs;
  const fwd = cs.filter((c) => c.ts >= inp.entryTs && c.ts <= end);
  let maeR: number | null = null, mfeR: number | null = null;
  if (fwd.length && risk > 0) {
    const minL = Math.min(...fwd.map((c) => c.l)), maxH = Math.max(...fwd.map((c) => c.h));
    const adverse = long ? inp.entry - minL : maxH - inp.entry;
    const favor = long ? maxH - inp.entry : inp.entry - minL;
    maeR = r2(Math.max(0, adverse) / risk);
    mfeR = r2(Math.max(0, favor) / risk);
  }

  const f: Finding[] = [];
  // 손절 폭 vs ATR
  if (stopInAtr != null) {
    if (stopInAtr < 0.8) f.push({ key: 'stop-tight', severity: 'bad', title: `손절이 ${r1(stopInAtr)} ATR로 타이트 — 정상 변동성에 털릴 위험`, fix: '손절을 1.2~1.5 ATR로 넓히고 수량을 줄여 1R(허용손실)을 그대로 유지하세요.' });
    else if (stopInAtr > 3.5) f.push({ key: 'stop-wide', severity: 'warn', title: `손절이 ${r1(stopInAtr)} ATR로 매우 넓음 — 1R이 커 부담`, fix: '진입을 손절 가까이 당기거나 수량을 줄이세요. 넓은 손절엔 작은 수량이 원칙.' });
    else f.push({ key: 'stop-ok', severity: 'good', title: `손절 폭 ${r1(stopInAtr)} ATR — 변동성 대비 적정` });
  }
  // 진입 위치
  if (entryLocationPct != null) {
    const p = Math.round(entryLocationPct * 100);
    const chase = long ? entryLocationPct > 0.85 : entryLocationPct < 0.15;
    const dip = long ? entryLocationPct < 0.25 : entryLocationPct > 0.75;
    if (chase) f.push({ key: 'chase', severity: 'warn', title: `최근 ${lookbackN}봉 ${long ? '고점' : '저점'} 부근(${long ? '상위' : '하위'} ${long ? p : 100 - p}%) 추격 진입`, fix: '되돌림(피보 0.382~0.618)이나 이평/VWAP 회귀를 기다렸다 분할 진입하면 손절 여유가 커집니다.' });
    else if (dip) f.push({ key: 'dip', severity: 'good', title: `${long ? '저점' : '고점'} 부근 진입 — 손절까지 여유가 확보된 자리` });
  }
  // MAE — 진입 직후 역행 = 타이밍
  if (maeR != null) {
    if (maeR >= 0.9) f.push({ key: 'mae-high', severity: 'warn', title: `진입 직후 −${maeR}R까지 역행 — 진입이 일렀음(눌림 전 진입)`, fix: '진입존을 지지/이평까지 낮춰 분할하거나, 즉시 역행 시 손절 후 재진입 규칙을 두세요.' });
    else if (maeR < 0.3) f.push({ key: 'mae-low', severity: 'good', title: `진입 직후 역행 ${maeR}R로 미미 — 타이밍 양호` });
  }
  // MFE vs 결과 — 익절/트레일 규율
  if (mfeR != null && inp.result === 'loss' && mfeR >= 1.5)
    f.push({ key: 'gave-back', severity: 'bad', title: `최대 +${mfeR}R까지 순행했으나 손실 마감 — 이익을 되돌려줌`, fix: '+1R 도달 시 절반 부분익절 + 나머지 본전 손절 이동(트레일) 규칙을 세우세요.' });

  return { risk: r2(risk), atr: a == null ? null : r2(a), stopInAtr: stopInAtr == null ? null : r2(stopInAtr), entryLocationPct, maeR, mfeR, lookbackN, forwardN: fwd.length, findings: f };
}
