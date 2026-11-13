/**
 * 추천 진입가 — "지금 들어가면 손절·목표는?"이 아니라 "얼마에 들어가는 게 좋은가"(지정가 대기 자리).
 *
 * 1) 가격대 후보 모으기: 지지·저항(터치 수)·24h 고저·피보 되돌림·SMC(OTE·오더블록·FVG)·EMA(15m·1H·4H)·VWAP·볼린저·호가벽·라운드 넘버.
 * 2) 가까운 후보끼리 묶어(클러스터) 겹친 근거가 많은 자리를 찾는다 — 근거가 겹칠수록 반응이 나올 가능성이 큰 자리로 본다.
 * 3) 상황 점수(엔진 방향·상위 추세·뉴스·펀딩·롱숏 쏠림·공포탐욕·거시·체결 강도·이벤트)로
 *    주 방향을 고르고, 상황이 불리한 쪽은 더 깊은 자리(더 싸게/비싸게)를 요구한다.
 * 4) 자리 아래(위)에 손절, 반대편 가격대에 목표1·2 → 손익비·도달 가능성·시나리오.
 *
 * ⚠ 매수·매도 신호가 아니다. 엔진 방향 판정의 측정 적중률은 49.7%(우위 없음)이고, 이 계산은 그 위에 '자리'를 고르는 규칙일 뿐이다.
 *   엔진(lib/coinAnalysis)의 판정·백테스트·모의 선행테스트 규칙은 건드리지 않는다(화면 표시 전용).
 */

export type Side = 'long' | 'short';

export interface RecInput {
  price: number;
  atr15: number;
  atr1h: number;
  zones: { price: number; touches: number; kind: 'support' | 'resistance' }[];
  high24h: number | null;
  low24h: number | null;
  fib: { direction: 'up' | 'down'; r382: number; r50: number; r618: number; e1272: number; e1618: number } | null;
  smc: { want: 'bull' | 'bear'; ote: { low: number; high: number } | null; orderBlock: { low: number; high: number } | null; fvg: { low: number; high: number } | null } | null;
  /** 이름 → 값(15m EMA20 등). null 은 무시 */
  ma: { label: string; value: number | null; weight: number }[];
  bb: { label: string; lower: number; upper: number; weight: number }[];
  walls: { bid: number | null; ask: number | null };
  ctx: RecContext;
}

export interface RecContext {
  engineDir: 'long' | 'short' | 'wait';
  h4: 'up' | 'down' | 'flat' | null;
  d1: 'up' | 'down' | 'flat' | null;
  newsPos: number; newsNeg: number;
  fundingPct: number | null;      // 1회 펀딩비 %
  lsRatio: number | null;         // 계정 롱/숏 비율
  fearGreed: number | null;
  macroBias: 'long' | 'short' | 'mixed' | null;
  takerRatio: number | null;      // 매수/매도 체결 비
  eventHours: number | null;      // 다음 큰 경제 이벤트까지 시간
  eventTitle: string | null;
}

export interface Level { price: number; weight: number; label: string }
export interface Cluster { price: number; low: number; high: number; score: number; labels: string[] }

export interface SideRec {
  side: Side;
  entry: number; zoneLow: number; zoneHigh: number;
  stop: number; stopPct: number;
  target1: number; target2: number; rr1: number; rr2: number;
  distPct: number; distAtr: number;
  fill: '높음' | '보통' | '낮음' | '매우 낮음';
  score: number;                  // 근거 겹침 점수
  basis: string[];                // 이 자리의 근거
  ctxScore: number;               // 이 방향 기준 상황 점수(+유리)
  deep: boolean;                  // 상황이 불리해 더 깊은 자리를 골랐는지
  scenarios: { kind: 'base' | 'fail' | 'miss'; text: string }[];
  ok: boolean;                    // 손익비 1.5 이상·자리 있음
  note: string;
}

export interface EntryRec {
  primary: Side | null;           // 상황 점수로 고른 주 방향(null = 양쪽 비슷 — 두 자리 모두 대기)
  ctxScore: number;               // 롱 기준 상황 점수(+롱 유리 / −숏 유리)
  factors: { text: string; v: number }[];  // 상황 근거(롱 기준 부호)
  long: SideRec | null;
  short: SideRec | null;
  eventWait: string | null;       // 큰 이벤트 임박 시 안내
}

const r = (n: number) => Math.round(n * 1e6) / 1e6;

/** 라운드 넘버 간격 — 2,052 → 100(반 50), 91,000 → 1,000(반 500), 0.52 → 0.1(반 0.05) */
export function roundStep(price: number): number {
  return Math.pow(10, Math.floor(Math.log10(price)) - 1);
}

/** 한 방향의 후보 가격대(롱 = 현재가 아래, 숏 = 위). 거리는 1H ATR 4배까지 */
export function candidates(inp: RecInput, side: Side): Level[] {
  const { price } = inp;
  const out: Level[] = [];
  const add = (p: number | null | undefined, weight: number, label: string) => {
    if (p == null || !Number.isFinite(p) || p <= 0) return;
    out.push({ price: p, weight, label });
  };
  const longSide = side === 'long';
  for (const z of inp.zones) {
    if ((z.kind === 'support') === longSide) add(z.price, 1 + Math.min(z.touches, 10) * 0.3, `${longSide ? '지지' : '저항'} 터치 ${z.touches}회`);
  }
  // 반대 성격 구간도 돌파 후 역할 전환(저항→지지) 자리가 될 수 있어 약하게
  for (const z of inp.zones) {
    if ((z.kind === 'support') !== longSide) add(z.price, 0.6, `${longSide ? '저항' : '지지'}→${longSide ? '지지' : '저항'} 전환 후보`);
  }
  add(longSide ? inp.low24h : inp.high24h, 2.5, longSide ? '24h 저점' : '24h 고점');
  if (inp.fib) {
    const ok = longSide ? inp.fib.direction === 'up' : inp.fib.direction === 'down';
    if (ok) {
      add(inp.fib.r382, 1.5, '피보 38.2%');
      add(inp.fib.r50, 2, '피보 50%');
      add(inp.fib.r618, 2.5, '피보 61.8%');
    }
  }
  if (inp.smc && (inp.smc.want === 'bull') === longSide) {
    const mid = (z: { low: number; high: number } | null) => (z ? (z.low + z.high) / 2 : null);
    add(mid(inp.smc.ote), 2, 'OTE(0.618~0.786)');
    add(mid(inp.smc.orderBlock), 2, '오더블록');
    add(mid(inp.smc.fvg), 1.5, 'FVG(가격 공백)');
  }
  for (const m of inp.ma) add(m.value, m.weight, m.label);
  for (const b of inp.bb) add(longSide ? b.lower : b.upper, b.weight, `${b.label} ${longSide ? '하단' : '상단'}`);
  add(longSide ? inp.walls.bid : inp.walls.ask, 1.5, longSide ? '매수벽(호가)' : '매도벽(호가)');
  // 라운드 넘버 — 현재가 바깥쪽으로 반 간격씩 4개(정수 배수 1, 반 배수 0.5)
  const step = roundStep(price), half = step / 2;
  let base = longSide ? Math.floor(price / half) * half : Math.ceil(price / half) * half;
  if (Math.abs(base - price) < 1e-9) base += longSide ? -half : half;
  for (let i = 0; i < 4; i++) {
    const p = r(base + (longSide ? -i : i) * half);
    const whole = Math.abs(p / step - Math.round(p / step)) < 1e-6;
    add(p, whole ? 1 : 0.5, `라운드 넘버 ${p.toLocaleString('en-US')}`);
  }
  const minGap = Math.max(inp.atr15 * 0.15, price * 0.0005);
  const maxGap = Math.max(inp.atr1h * 4, price * 0.004);
  const seen = new Set<string>();
  return out.filter((l) => {
    const d = longSide ? price - l.price : l.price - price;
    if (d < minGap || d > maxGap) return false;
    const key = `${l.label}:${l.price.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 가까운 후보끼리 묶기 — 간격 허용치 = max(15m ATR×0.35, 가격×0.12%) */
export function clusterLevels(levels: Level[], tol: number): Cluster[] {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const groups: Level[][] = [];
  for (const l of sorted) {
    const g = groups[groups.length - 1];
    if (g && l.price - g[g.length - 1].price <= tol) g.push(l);
    else groups.push([l]);
  }
  return groups.map((g) => {
    const w = g.reduce((s, l) => s + l.weight, 0);
    const labels = [...new Set(g.sort((a, b) => b.weight - a.weight).map((l) => l.label))];
    return { price: r(g.reduce((s, l) => s + l.price * l.weight, 0) / w), low: Math.min(...g.map((l) => l.price)), high: Math.max(...g.map((l) => l.price)), score: Math.round(w * 10) / 10, labels };
  });
}

/** 상황 점수(롱 기준) — 각 근거와 부호. 합이 +면 롱 유리, −면 숏 유리 */
export function contextFactors(c: RecContext): { text: string; v: number }[] {
  const f: { text: string; v: number }[] = [];
  if (c.engineDir !== 'wait') f.push({ text: `엔진 방향 ${c.engineDir === 'long' ? '롱' : '숏'} 우위`, v: c.engineDir === 'long' ? 2 : -2 });
  const tr = (t: 'up' | 'down' | 'flat' | null, name: string) => {
    if (t === 'up') f.push({ text: `${name} 상승 추세`, v: 1 });
    else if (t === 'down') f.push({ text: `${name} 하락 추세`, v: -1 });
  };
  tr(c.h4, '4H'); tr(c.d1, '1D');
  const net = c.newsPos - c.newsNeg;
  if (net !== 0 && (c.newsPos + c.newsNeg) > 0) {
    const v = Math.max(-1.5, Math.min(1.5, net * 0.5));
    f.push({ text: `최근 뉴스 호재 ${c.newsPos}·악재 ${c.newsNeg}건`, v });
  }
  if (c.fundingPct != null) {
    if (c.fundingPct >= 0.03) f.push({ text: `펀딩비 +${c.fundingPct.toFixed(3)}% — 롱 쏠림(롱 청산 연료)`, v: -1 });
    else if (c.fundingPct <= -0.01) f.push({ text: `펀딩비 ${c.fundingPct.toFixed(3)}% — 숏 쏠림(숏 스퀴즈 연료)`, v: 1 });
  }
  if (c.lsRatio != null) {
    if (c.lsRatio >= 2) f.push({ text: `계정 롱숏비 ${c.lsRatio.toFixed(2)} — 개인 롱 과밀`, v: -0.5 });
    else if (c.lsRatio <= 0.8) f.push({ text: `계정 롱숏비 ${c.lsRatio.toFixed(2)} — 개인 숏 과밀`, v: 0.5 });
  }
  if (c.fearGreed != null) {
    if (c.fearGreed <= 25) f.push({ text: `공포·탐욕 ${c.fearGreed} 극단적 공포 — 투매 뒤 반등 여지`, v: 0.5 });
    else if (c.fearGreed >= 76) f.push({ text: `공포·탐욕 ${c.fearGreed} 극단적 탐욕 — 과열`, v: -0.5 });
  }
  if (c.macroBias === 'long') f.push({ text: '거시(금리·달러) 위험자산 우호', v: 1 });
  else if (c.macroBias === 'short') f.push({ text: '거시(금리·달러) 위험자산 부담', v: -1 });
  if (c.takerRatio != null) {
    if (c.takerRatio >= 1.1) f.push({ text: `체결 매수 우위(${c.takerRatio.toFixed(2)})`, v: 0.5 });
    else if (c.takerRatio <= 0.9) f.push({ text: `체결 매도 우위(${c.takerRatio.toFixed(2)})`, v: -0.5 });
  }
  return f;
}

function fillOf(distAtr: number): SideRec['fill'] {
  return distAtr <= 0.7 ? '높음' : distAtr <= 1.5 ? '보통' : distAtr <= 2.5 ? '낮음' : '매우 낮음';
}

function sideRec(inp: RecInput, side: Side, ctxScore: number, eventSoon: boolean, fmt: (n: number) => string): SideRec | null {
  const { price, atr15, atr1h } = inp;
  const longSide = side === 'long';
  const tol = Math.max(atr15 * 0.35, price * 0.0012);
  const clusters = clusterLevels(candidates(inp, side), tol);
  if (!clusters.length) return null;
  const a1 = atr1h > 0 ? atr1h : atr15 * 2;
  const distAtrOf = (c: Cluster) => Math.abs(price - c.price) / a1;
  // 근거 점수 × 도달 가능성 — 너무 가까우면(0.3 ATR 미만) 할인 이득이 없고, 너무 멀면 안 온다
  const reach = (d: number) => (d < 0.3 ? 0.6 : d <= 1.5 ? 1 : d <= 2.5 ? 0.75 : 0.5);
  // 상황이 불리하거나 큰 이벤트가 임박하면 더 깊은 자리(1H ATR 1배 이상)만 고른다
  const deep = ctxScore < 0 || eventSoon;
  const minD = deep ? 1.0 : ctxScore >= 2 ? 0.3 : 0.5;
  const ranked = clusters.map((c) => ({ c, d: distAtrOf(c), rank: c.score * reach(distAtrOf(c)) })).sort((a, b) => b.rank - a.rank);
  const pick = ranked.find((x) => x.d >= minD && x.c.score >= 2.5) ?? ranked.find((x) => x.c.score >= 2.5) ?? ranked[0];
  const c = pick.c;

  // 진입 존 — 묶인 후보 범위(최소 폭 15m ATR×0.3). 지정가는 근거 가중 평균가
  const halfMin = atr15 * 0.15;
  const zoneLow = Math.min(c.low, c.price - halfMin);
  const zoneHigh = Math.max(c.high, c.price + halfMin);
  const entry = c.price;
  // 손절 — 존 바깥 + 15m ATR×0.6 (존을 확실히 깨면 자리 무효)
  const pad = Math.max(atr15 * 0.6, price * 0.0015);
  const stop = longSide ? zoneLow - pad : zoneHigh + pad;
  const risk = Math.abs(entry - stop);
  // 목표 — 반대편 가격대(롱이면 진입가 위 저항 쪽 후보)에서 1R 이상 떨어진 첫 자리, 다음 자리
  // 약한 자리(라운드 넘버 하나뿐 등, 점수 1.5 미만)는 목표로 쓰지 않는다
  const opp = clusterLevels(candidates({ ...inp, price: entry }, longSide ? 'short' : 'long'), tol)
    .filter((x) => x.score >= 1.5).map((x) => x.price).sort((a, b) => (longSide ? a - b : b - a));
  const beyond = (p: number, from: number, minR: number) => (longSide ? p >= from + risk * minR : p <= from - risk * minR);
  let target1 = opp.find((p) => beyond(p, entry, 1)) ?? (longSide ? entry + risk * 1.5 : entry - risk * 1.5);
  let target2 = opp.find((p) => beyond(p, target1, 0.5)) ?? (longSide ? entry + risk * 2.5 : entry - risk * 2.5);
  if (longSide ? target2 <= target1 : target2 >= target1) target2 = longSide ? target1 + risk : target1 - risk;
  target1 = r(target1); target2 = r(target2);
  const rr1 = risk > 0 ? Math.abs(target1 - entry) / risk : 0;
  const rr2 = risk > 0 ? Math.abs(target2 - entry) / risk : 0;
  const distPct = Math.abs(price - entry) / price * 100;
  const distAtr = pick.d;
  const fill = fillOf(distAtr);

  // 자리를 깨고 나면 다음 자리
  const next = clusters.filter((x) => (longSide ? x.price < zoneLow : x.price > zoneHigh) && x.score >= 2)
    .sort((a, b) => (longSide ? b.price - a.price : a.price - b.price))[0];
  // 되돌림 없이 반대로 가면 지켜볼 돌파선(롱이면 현재가 위 첫 저항)
  const breakLv = clusterLevels(candidates(inp, longSide ? 'short' : 'long'), tol)
    .filter((x) => x.score >= 2).sort((a, b) => (longSide ? a.price - b.price : b.price - a.price))[0];
  const verb = longSide ? '되돌림' : '반등';
  const scenarios: SideRec['scenarios'] = [
    { kind: 'base', text: `${verb}으로 $${fmt(zoneLow)}~$${fmt(zoneHigh)}(현재가 ${longSide ? '−' : '+'}${distPct.toFixed(2)}%)에 닿고 15m 캔들이 ${longSide ? '아래꼬리·양봉' : '윗꼬리·음봉'}으로 반응하면 진입 → 목표1 $${fmt(target1)}, 목표2 $${fmt(target2)}` },
    { kind: 'fail', text: `존을 15m 종가로 ${longSide ? '이탈' : '돌파'}하면 자리 무효 — 손절 $${fmt(stop)}${next ? `, 다음 자리 $${fmt(next.price)}(${next.labels[0]})에서 다시 판단` : ''}` },
    { kind: 'miss', text: breakLv
      ? `${verb} 없이 $${fmt(breakLv.price)} 선을 ${longSide ? '돌파' : '이탈'}하면 추격하지 말고 리테스트(되돌아와 지켜지는지)를 기다린 뒤 다시 계산`
      : `${verb}이 오지 않으면 진입하지 않는다 — 놓친 자리는 다시 계산` },
  ];
  const ok = rr2 >= 1.5;
  const note = !ok ? `손익비 ${rr2.toFixed(2)} — 1.5 미만이라 이 자리는 건너뛰는 편이 안전`
    : deep ? (eventSoon ? '큰 이벤트 임박 — 더 깊은 자리만 표시(발표 뒤 다시 계산)' : '상황이 이 방향에 불리 — 더 깊은 자리만 표시')
    : '근거가 겹친 자리 — 닿아도 캔들 반응을 확인한 뒤 진입';
  return {
    side, entry, zoneLow: r(zoneLow), zoneHigh: r(zoneHigh), stop: r(stop), stopPct: Math.abs(entry - stop) / entry * 100,
    target1, target2, rr1, rr2, distPct, distAtr, fill, score: c.score, basis: c.labels.slice(0, 6), ctxScore, deep, scenarios, ok, note,
  };
}

export function recommendEntry(inp: RecInput, fmt: (n: number) => string = (n) => String(n)): EntryRec {
  const factors = contextFactors(inp.ctx);
  const ctxScore = Math.round(factors.reduce((s, f) => s + f.v, 0) * 10) / 10;
  const eventSoon = inp.ctx.eventHours != null && inp.ctx.eventHours <= 12;
  const long = inp.price > 0 ? sideRec(inp, 'long', ctxScore, eventSoon, fmt) : null;
  const short = inp.price > 0 ? sideRec(inp, 'short', -ctxScore, eventSoon, fmt) : null;
  let primary: Side | null = ctxScore >= 1.5 ? 'long' : ctxScore <= -1.5 ? 'short' : null;
  // 주 방향의 자리가 없거나 손익비 미달이면 반대쪽이 괜찮아도 주 방향으로 밀지 않는다(양쪽 대기)
  if (primary && !(primary === 'long' ? long?.ok : short?.ok)) primary = null;
  const eventWait = eventSoon && inp.ctx.eventTitle
    ? `${inp.ctx.eventTitle} ${inp.ctx.eventHours! <= 0 ? '오늘' : `약 ${Math.round(inp.ctx.eventHours!)}시간 뒤`} — 발표 전후엔 지정가가 순간 변동에 체결되기 쉽다. 발표 뒤 다시 계산 권장`
    : null;
  return { primary, ctxScore, factors, long, short, eventWait };
}
