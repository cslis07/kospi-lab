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

/** 한 매매에 붙은 태그(셋업·실수 각각 여러 개) */
export interface TradeTagSet { setups: string[]; mistakes: string[] }

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

/** 태그가 하나라도 있으면 true(행 표식용) */
export function hasAnyTag(set: TradeTagSet | undefined): boolean {
  return !!set && (set.setups.length > 0 || set.mistakes.length > 0);
}
