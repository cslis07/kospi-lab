/**
 * 실행 가능 판정 (Go / No-Go) — "사도 되는가"에 정직하게 답하는 방법.
 *
 * 이 앱의 엔진은 **방향을 못 맞힌다**는 것이 측정으로 확인됐다
 * (코인 49.7%·41.7%, 주식 54.1%인데 진입 필터 없는 대조군이 54.8%).
 * 그래서 "오를 것이다"는 말할 수 없다. 하지만 방향 예측 없이도 확실히 답할 수 있는 질문이 있다:
 *
 *   "내가 고른 이 방향으로, 이 크기로 걸었을 때 감당할 수 있는가?"
 *
 * 이건 예측이 아니라 계좌 상태와 산수라서 근거가 있다. 그래서 여기서는 단언한다.
 * ⚠ GO 는 "사면 돈을 번다"가 아니라 **"틀려도 계좌가 버틴다"**는 뜻이다. 이 구분이 이 파일의 전부다.
 *
 * 순수 함수 — tests/engine.test.ts 로 고정한다(돈이 걸린 판정).
 */

export interface TradePlan {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target1?: number | null;
  /** 시드(USDT) */
  seed: number;
  /** 1회 허용손실 % */
  riskPct: number;
  /** 사용자가 고른 레버리지 */
  leverage: number;
  /** 계획 노션(USDT) */
  notion: number;
  /** 필요 증거금(USDT) */
  margin: number;
  /** 청산여유 ÷ 손절거리 (lib/positionSizing.liqSafety) */
  liqSafety: number;
  /** 중대 이벤트까지 남은 시간(h). 없으면 null */
  eventHoursUntil?: number | null;
  eventTitle?: string | null;
  /** 손실 서킷브레이커 상태(선택) — blocked 면 크기와 무관하게 진입 금지 */
  breaker?: { blocked: boolean; reason: string } | null;
  /** 계좌 맥락(선택) — 없으면 해당 검사는 '확인 불가'로 남긴다 */
  account?: {
    /** 기존 같은 방향 익스포저(USDT 환산) */
    sameSideExposure: number;
    /** 기존 전체 익스포저(USDT 환산) */
    totalExposure: number;
  } | null;
}

export type CheckState = 'pass' | 'fail' | 'unknown';

export interface GateCheck {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  /** 실패했을 때 무엇을 바꾸면 되는지 — 판정만 하고 길을 안 알려주면 쓸모가 없다 */
  fix?: string;
  /** 크기 조정으로 해결되는 실패인가(= 방향·타이밍 문제가 아님) */
  resizable?: boolean;
}

export interface GateResult {
  verdict: 'go' | 'resize' | 'no';
  headline: string;
  checks: GateCheck[];
  /** 크기 조정 권고 — resize 일 때 채워진다 */
  suggest: {
    maxLeverage?: number;
    maxRiskPct?: number;
    maxNotion?: number;
  };
  /** 손절 시 실제 손실(USDT)과 계좌 대비 % */
  lossAtStop: number;
  lossPctOfSeed: number;
}

/** 기본 한도 — 개인 재량이지만 기본값은 보수적으로 둔다 */
export const LIMITS = {
  maxRiskPctPerTrade: 2,      // 1회 매매가 시드에서 가져갈 수 있는 최대 %
  minLiqSafety: 2,            // 청산선은 손절선의 최소 2배 거리
  minRR: 1,                   // 손익비 1 미만이면 산수가 불리하다
  maxSameSidePct: 70,         // 한 방향 쏠림 상한(기존+이번)
  eventBlockHours: 12,        // 중대 이벤트 12시간 내 진입 차단
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function evaluateTradeGate(p: TradePlan): GateResult {
  const checks: GateCheck[] = [];
  const suggest: GateResult['suggest'] = {};

  /* 0) 손실 서킷브레이커 — 방향·크기 이전에, 오늘 더 매매하면 안 되는 상태인가 */
  if (p.breaker?.blocked) {
    checks.push({ id: 'breaker', label: '서킷브레이커', state: 'fail',
      detail: p.breaker.reason,
      fix: '연패·손실 한도에 걸렸습니다. 크기를 줄여도 해결되지 않습니다 — 오늘은 진입을 멈추세요.' });
  }

  const dirOk = p.direction === 'long' ? p.stop < p.entry : p.stop > p.entry;
  const stopDist = p.entry > 0 ? Math.abs(p.entry - p.stop) / p.entry : 0;
  const lossAtStop = p.notion * stopDist;
  const lossPctOfSeed = p.seed > 0 ? (lossAtStop / p.seed) * 100 : 0;

  /* 1) 손절이 정의됐는가 — 이게 없으면 나머지 계산이 전부 무의미하다 */
  checks.push(
    !(p.stop > 0) || !(p.entry > 0)
      ? { id: 'stop', label: '손절가 정의', state: 'fail', detail: '손절가가 없습니다.',
          fix: '손절가를 먼저 정하세요. 손절 없는 진입은 최대 손실이 무한합니다.' }
      : !dirOk
        ? { id: 'stop', label: '손절가 정의', state: 'fail',
            detail: `${p.direction === 'long' ? '롱인데 손절가가 진입가 위' : '숏인데 손절가가 진입가 아래'}에 있습니다.`,
            fix: `${p.direction === 'long' ? '손절가를 진입가 아래로' : '손절가를 진입가 위로'} 옮기세요.` }
        : { id: 'stop', label: '손절가 정의', state: 'pass', detail: `손절거리 ${(stopDist * 100).toFixed(2)}%` },
  );

  /* 2) 손절 시 손실이 계좌가 견딜 크기인가 */
  if (p.seed > 0 && p.notion > 0 && dirOk) {
    const over = lossPctOfSeed > LIMITS.maxRiskPctPerTrade;
    if (over) suggest.maxNotion = Math.floor((p.seed * LIMITS.maxRiskPctPerTrade / 100) / (stopDist || 1));
    checks.push({
      id: 'risk', label: '계좌 대비 손실', state: over ? 'fail' : 'pass',
      detail: `손절 시 -${lossAtStop.toFixed(1)} USDT (시드의 ${lossPctOfSeed.toFixed(2)}%)`,
      fix: over ? `1회 손실을 시드의 ${LIMITS.maxRiskPctPerTrade}% 이내로 — 노션 ${suggest.maxNotion?.toLocaleString()} USDT 이하로 줄이세요.` : undefined,
      resizable: true,
    });
  } else {
    checks.push({ id: 'risk', label: '계좌 대비 손실', state: 'unknown', detail: '시드·노션이 없어 계산할 수 없습니다.' });
  }

  /* 3) 손절 전에 청산되지는 않는가 — 리스크 도구의 핵심 */
  const liqBad = p.liqSafety < LIMITS.minLiqSafety;
  if (liqBad) suggest.maxLeverage = Math.max(1, Math.floor(p.leverage * (p.liqSafety / LIMITS.minLiqSafety)));
  checks.push({
    id: 'liq', label: '청산 여유', state: Number.isFinite(p.liqSafety) ? (liqBad ? 'fail' : 'pass') : 'unknown',
    detail: `청산선이 손절선의 ${p.liqSafety.toFixed(1)}배 거리`,
    fix: liqBad ? `손절 전에 강제청산될 수 있습니다. 레버리지를 ${suggest.maxLeverage}배 이하로 낮추세요.` : undefined,
    resizable: true,
  });

  /* 4) 이 배율로 실제 실행이 가능한가 */
  if (p.seed > 0 && p.margin > 0) {
    const cant = p.margin > p.seed;
    if (cant) suggest.maxRiskPct = r2(Math.max(0.05, (p.riskPct * p.seed) / p.margin));
    checks.push({
      id: 'margin', label: '증거금 실행 가능', state: cant ? 'fail' : 'pass',
      detail: `필요 증거금 ${Math.round(p.margin).toLocaleString()} / 시드 ${Math.round(p.seed).toLocaleString()} USDT`,
      fix: cant ? `증거금이 시드를 넘습니다. 허용손실을 ${suggest.maxRiskPct}% 이하로 낮추거나 손절폭이 넓어질 때까지 기다리세요.` : undefined,
      resizable: true,
    });
  }

  /* 5) 손익비 — 방향을 못 맞혀도 산수는 맞아야 한다 */
  if (p.target1 != null && p.target1 > 0 && dirOk) {
    const risk = Math.abs(p.entry - p.stop);
    const rr = risk > 0 ? Math.abs(p.target1 - p.entry) / risk : 0;
    checks.push({
      id: 'rr', label: '손익비', state: rr >= LIMITS.minRR ? 'pass' : 'fail',
      detail: `1 : ${rr.toFixed(2)}`,
      fix: rr < LIMITS.minRR ? '목표까지 거리가 손절보다 짧습니다. 승률이 아주 높지 않으면 산수가 불리합니다.' : undefined,
    });
  }

  /* 6) 방향 쏠림 — 종목을 나눠도 같은 방향이면 한 베팅이다 */
  if (p.account && p.account.totalExposure >= 0) {
    const after = p.account.sameSideExposure + p.notion;
    const total = p.account.totalExposure + p.notion;
    const pctAfter = total > 0 ? (after / total) * 100 : 0;
    const first = p.account.totalExposure <= 0;
    const bad = pctAfter > LIMITS.maxSameSidePct && !first;
    checks.push({
      id: 'skew', label: '방향 쏠림', state: bad ? 'fail' : 'pass',
      // 열린 포지션이 없으면 '비중 100%'는 쏠림이 아니라 그냥 첫 포지션이다 — 그대로 쓰면 오해를 준다
      detail: first
        ? '열린 포지션 없음 — 이 매매가 첫 포지션'
        : `진입 후 ${p.direction === 'long' ? '롱' : '숏'} 비중 ${pctAfter.toFixed(0)}%`,
      fix: bad ? '이미 같은 방향에 몰려 있습니다. 이 진입은 분산이 아니라 같은 베팅을 키우는 것입니다.' : undefined,
    });
  } else {
    checks.push({ id: 'skew', label: '방향 쏠림', state: 'unknown', detail: '계좌 포지션을 읽지 못해 확인 불가' });
  }

  /* 7) 이벤트 — 방향 예측이 불가능한 구간은 피한다 */
  if (p.eventHoursUntil != null) {
    const near = p.eventHoursUntil >= 0 && p.eventHoursUntil < LIMITS.eventBlockHours;
    checks.push({
      id: 'event', label: '이벤트 회피', state: near ? 'fail' : 'pass',
      detail: near ? `${p.eventTitle ?? '중대 이벤트'} ${p.eventHoursUntil.toFixed(1)}시간 전` : '임박한 이벤트 없음',
      fix: near ? '지표 발표 전후는 방향과 무관하게 변동성이 튑니다. 발표 후로 미루세요.' : undefined,
    });
  }

  /* ── 종합 ── */
  const fails = checks.filter((c) => c.state === 'fail');
  const hardFail = fails.some((c) => !c.resizable);
  const verdict: GateResult['verdict'] = !fails.length ? 'go' : hardFail ? 'no' : 'resize';

  const headline =
    verdict === 'go'
      ? `실행 가능 — 손절 시 시드의 ${lossPctOfSeed.toFixed(2)}%를 잃습니다`
      : verdict === 'resize'
        ? '크기를 줄이면 실행 가능합니다'
        : fails[0]?.fix ?? '지금 이 조건으로는 실행하지 마세요';

  return { verdict, headline, checks, suggest, lossAtStop: r2(lossAtStop), lossPctOfSeed: r2(lossPctOfSeed) };
}
