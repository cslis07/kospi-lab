/**
 * 매매 복기 — "왜 지고 있는가"를 과거 사실로 드러낸다.
 *
 * 이 앱의 엔진은 방향을 못 맞힌다(측정됨). 그래서 가치는 예측이 아니라 거울에 있다:
 * 내가 실제로 어떻게 매매했는지를 정직하게 비춘다. 거래소 대조로 실현손익이 들어온 지금,
 * 계획 유무·방향·시간대·연속손절로 쪼개 보면 손실의 '기계적 원인'이 보인다.
 *
 * ⚠ 이 파일은 예측을 하지 않는다. "다음에 오를 종목"이 아니라 "당신의 습관"만 말한다.
 * 순수 함수 — tests/engine.test.ts 로 고정한다.
 */

export interface RetroEntry {
  ts: number;                       // 기록 시각(ms)
  direction: 'long' | 'short' | 'wait';
  result: 'open' | 'win' | 'loss' | 'even';
  realizedUsdt?: number | null;
  entry?: number;
  stop?: number;                    // >0 이면 '계획 있음'의 근거
  seedUsdt?: number | null;
  riskPct?: number | null;
  notionUsdt?: number | null;
}

export interface RetroSlice {
  label: string;
  n: number;
  wins: number;
  losses: number;
  winRate: number | null;           // even 제외
  realizedUsdt: number | null;      // 실현손익 입력분 합계
  realizedCount: number;
}

export interface RetroInsight { level: 'high' | 'mid' | 'info'; text: string }

export interface Retro {
  totalClosed: number;
  planned: RetroSlice;
  unplanned: RetroSlice;
  long: RetroSlice;
  short: RetroSlice;
  byHour: RetroSlice[];             // 값이 있는 시간대만
  byWeekday: RetroSlice[];          // 값이 있는 요일만(일~토)
  maxLossStreak: number;
  currentLossStreak: number;
  insights: RetroInsight[];
}

const KST = 9 * 3600_000;
const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** 계획이 있는 매매인가 — 손절가가 정의돼 있으면 '계획 있음'으로 본다(거래소 자동수집은 stop=0). */
export function hasPlan(e: RetroEntry): boolean {
  return (e.stop ?? 0) > 0 && (e.entry ?? 0) > 0;
}

function slice(label: string, rows: RetroEntry[]): RetroSlice {
  const closed = rows.filter((r) => r.result !== 'open');
  const wins = closed.filter((r) => r.result === 'win').length;
  const losses = closed.filter((r) => r.result === 'loss').length;
  const decided = wins + losses;
  const withU = closed.filter((r) => r.realizedUsdt != null);
  return {
    label, n: closed.length, wins, losses,
    winRate: decided ? (wins / decided) * 100 : null,
    realizedUsdt: withU.length ? withU.reduce((a, r) => a + (r.realizedUsdt ?? 0), 0) : null,
    realizedCount: withU.length,
  };
}

const usd = (v: number | null) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${Math.round(v)}`);

export function buildRetro(entries: RetroEntry[]): Retro {
  const closed = entries.filter((e) => e.result !== 'open');
  const planned = slice('계획한 매매', closed.filter(hasPlan));
  const unplanned = slice('계획 없이 친 매매', closed.filter((e) => !hasPlan(e)));
  const long = slice('롱', closed.filter((e) => e.direction === 'long'));
  const short = slice('숏', closed.filter((e) => e.direction === 'short'));

  // 시간대·요일 (KST). 값이 있는 버킷만 반환한다(빈 24칸은 노이즈)
  const hourMap = new Map<number, RetroEntry[]>();
  const wdMap = new Map<number, RetroEntry[]>();
  for (const e of closed) {
    const d = new Date(e.ts + KST);
    const h = d.getUTCHours(), w = d.getUTCDay();
    if (!hourMap.has(h)) hourMap.set(h, []);
    hourMap.get(h)!.push(e);
    if (!wdMap.has(w)) wdMap.set(w, []);
    wdMap.get(w)!.push(e);
  }
  const byHour = [...hourMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([h, rows]) => slice(`${String(h).padStart(2, '0')}시`, rows));
  const byWeekday = [...wdMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([w, rows]) => slice(`${WD[w]}요일`, rows));

  // 연속 손절 — 시간순(오래된→최신)으로 최대 스트릭
  const chron = [...closed].sort((a, b) => a.ts - b.ts);
  let maxStreak = 0, cur = 0, tailStreak = 0;
  for (const e of chron) {
    if (e.result === 'loss') { cur++; maxStreak = Math.max(maxStreak, cur); }
    else if (e.result === 'win') cur = 0;
    // even 은 스트릭을 끊지도 잇지도 않음
  }
  // 현재(최근) 연속 손절 — 뒤에서부터
  for (let i = chron.length - 1; i >= 0; i--) {
    if (chron[i].result === 'even') continue;
    if (chron[i].result === 'loss') tailStreak++; else break;
  }

  /* ── 자동 유도 통찰(예측 아님, 과거 서술) ── */
  const insights: RetroInsight[] = [];
  if (unplanned.n > 0 && unplanned.n / closed.length >= 0.4) {
    const lvl: RetroInsight['level'] = unplanned.realizedUsdt != null && unplanned.realizedUsdt < 0 ? 'high' : 'mid';
    insights.push({ level: lvl,
      text: `청산 ${closed.length}건 중 ${unplanned.n}건(${Math.round(unplanned.n / closed.length * 100)}%)이 계획(손절·사이징) 없이 친 매매`
        + (unplanned.realizedUsdt != null ? ` — 실현 ${usd(unplanned.realizedUsdt)} USDT` : '')
        + '. 진입 전 실행가능 판정을 통과시키면 최소한 계획은 남습니다.' });
  }
  if (planned.realizedUsdt != null && unplanned.realizedUsdt != null && planned.realizedCount >= 2 && unplanned.realizedCount >= 2) {
    const pAvg = planned.realizedUsdt / planned.realizedCount, uAvg = unplanned.realizedUsdt / unplanned.realizedCount;
    if (pAvg - uAvg > 1) insights.push({ level: 'mid', text: `계획한 매매 평균 ${usd(pAvg)} vs 계획 없는 매매 평균 ${usd(uAvg)} USDT — 계획이 있을 때 성적이 낫습니다.` });
  }
  if (long.n >= 3 && short.n >= 3 && long.winRate != null && short.winRate != null) {
    const diff = long.winRate - short.winRate;
    if (Math.abs(diff) >= 15) insights.push({ level: 'info',
      text: `${diff > 0 ? '롱' : '숏'} 승률(${(diff > 0 ? long.winRate : short.winRate).toFixed(0)}%)이 반대(${(diff > 0 ? short.winRate : long.winRate).toFixed(0)}%)보다 뚜렷이 높습니다 — 약한 방향은 크기를 줄이거나 피하세요.` });
  }
  const worstHour = byHour.filter((h) => h.n >= 3 && h.winRate != null).sort((a, b) => (a.winRate! - b.winRate!))[0];
  if (worstHour && worstHour.winRate! < 40) insights.push({ level: 'info', text: `${worstHour.label} 매매 승률 ${worstHour.winRate!.toFixed(0)}%(${worstHour.n}건) — 이 시간대 진입을 재검토하세요.` });
  if (maxStreak >= 3) insights.push({ level: maxStreak >= 5 ? 'high' : 'mid',
    text: `최대 ${maxStreak}연속 손절 이력 — 연패 직후의 '복구 매매'가 손실을 키웁니다. 서킷브레이커로 끊으세요.` });
  if (tailStreak >= 2) insights.push({ level: 'high', text: `지금 ${tailStreak}연속 손절 중 — 다음 진입은 크기를 줄이거나 하루 쉬는 것을 권합니다.` });

  return { totalClosed: closed.length, planned, unplanned, long, short, byHour, byWeekday, maxLossStreak: maxStreak, currentLossStreak: tailStreak, insights };
}
