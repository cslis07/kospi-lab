/**
 * 매매별 '셋업(진입 근거)·실수' 태그 — 매매일지 오버레이의 단일 소스(참고: Edgewonk·TraderSync).
 * 방향 예측이 아니라 복기용: 어떤 셋업이 실제로 돈이 되고, 어떤 실수가 계좌를 깎는지 태그별로 되짚는다.
 * 한 매매에 여러 태그를 달 수 있고(돌파 + 추격 등), 그 매매는 각 태그 집계에 모두 반영된다.
 */
import type { TradePosition } from './tradeReport';

export interface TagMeta { key: string; label: string; emoji: string }

/** 셋업 = 왜 들어갔나(진입 근거) */
export const SETUPS: TagMeta[] = [
  { key: 'breakout', label: '돌파',            emoji: '🚀' },
  { key: 'pullback', label: '눌림목·되돌림',   emoji: '↩️' },
  { key: 'support',  label: '지지·저항 반등',   emoji: '🧱' },
  { key: 'trend',    label: '추세추종',         emoji: '📈' },
  { key: 'reversal', label: '역추세·반전',      emoji: '🔄' },
  { key: 'range',    label: '레인지 상·하단',   emoji: '↔️' },
  { key: 'news',     label: '뉴스·이벤트',      emoji: '📰' },
  { key: 'pattern',  label: '패턴(수렴 등)',    emoji: '📐' },
];

/** 실수 = 무엇을 잘못했나(복기) */
export const MISTAKES: TagMeta[] = [
  { key: 'noplan',    label: '계획 없이 진입',   emoji: '🎲' },
  { key: 'nostop',    label: '손절 미준수',      emoji: '🛑' },
  { key: 'chase',     label: '추격 진입',        emoji: '🏃' },
  { key: 'avg_down',  label: '물타기',           emoji: '💧' },
  { key: 'early_exit',label: '조기 익절',        emoji: '✂️' },
  { key: 'overlev',   label: '과도한 레버리지',   emoji: '⚡' },
  { key: 'counter',   label: '역추세 고집',      emoji: '🦾' },
  { key: 'oversize',  label: '과도한 사이징',     emoji: '🏋️' },
];

export const SETUP_BY_KEY = new Map(SETUPS.map((t) => [t.key, t]));
export const MISTAKE_BY_KEY = new Map(MISTAKES.map((t) => [t.key, t]));

export type TagKind = 'setup' | 'mistake';

/** 한 매매에 붙은 태그(셋업·실수 각각 여러 개) + 진입 당시 확신(신뢰도) 1~5 */
export interface TradeTagSet { setups: string[]; mistakes: string[]; conviction?: number }

/** 진입 확신(신뢰도) 1~5 — 참고: Edgewonk 'Conviction'. 확신과 실제 결과가 맞는지 복기용 */
export const CONVICTIONS: { level: number; label: string; emoji: string }[] = [
  { level: 1, label: '매우 낮음', emoji: '🥶' },
  { level: 2, label: '낮음',     emoji: '😕' },
  { level: 3, label: '보통',     emoji: '😐' },
  { level: 4, label: '높음',     emoji: '🙂' },
  { level: 5, label: '매우 높음', emoji: '🔥' },
];
export const convictionLabel = (lv: number) => CONVICTIONS.find((c) => c.level === lv)?.label ?? `${lv}`;

export interface TagStat {
  key: string;
  label: string;
  emoji: string;
  count: number;
  wins: number;
  winRate: number | null; // %
  netSum: number;         // 순손익 합계(USDT)
  avg: number | null;     // 건당 평균
}

/**
 * 태그별 성적 — 해당 종류(셋업/실수)의 태그가 붙은 매매만. 건수 많은 순, 같으면 순손익 큰 순.
 * 알 수 없는(정의에 없는) 태그 키는 버린다.
 */
export function tagStats(
  positions: TradePosition[],
  tagsById: Record<string, TradeTagSet | undefined>,
  kind: TagKind,
): TagStat[] {
  const meta = kind === 'setup' ? SETUP_BY_KEY : MISTAKE_BY_KEY;
  const byTag = new Map<string, TradePosition[]>();
  for (const p of positions) {
    const set = tagsById[p.positionId];
    const keys = kind === 'setup' ? set?.setups : set?.mistakes;
    if (!keys?.length) continue;
    for (const k of new Set(keys)) {           // 같은 태그 중복 입력은 1회만
      if (!meta.has(k)) continue;
      const arr = byTag.get(k);
      if (arr) arr.push(p); else byTag.set(k, [p]);
    }
  }

  const out: TagStat[] = [];
  for (const [key, list] of byTag) {
    const m = meta.get(key)!;
    const wins = list.filter((p) => p.netProfit > 0).length;
    const netSum = list.reduce((a, p) => a + p.netProfit, 0);
    out.push({
      key, label: m.label, emoji: m.emoji,
      count: list.length, wins,
      winRate: list.length ? (wins / list.length) * 100 : null,
      netSum, avg: list.length ? netSum / list.length : null,
    });
  }
  return out.sort((a, b) => b.count - a.count || b.netSum - a.netSum);
}

/** 태그가 하나라도 있으면 true(행 표식용) — 확신만 매긴 매매도 포함 */
export function hasAnyTag(set: TradeTagSet | undefined): boolean {
  return !!set && (set.setups.length > 0 || set.mistakes.length > 0 || set.conviction != null);
}

/** 확신 4~5 = 높음, 1~3 = 낮음 (셋업×확신 교차의 두 묶음) */
export const HIGH_CONVICTION = 4;

export interface ConvSplit { count: number; wins: number; winRate: number | null; netSum: number; avg: number | null }
export interface SetupConvictionStat {
  key: string; label: string; emoji: string;
  count: number;             // 셋업 + 확신 둘 다 있는 매매
  avgConviction: number;     // 평균 확신(1~5)
  winRate: number | null; netSum: number; avg: number | null;
  high: ConvSplit;           // 확신 4~5
  low: ConvSplit;            // 확신 1~3
  /** 표본 충분(high·low 각 3건+)일 때만: 확신 높을 때가 실제로 더 좋았나 */
  calibration: 'good' | 'poor' | null;
}

function split(list: TradePosition[]): ConvSplit {
  const wins = list.filter((p) => p.netProfit > 0).length;
  const decided = list.filter((p) => p.netProfit !== 0).length;
  const netSum = list.reduce((a, p) => a + p.netProfit, 0);
  return { count: list.length, wins, winRate: decided ? (wins / decided) * 100 : null, netSum, avg: list.length ? netSum / list.length : null };
}

/**
 * 태그 × 확신 교차(참고: Edgewonk) — 셋업/실수 태그별로 확신 높음(4~5)/낮음(1~3) 성적을 비교.
 * 태그와 확신을 **둘 다** 매긴 매매만. calibration: 양쪽 3건+ 일 때 확신 높을 때 건당 성적이 더 좋았는지.
 * 방향 예측 아님 — 자기 확신이 결과와 맞는지 복기용. 건수 많은 순.
 */
export function convictionByTag(
  positions: TradePosition[],
  tagsById: Record<string, TradeTagSet | undefined>,
  kind: TagKind,
): SetupConvictionStat[] {
  const meta = kind === 'setup' ? SETUP_BY_KEY : MISTAKE_BY_KEY;
  const byTag = new Map<string, { list: TradePosition[]; convSum: number }>();
  for (const p of positions) {
    const set = tagsById[p.positionId];
    const lv = set?.conviction;
    const keys = kind === 'setup' ? set?.setups : set?.mistakes;
    if (lv == null || lv < 1 || lv > 5 || !keys?.length) continue;
    for (const k of new Set(keys)) {
      if (!meta.has(k)) continue;
      const e = byTag.get(k);
      if (e) { e.list.push(p); e.convSum += lv; } else byTag.set(k, { list: [p], convSum: lv });
    }
  }

  const out: SetupConvictionStat[] = [];
  for (const [key, { list, convSum }] of byTag) {
    const m = meta.get(key)!;
    const high = split(list.filter((p) => (tagsById[p.positionId]!.conviction as number) >= HIGH_CONVICTION));
    const low = split(list.filter((p) => (tagsById[p.positionId]!.conviction as number) < HIGH_CONVICTION));
    const whole = split(list);
    const calibration: SetupConvictionStat['calibration'] =
      high.count >= 3 && low.count >= 3 && high.avg != null && low.avg != null
        ? (high.avg >= low.avg ? 'good' : 'poor')
        : null;
    out.push({
      key, label: m.label, emoji: m.emoji,
      count: list.length, avgConviction: convSum / list.length,
      winRate: whole.winRate, netSum: whole.netSum, avg: whole.avg,
      high, low, calibration,
    });
  }
  return out.sort((a, b) => b.count - a.count || b.netSum - a.netSum);
}

/** 셋업 × 확신 — "어떤 셋업에서 확신이 잘 맞았나" */
export const convictionBySetup = (positions: TradePosition[], tagsById: Record<string, TradeTagSet | undefined>) =>
  convictionByTag(positions, tagsById, 'setup');
/** 실수 × 확신 — "어떤 실수가 어떤 확신대에서 나왔나"(평균 확신 높은 실수 = 과신 중 저지른 실수) */
export const convictionByMistake = (positions: TradePosition[], tagsById: Record<string, TradeTagSet | undefined>) =>
  convictionByTag(positions, tagsById, 'mistake');

/* ── 확신 보정 종합(참고: Edgewonk) — 확신별·셋업×확신·실수×확신을 묶어 한 줄 코칭 ── */
export type ConvictionVerdict = 'calibrated' | 'overconfident' | 'underconfident' | 'mixed' | 'insufficient';
export interface ConvictionCoaching {
  verdict: ConvictionVerdict;
  text: string;
  /** 근거 수치 */
  tagged: number;              // 확신 매긴 매매 수
  highWinRate: number | null;  // 확신 4~5 승률
  lowWinRate: number | null;   // 확신 1~3 승률
  mistakeAvgConv: number | null; // 실수 매매의 평균 확신(높으면 과신)
}

/**
 * 확신이 결과와 맞는 편인지 / 과신 경향인지 한 줄로. 확신을 매긴 매매가 8건 미만이면 insufficient.
 * 신호: ①확신↑일수록 건당 성적↑(calibrated) ②확신 4~5가 1~3보다 못함(over) ③셋업 calibration good−poor ④실수의 평균 확신 높음(over).
 * 방향 예측 아님 — 자기 확신 보정용.
 */
export function convictionCoaching(
  positions: TradePosition[],
  tagsById: Record<string, TradeTagSet | undefined>,
): ConvictionCoaching {
  const levels = convictionStats(positions, tagsById);
  const tagged = levels.reduce((a, r) => a + r.count, 0);
  const high = levels.filter((r) => r.level >= HIGH_CONVICTION);
  const low = levels.filter((r) => r.level < HIGH_CONVICTION);
  const agg = (rows: ConvictionStat[]) => {
    const n = rows.reduce((a, r) => a + r.count, 0);
    const w = rows.reduce((a, r) => a + r.wins, 0);
    const net = rows.reduce((a, r) => a + r.netSum, 0);
    return { n, winRate: n ? (w / n) * 100 : null, avg: n ? net / n : null };
  };
  const hi = agg(high), lo = agg(low);

  // 셋업 calibration
  const setups = convictionBySetup(positions, tagsById);
  const goodN = setups.filter((s) => s.calibration === 'good').length;
  const poorN = setups.filter((s) => s.calibration === 'poor').length;

  // 실수의 평균 확신(가중)
  const mistakes = convictionByMistake(positions, tagsById);
  const mN = mistakes.reduce((a, m) => a + m.count, 0);
  const mistakeAvgConv = mN ? mistakes.reduce((a, m) => a + m.avgConviction * m.count, 0) / mN : null;

  if (tagged < 8) {
    return { verdict: 'insufficient', tagged, highWinRate: hi.winRate, lowWinRate: lo.winRate, mistakeAvgConv,
      text: `확신을 매긴 매매가 ${tagged}건뿐 — 확신이 결과와 맞는지 보려면 더 쌓여야 합니다(8건+).` };
  }

  let over = 0, cal = 0;
  if (hi.avg != null && lo.avg != null && hi.n >= 3 && lo.n >= 3) { if (hi.avg >= lo.avg) cal += 2; else over += 2; }
  cal += goodN; over += poorN;
  if (mistakeAvgConv != null && mN >= 3 && mistakeAvgConv >= 3.6) over += 1;

  let verdict: ConvictionVerdict;
  if (over > cal) verdict = 'overconfident';
  else if (cal > over) verdict = 'calibrated';
  else verdict = 'mixed';

  const hw = hi.winRate != null ? `${Math.round(hi.winRate)}%` : '—';
  const lw = lo.winRate != null ? `${Math.round(lo.winRate)}%` : '—';
  const base = `확신 4~5 승률 ${hw} vs 1~3 ${lw}`;
  let text: string;
  if (verdict === 'calibrated') {
    text = `확신이 결과와 대체로 맞는 편입니다 — ${base}. 확신 높은 자리에 더 무게를 둘 근거가 있습니다(사이징은 리스크 한도 안에서).`;
  } else if (verdict === 'overconfident') {
    const mc = mistakeAvgConv != null && mN >= 3 && mistakeAvgConv >= 3.6 ? ` · 실수 매매 평균 확신 ${mistakeAvgConv.toFixed(1)}(과신 중 저지른 실수 잦음)` : '';
    text = `과신 경향이 보입니다 — ${base}${mc}. 확신이 셀 때일수록 추격·오버사이징을 점검하세요.`;
  } else {
    text = `확신과 결과가 일관되지 않습니다 — ${base}. 확신 기준(무엇을 보고 확신을 높였나)을 다시 정리할 여지가 있습니다.`;
  }
  return { verdict, text, tagged, highWinRate: hi.winRate, lowWinRate: lo.winRate, mistakeAvgConv };
}

/* ── 버킷(히트맵 칸·분해 행)의 셋업·실수 태그 분포 — 드릴다운에 "이 구간엔 어떤 셋업/실수가 많았나" ── */
export interface TagCount { key: string; label: string; emoji: string; count: number }
export interface TagDistribution { setups: TagCount[]; mistakes: TagCount[] }

/** 주어진 매매들의 셋업·실수 태그 빈도(많은 순). 정의에 없는 키는 버린다. */
export function tagDistribution(
  positions: TradePosition[],
  tagsById: Record<string, TradeTagSet | undefined>,
): TagDistribution {
  const tally = (meta: Map<string, TagMeta>, pick: (s: TradeTagSet) => string[] | undefined): TagCount[] => {
    const m = new Map<string, number>();
    for (const p of positions) {
      const set = tagsById[p.positionId];
      if (!set) continue;
      for (const k of new Set(pick(set) ?? [])) if (meta.has(k)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => { const t = meta.get(key)!; return { key, label: t.label, emoji: t.emoji, count }; })
      .sort((a, b) => b.count - a.count);
  };
  return { setups: tally(SETUP_BY_KEY, (s) => s.setups), mistakes: tally(MISTAKE_BY_KEY, (s) => s.mistakes) };
}

export interface ConvictionStat {
  level: number;
  label: string;
  emoji: string;
  count: number;
  wins: number;
  winRate: number | null; // %
  netSum: number;
  avg: number | null;     // 건당 평균 순손익
}

/**
 * 확신(1~5)별 성적 — 확신을 매긴 매매만. 레벨 오름차순.
 * "확신이 높을수록 실제로 잘됐나"(과신·과소평가 점검). 방향 예측 아님 — 자기 판단 보정용.
 */
export function convictionStats(
  positions: TradePosition[],
  tagsById: Record<string, TradeTagSet | undefined>,
): ConvictionStat[] {
  const byLevel = new Map<number, TradePosition[]>();
  for (const p of positions) {
    const lv = tagsById[p.positionId]?.conviction;
    if (lv == null || lv < 1 || lv > 5) continue;
    const arr = byLevel.get(lv); if (arr) arr.push(p); else byLevel.set(lv, [p]);
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => {
      const meta = CONVICTIONS.find((c) => c.level === level)!;
      const wins = list.filter((p) => p.netProfit > 0).length;
      const decided = list.filter((p) => p.netProfit !== 0).length;
      const netSum = list.reduce((a, p) => a + p.netProfit, 0);
      return {
        level, label: meta.label, emoji: meta.emoji,
        count: list.length, wins,
        winRate: decided ? (wins / decided) * 100 : null,
        netSum, avg: list.length ? netSum / list.length : null,
      };
    });
}
