/**
 * 매매일지 성적 실측 — 순수 함수(테스트로 고정).
 *
 * 이 앱은 진입 엣지가 없다(측정으로 확인). 정직한 핵심 가치는 "엔진이 뭐라 하든
 * 내가 실제로 얼마나 버는가"를 재는 것이다. 여기서 그 성적표를 계산한다.
 *
 * 두 저널(코인·주식)의 공통 최소 형태만 받는다.
 */

export interface JournalRow {
  ts: number;
  result: 'open' | 'win' | 'loss' | 'even';
  resultR: number | null;
  realizedUsdt?: number | null;
}

export interface WindowStat {
  label: string;
  closed: number;
  winRate: number | null;   // %
  avgR: number | null;      // 평균 R (기대값)
}

export interface Scoreboard {
  total: number;
  open: number;             // 미청산(결과 미입력)
  closed: number;
  wins: number;
  losses: number;
  evens: number;
  winRate: number | null;
  avgR: number | null;      // 기대값 R
  bestR: number | null;
  worstR: number | null;
  /** 미청산 비율 — 높으면 "기록만 하고 결과를 안 채운다"는 규율 문제 신호 */
  openRatio: number;
  /** 실현손익 합계(입력된 건만) + 입력 건수 */
  realizedUsdt: number | null;
  realizedCount: number;
  windows: WindowStat[];    // 7일 / 30일 / 전체
  /** R 분포 히스토그램 (버킷) */
  rBuckets: { label: string; count: number }[];
}

const DAY = 86_400_000;

function windowStat(label: string, rows: JournalRow[]): WindowStat {
  const closed = rows.filter((r) => r.result !== 'open');
  const w = closed.filter((r) => r.result === 'win').length;
  const l = closed.filter((r) => r.result === 'loss').length;
  const decided = w + l;   // even 은 승률 분모에서 제외
  return {
    label,
    closed: closed.length,
    winRate: decided ? (w / decided) * 100 : null,
    avgR: closed.length ? closed.reduce((a, r) => a + (r.resultR ?? 0), 0) / closed.length : null,
  };
}

export function scoreboard(rows: JournalRow[], now = Date.now()): Scoreboard {
  const closed = rows.filter((r) => r.result !== 'open');
  const wins = closed.filter((r) => r.result === 'win');
  const losses = closed.filter((r) => r.result === 'loss');
  const evens = closed.filter((r) => r.result === 'even');
  const decided = wins.length + losses.length;
  const rValues = closed.map((r) => r.resultR).filter((x): x is number => x != null);
  const withUsdt = closed.filter((r) => r.realizedUsdt != null);

  const buckets = [
    { label: '≤ −1R', test: (r: number) => r <= -1 },
    { label: '−1 ~ 0', test: (r: number) => r > -1 && r < 0 },
    { label: '0 ~ +1', test: (r: number) => r >= 0 && r < 1 },
    { label: '+1 ~ +1.5', test: (r: number) => r >= 1 && r < 1.5 },
    { label: '≥ +1.5R', test: (r: number) => r >= 1.5 },
  ];

  return {
    total: rows.length,
    open: rows.length - closed.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    evens: evens.length,
    winRate: decided ? (wins.length / decided) * 100 : null,
    avgR: closed.length ? closed.reduce((a, r) => a + (r.resultR ?? 0), 0) / closed.length : null,
    bestR: rValues.length ? Math.max(...rValues) : null,
    worstR: rValues.length ? Math.min(...rValues) : null,
    openRatio: rows.length ? (rows.length - closed.length) / rows.length : 0,
    realizedUsdt: withUsdt.length ? withUsdt.reduce((a, r) => a + (r.realizedUsdt ?? 0), 0) : null,
    realizedCount: withUsdt.length,
    windows: [
      windowStat('최근 7일', rows.filter((r) => now - r.ts <= 7 * DAY)),
      windowStat('최근 30일', rows.filter((r) => now - r.ts <= 30 * DAY)),
      windowStat('전체', rows),
    ],
    rBuckets: buckets.map((b) => ({ label: b.label, count: rValues.filter(b.test).length })),
  };
}
