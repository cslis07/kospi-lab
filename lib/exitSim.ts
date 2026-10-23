/**
 * 익절 규칙 몬테카를로 — 내 통계(승률·평균 익절R·평균 손절R)로 서로 다른 익절 규칙의
 * 결과 분포(중앙 자산·p10~p90·최대 낙폭·파산확률)를 비교한다.
 * ⚠ 예측이 아니다. "네 과거 분포가 유지된다면 이 규칙이 실현을 더 키운다"를 보여줄 뿐이고,
 *   규칙 변형(고정/분할/추적)은 명시한 '가정 모델'이다. 방향 적중은 측정상 우위 없음(백테스트 49.7%).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RuleSpec { key: string; label: string; winRate: number; winR: number; lossR: number; note: string }
export interface RuleStat extends RuleSpec {
  evR: number;            // 매매당 기대 R
  median: number;         // 최종 자산 배수 중앙값(시작=1)
  p10: number; p90: number;
  medMaxDD: number;       // 최대 낙폭 중앙값(0~1)
  ruinPct: number;        // 반복 중 파산(자산 ≤ ruinAt) 비율 %
  fan: { p10: number[]; p50: number[]; p90: number[] }; // 매매 수별 자산 분위(그래프용)
}

/** 내 통계(승률·평균 익절R·평균 손절R)에서 비교할 익절 규칙 4종을 만든다. 변형은 명시된 가정. */
export function deriveRules(winRate: number, winR: number, lossR: number): RuleSpec[] {
  const l = -Math.abs(lossR || 1);
  const w = Math.max(0.1, winR);
  return [
    { key: 'actual', label: '내 실제', winRate, winR: w, lossR: l, note: '지금 네 성적 그대로' },
    { key: 'fixed', label: '고정 1.5R 익절', winRate, winR: 1.5, lossR: l, note: '모든 익절을 1.5R에서 끊음' },
    { key: 'scaled', label: '분할 익절', winRate, winR: Math.round((0.95 + 0.2 * w) * 100) / 100, lossR: l, note: '1차50%·2차30%·러너20%(러너=평균 익절R) 가정' },
    { key: 'trail', label: '추적 손절(러너)', winRate: Math.max(5, winRate - 6), winR: Math.round(w * 1.4 * 100) / 100, lossR: l, note: '더 크게 먹되 약간 자주 흔들림(승률 −6%p·익절 ×1.4) 가정' },
  ];
}

const quantile = (arr: number[], p: number): number => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))];
};

/** 규칙 하나를 몬테카를로. 각 매매: 승률로 +winR·R, 아니면 lossR·R. 자산은 1에서 시작해 (1+R·risk%)로 복리. */
export function simulateRule(spec: RuleSpec, trades: number, riskPct: number, runs: number, seed: number, ruinAt = 0.3): RuleStat {
  const rnd = mulberry32(seed);
  const n = Math.max(1, Math.floor(trades));
  const finals: number[] = []; const maxDDs: number[] = []; let ruined = 0;
  const eqAtStep: number[][] = Array.from({ length: n + 1 }, () => [] as number[]);
  const p = spec.winRate / 100;
  for (let r = 0; r < runs; r++) {
    let eq = 1, peak = 1, dd = 0, ruin = false;
    eqAtStep[0].push(1);
    for (let t = 1; t <= n; t++) {
      const R = rnd() < p ? spec.winR : spec.lossR;
      eq *= 1 + (R * riskPct) / 100;
      if (eq <= 0) eq = 0;
      if (eq > peak) peak = eq;
      if (peak > 0) dd = Math.max(dd, (peak - eq) / peak);
      if (eq <= ruinAt) ruin = true;
      eqAtStep[t].push(eq);
    }
    finals.push(eq); maxDDs.push(dd); if (ruin) ruined++;
  }
  return {
    ...spec,
    evR: Math.round((p * spec.winR + (1 - p) * spec.lossR) * 100) / 100,
    median: quantile(finals, 0.5), p10: quantile(finals, 0.1), p90: quantile(finals, 0.9),
    medMaxDD: quantile(maxDDs, 0.5), ruinPct: Math.round((ruined / runs) * 100),
    fan: { p10: eqAtStep.map((a) => quantile(a, 0.1)), p50: eqAtStep.map((a) => quantile(a, 0.5)), p90: eqAtStep.map((a) => quantile(a, 0.9)) },
  };
}

/** 4종 규칙 전체 시뮬 + 추천(중앙 자산 최대, 단 파산확률 높으면 제외) */
export function simulateRules(winRate: number, winR: number, lossR: number, opts: { trades: number; riskPct: number; runs?: number; seed?: number; ruinAt?: number }): { rules: RuleStat[]; bestKey: string } {
  const runs = opts.runs ?? 1500;
  const seed = opts.seed ?? 20260101;
  const rules = deriveRules(winRate, winR, lossR).map((spec, i) => simulateRule(spec, opts.trades, opts.riskPct, runs, seed + i * 7919, opts.ruinAt ?? 0.3));
  // 추천: 파산확률 20% 이하 중 중앙 자산 최대(없으면 그냥 중앙 자산 최대)
  const safe = rules.filter((r) => r.ruinPct <= 20);
  const pool = safe.length ? safe : rules;
  const best = pool.reduce((a, b) => (b.median > a.median ? b : a), pool[0]);
  return { rules, bestKey: best.key };
}

/** 매매일지 기록 1건(코인·주식 공통 최소 필드). 미청산(open)·resultR 없음은 제외된다. */
export interface RecordLike { ts: number; result?: string; resultR?: number | null; riskPct?: number | null }
export interface RecordStats {
  n: number;                 // 쓸 수 있는 마감 기록 수(본전 포함)
  wins: number; losses: number; evens: number;
  winRate: number | null;    // 승/(승+패) % — journalAnalytics.edgeSummary 와 같은 정의(본전 제외)
  avgWinR: number | null;    // 이긴 매매 평균 R(양수)
  avgLossR: number | null;   // 진 매매 평균 |R|(양수)
  perMonth: number | null;   // 월평균 매매 수(기록 기간 1개월 미만이면 1개월로 간주)
  riskPct: number | null;    // 기록된 1회 허용손실 % 의 중앙값(있을 때만)
  spanDays: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 매매일지 R 기록 → 익절 규칙 시뮬 입력(승률·평균 익절R·평균 손절R·월 매매 수·리스크%).
 * "내 과거 기록 기준"일 뿐 예측이 아니다. 표본이 작으면(호출 측에서 n<30 경고) 참고용.
 */
export function statsFromRecords(records: RecordLike[]): RecordStats {
  const use = records.filter((r) => r && r.result !== 'open' && typeof r.resultR === 'number' && Number.isFinite(r.resultR) && Number.isFinite(r.ts));
  const winV = use.filter((r) => (r.resultR as number) > 0).map((r) => r.resultR as number);
  const lossV = use.filter((r) => (r.resultR as number) < 0).map((r) => Math.abs(r.resultR as number));
  const decided = winV.length + lossV.length;
  const avg = (a: number[]) => (a.length ? r2(a.reduce((s, v) => s + v, 0) / a.length) : null);
  const ts = use.map((r) => r.ts);
  const spanDays = ts.length >= 2 ? (Math.max(...ts) - Math.min(...ts)) / 86400000 : 0;
  const perMonth = use.length >= 2 ? Math.round((use.length / Math.max(1, spanDays / 30.4375)) * 10) / 10 : null;
  const risks = use.map((r) => r.riskPct).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const riskPct = risks.length
    ? Math.round((risks.length % 2 ? risks[(risks.length - 1) / 2] : (risks[risks.length / 2 - 1] + risks[risks.length / 2]) / 2) * 10) / 10
    : null;
  return {
    n: use.length, wins: winV.length, losses: lossV.length, evens: use.length - decided,
    winRate: decided ? Math.round((winV.length / decided) * 1000) / 10 : null,
    avgWinR: avg(winV), avgLossR: avg(lossV),
    perMonth, riskPct, spanDays: Math.round(spanDays * 10) / 10,
  };
}
