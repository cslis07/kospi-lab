/**
 * 미시 데이터 수집(호가 깊이·청산·거래소별 미결제약정) 계산부 — 호출은 scripts/microCollect.mts.
 * 무료 공개 API엔 과거 이력이 없어(호가는 현재값만, 청산은 수 시간~하루치) 지금부터 쌓아야 적중률 연구(scripts/accuracy-lab.ts)에 쓸 수 있다.
 * 여기 있는 건 '기록 형식'과 '집계 규칙'뿐 — 방향 신호가 아니다(쌓인 뒤 표본 밖 검증을 통과해야 신호).
 */

/** 중간가 기준 깊이 구간(%) — 이 거리 안에 쌓인 매수·매도 잔량(코인 수량)을 기록한다 */
export const BANDS_PCT = [0.05, 0.1, 0.25, 0.5, 1] as const;
export const BUCKET_MS = 15 * 60_000;

export type Level = [price: number, size: number];
export interface Book { bids: Level[]; asks: Level[] }
/** 구간별 잔량 — 호가창이 그 구간 끝까지 닿지 않으면 null(덜 본 것을 '적다'로 기록하지 않기 위해) */
export interface BandDepth { mid: number; spreadBps: number; b: (number | null)[]; a: (number | null)[] }

/** 문자열·숫자 섞인 [가격, 수량, ...] 행 → Level[] (수량 0·비정상 제거, sizeMul = 계약→코인 환산) */
export function toLevels(rows: unknown[], sizeMul = 1): Level[] {
  const out: Level[] = [];
  for (const r of rows) {
    const row = Array.isArray(r) ? r : r && typeof r === 'object' ? [(r as { px?: unknown }).px, (r as { sz?: unknown }).sz] : null;
    if (!row) continue;
    const p = Number(row[0]), s = Number(row[1]) * sizeMul;
    if (Number.isFinite(p) && Number.isFinite(s) && p > 0 && s > 0) out.push([p, s]);
  }
  return out;
}

export function bandDepth(book: Book, bands: readonly number[] = BANDS_PCT): BandDepth | null {
  if (!book.bids.length || !book.asks.length) return null;
  const bids = [...book.bids].sort((x, y) => y[0] - x[0]), asks = [...book.asks].sort((x, y) => x[0] - y[0]);
  const bb = bids[0][0], ba = asks[0][0];
  if (ba <= bb) return null; // 교차 호가(깨진 스냅샷)
  const mid = (bb + ba) / 2;
  const side = (lv: Level[], dir: -1 | 1) => bands.map((pct) => {
    const edge = mid * (1 + dir * pct / 100);
    const far = lv[lv.length - 1][0];
    if (dir < 0 ? far > edge : far < edge) return null; // 구간 끝까지 못 봄
    let sum = 0;
    for (const [p, s] of lv) { if (dir < 0 ? p < edge : p > edge) break; sum += s; }
    return sum;
  });
  return { mid, spreadBps: ((ba - bb) / mid) * 1e4, b: side(bids, -1), a: side(asks, 1) };
}

/**
 * 같은 거래소의 해상도 다른 호가창 여러 장(촘촘한 것 먼저) → 구간마다 '닿는 것 중 가장 촘촘한' 값.
 * 촘촘한 호가창은 좁은 구간만, 묶음 호가창은 넓은 구간까지 보여 주기 때문.
 */
export function mergeResolutions(books: (BandDepth | null)[]): BandDepth | null {
  const ok = books.filter((x): x is BandDepth => !!x);
  if (!ok.length) return null;
  const pick = (k: 'b' | 'a') => ok[0][k].map((_, i) => ok.find((d) => d[k][i] != null)?.[k][i] ?? null);
  return { mid: ok[0].mid, spreadBps: ok[0].spreadBps, b: pick('b'), a: pick('a') };
}

/** 몇 초 간격으로 뜬 표본 평균(순간 깜빡임 완화). 구간값은 있는 표본만 평균 */
export function avgDepth(samples: (BandDepth | null)[]): BandDepth | null {
  const ok = samples.filter((x): x is BandDepth => !!x);
  if (!ok.length) return null;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const col = (k: 'b' | 'a') => ok[0][k].map((_, i) => { const v = ok.map((d) => d[k][i]).filter((x): x is number => x != null); return v.length ? mean(v) : null; });
  return { mid: mean(ok.map((d) => d.mid)), spreadBps: mean(ok.map((d) => d.spreadBps)), b: col('b'), a: col('a') };
}

/** 매수 잔량 비중(0~1) — 0.5 초과면 매수벽이 두꺼움. 분석 때 쓰는 파생값(기록엔 원본 b·a만) */
export function imbalance(b: number | null, a: number | null): number | null {
  return b == null || a == null || b + a <= 0 ? null : b / (b + a);
}

export interface LiqEvent { ts: number; side: 'long' | 'short'; coins: number }
export interface LiqBucket { t: number; l: number; sh: number; nl: number; ns: number; mx: number }

/**
 * 청산 체결을 15분 버킷으로 집계 — [from, to) 의 모든 버킷을 내보낸다(청산 없던 버킷도 0으로:
 * '없었다'와 '못 모았다'를 구분하기 위해). l = 롱 청산 코인 수량, sh = 숏 청산, mx = 가장 큰 한 건.
 */
export function liqBuckets(events: LiqEvent[], from: number, to: number, bucketMs = BUCKET_MS): LiqBucket[] {
  const out: LiqBucket[] = [];
  const idx = new Map<number, LiqBucket>();
  for (let t = Math.ceil(from / bucketMs) * bucketMs; t + bucketMs <= to; t += bucketMs) { const b = { t, l: 0, sh: 0, nl: 0, ns: 0, mx: 0 }; out.push(b); idx.set(t, b); }
  for (const e of events) {
    const b = idx.get(Math.floor(e.ts / bucketMs) * bucketMs);
    if (!b || !(e.coins > 0)) continue;
    if (e.side === 'long') { b.l += e.coins; b.nl++; } else { b.sh += e.coins; b.ns++; }
    if (e.coins > b.mx) b.mx = e.coins;
  }
  return out;
}

/** 저장용 반올림 — 유효숫자 6자리(파일 크기) */
export const r6 = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)));
export const utcDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);
