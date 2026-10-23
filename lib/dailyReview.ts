/**
 * 일일 매매 복기 — Bitget에서 지난 24시간 청산된 내 매매를, 그 당시 차트·지표 상황과 함께 사후 평가한다.
 * 모닝 브리핑 텔레그램 두 번째 메시지로 보낸다(/api/brief/telegram).
 *
 * ⚠ 예측·매매 신호가 아니다. 전부 결과를 아는 상태의 **실행 품질** 평가(백워드-룩킹)이고, 판정 기준은 아래에 고정한다.
 *   진입: 1H 추세 방향(EMA 정·역배열+EMA20 위치) · 15분 RSI 과열 추격(롱 ≥70/숏 ≤30) · 최근 24봉 안 진입 위치(상·하위 15/25%)
 *         · 거래소 손절 주문 기록 유무와 폭(ATR 0.8~3.5배) · 진입 직후 역행(MAE ≥0.9R 이름 / <0.3R 양호)
 *   청산: 이익 매매 포착률(≥60% 잘함 / <35% 반납) · 순행 뒤 손실 마감(MFE ≥1R 또는 손절 없으면 ≥1%) · 손절가 부근 청산(규칙 준수)
 *         · 손절 없이 −2% 넘게 버팀 · 청산 뒤 4시간 흐름(유리 방향 더 감 / 되돌림)
 *   매매: 비용(수수료+펀딩)이 총이익의 30%↑ · 손실 청산 30분 안 재진입(복구 매매) · 하루 6건↑(과매매) · 3분 미만 손실
 * 판단은 사용자 몫 — 앱은 "무엇이 계획대로였고 무엇이 아니었나"만 보여 준다.
 */
import { fetchClosedPositions, type ClosedPosition } from '@/lib/bitgetPositions';
import { analyzeTrade, tradeExcursion, pickGranularity, type Autopsy, type Excursion } from '@/lib/tradeAutopsy';
import { analyzeTimeframe, tfTrend } from '@/lib/coinAnalysis';
import { geminiBrief } from '@/lib/llmBriefing';

export type Tone = 'good' | 'bad' | 'warn';
export interface Note { tone: Tone; text: string; key: string }
export interface TradeContext {
  /** 진입 직전 1H 추세 */
  h1Trend: 'up' | 'down' | 'flat' | null;
  /** 진입 직전 15분 RSI(14) */
  rsi15: number | null;
  /** 진입 직전 24봉(15분) 고저 안 진입 위치 0(저)~1(고) */
  location: number | null;
  /** 손절가 있을 때만 — 손절 폭·MAE R */
  autopsy: Autopsy | null;
  /** 보유 구간 MAE/MFE */
  ex: Excursion | null;
  /** 청산 뒤 4시간 — 내 방향 기준 추가 순행/역행 % (둘 다 ≥0) */
  post: { favorPct: number; againstPct: number } | null;
}
export interface TradeReview {
  pos: ClosedPosition;
  holdMin: number;
  pnlPct: number;           // 진입 대비 가격 변화 %(내 방향 기준)
  entry: Note[]; exit: Note[]; trade: Note[];
}

const p1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const sgn = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

export function pnlPctOf(p: Pick<ClosedPosition, 'side' | 'openAvg' | 'closeAvg'>): number {
  if (!(p.openAvg > 0)) return 0;
  return ((p.side === 'long' ? p.closeAvg - p.openAvg : p.openAvg - p.closeAvg) / p.openAvg) * 100;
}

/** 순수 — 한 매매 판정. prev = 같은 날 이 매매 직전에 청산된 매매(복구 매매 판정용) */
export function reviewTrade(pos: ClosedPosition, ctx: TradeContext, prev: ClosedPosition | null): TradeReview {
  const long = pos.side === 'long';
  const entry: Note[] = [], exit: Note[] = [], trade: Note[] = [];
  const holdMin = Math.max(0, (pos.closeTs - pos.openTs) / 60_000);
  const pnlPct = pnlPctOf(pos);
  const win = pos.netProfit > 0;

  // ── 진입 ──
  if (ctx.h1Trend === (long ? 'up' : 'down')) entry.push({ tone: 'good', key: 'trend-with', text: `1H 추세 방향(${long ? '상승' : '하락'})으로 진입` });
  else if (ctx.h1Trend === (long ? 'down' : 'up')) entry.push({ tone: 'bad', key: 'trend-against', text: `1H 추세 역행 진입(1H ${long ? '하락' : '상승'} 중 ${long ? '롱' : '숏'})` });
  if (ctx.rsi15 != null) {
    if (long ? ctx.rsi15 >= 70 : ctx.rsi15 <= 30) entry.push({ tone: 'bad', key: 'rsi-chase', text: `15분 RSI ${Math.round(ctx.rsi15)} 과열 구간 추격` });
  }
  if (ctx.location != null) {
    const loc = ctx.location;
    if (long ? loc > 0.85 : loc < 0.15) entry.push({ tone: 'bad', key: 'chase', text: `최근 6시간 ${long ? '고점' : '저점'} 부근 추격 진입(위치 ${Math.round(loc * 100)}%)` });
    else if (long ? loc < 0.25 : loc > 0.75) entry.push({ tone: 'good', key: 'dip', text: `${long ? '눌림(저점 부근)' : '반등(고점 부근)'}에서 진입 — 손절 여유 있는 자리` });
  }
  if (pos.stop == null) entry.push({ tone: 'bad', key: 'no-stop', text: '거래소 손절(SL) 주문 기록 없음' });
  else if (ctx.autopsy?.stopInAtr != null) {
    const a = ctx.autopsy.stopInAtr;
    if (a < 0.8) entry.push({ tone: 'bad', key: 'stop-tight', text: `손절 폭 ${p1(a)} ATR — 너무 타이트` });
    else if (a > 3.5) entry.push({ tone: 'warn', key: 'stop-wide', text: `손절 폭 ${p1(a)} ATR — 넓어 1회 손실 큼` });
    else entry.push({ tone: 'good', key: 'stop-ok', text: `손절 주문 설정, 폭 ${p1(a)} ATR 적정` });
  }
  if (ctx.autopsy?.maeR != null) {
    if (ctx.autopsy.maeR >= 0.9) entry.push({ tone: 'bad', key: 'mae-high', text: `진입 직후 −${ctx.autopsy.maeR}R 역행 — 진입이 이름` });
    else if (ctx.autopsy.maeR < 0.3) entry.push({ tone: 'good', key: 'mae-low', text: `진입 후 역행 ${ctx.autopsy.maeR}R로 미미 — 타이밍 양호` });
  }

  // ── 청산 ──
  const ex = ctx.ex;
  if (win && ex?.capturePct != null) {
    if (ex.capturePct >= 60) exit.push({ tone: 'good', key: 'capture-high', text: `최대 순행 +${p1(ex.mfePct)}% 중 ${ex.capturePct}% 챙김` });
    else if (ex.capturePct < 35) exit.push({ tone: 'warn', key: 'capture-low', text: `최대 +${p1(ex.mfePct)}%까지 갔는데 ${ex.capturePct}%만 챙김(반납·조기 익절)` });
  }
  if (!win && ex) {
    const gaveBack = ex.mfeR != null ? ex.mfeR >= 1 : ex.mfePct >= 1;
    if (gaveBack) exit.push({ tone: 'bad', key: 'gave-back', text: `+${p1(ex.mfePct)}%${ex.mfeR != null ? `(${ex.mfeR}R)` : ''} 순행했는데 손실 마감 — 이익 반납` });
  }
  if (!win && pos.stop != null) {
    const nearStop = Math.abs(pos.closeAvg - pos.stop) / pos.openAvg * 100 <= 0.3;
    if (nearStop) exit.push({ tone: 'good', key: 'stop-kept', text: '손절가에서 정리 — 규칙대로 끊음' });
  }
  if (!win && pos.stop == null && pnlPct <= -2) exit.push({ tone: 'bad', key: 'held-loser', text: `손절 없이 ${sgn(pnlPct)}%까지 버팀` });
  if (ctx.post) {
    const { favorPct, againstPct } = ctx.post;
    if (win) {
      if (favorPct >= Math.max(0.5, Math.abs(pnlPct))) exit.push({ tone: 'warn', key: 'early-exit', text: `청산 뒤 4시간 안에 내 방향으로 ${p1(favorPct)}% 더 감 — 조기 청산` });
      else if (againstPct >= 0.5 && favorPct < 0.3) exit.push({ tone: 'good', key: 'good-exit', text: `청산 뒤 반대로 ${p1(againstPct)}% 되돌림 — 청산 타이밍 좋음` });
    } else {
      if (favorPct >= 1 && againstPct < 0.3) exit.push({ tone: 'warn', key: 'stopped-then-ran', text: `손절 뒤 내 방향으로 ${p1(favorPct)}% 감 — 손절이 타이트했을 수` });
      else if (againstPct >= 0.5) exit.push({ tone: 'good', key: 'loss-capped', text: `청산 뒤 반대로 ${p1(againstPct)}% 더 감 — 끊은 덕에 손실 제한` });
    }
  }

  // ── 매매 전체 ──
  const cost = Math.abs(pos.fee) + Math.max(0, -pos.funding);
  if (pos.grossPnl > 0 && cost / pos.grossPnl >= 0.3) trade.push({ tone: 'bad', key: 'cost', text: `수수료·펀딩이 이익의 ${Math.round((cost / pos.grossPnl) * 100)}%` });
  if (prev && prev.netProfit < 0 && pos.openTs >= prev.closeTs && pos.openTs - prev.closeTs <= 30 * 60_000)
    trade.push({ tone: 'bad', key: 'revenge', text: `손실 청산 ${Math.round((pos.openTs - prev.closeTs) / 60_000)}분 뒤 재진입 — 복구 매매 의심` });
  if (holdMin < 3 && !win) trade.push({ tone: 'warn', key: 'scalp-loss', text: `${Math.max(1, Math.round(holdMin))}분 초단타 손실` });

  return { pos, holdMin, pnlPct, entry, exit, trade };
}

export interface DaySummary {
  n: number; wins: number; net: number; cost: number;
  good: number; bad: number;
  /** 가장 자주 나온 실수·잘한 점(키 → 문구 대표) */
  topBad: { key: string; count: number; label: string } | null;
  topGood: { key: string; count: number; label: string } | null;
  /** 하루 평균 OVERTRADE_N 건 이상 */
  overtrade: boolean;
}

const LABEL: Record<string, string> = {
  'trend-against': '추세 역행 진입', 'rsi-chase': '과열 추격', chase: '고점·저점 추격', 'no-stop': '손절 주문 없음', 'stop-tight': '타이트한 손절',
  'mae-high': '이른 진입', 'gave-back': '이익 반납', 'held-loser': '손절 없이 버팀', cost: '비용 과다', revenge: '복구 매매',
  'capture-low': '수익 반납·조기 익절', 'early-exit': '조기 청산', 'stopped-then-ran': '타이트한 손절', 'scalp-loss': '초단타 손실', 'stop-wide': '넓은 손절',
  'trend-with': '추세 방향 진입', dip: '눌림·반등 진입', 'stop-ok': '손절 설정', 'mae-low': '진입 타이밍', 'capture-high': '수익 포착',
  'stop-kept': '손절 규칙 준수', 'good-exit': '청산 타이밍', 'loss-capped': '손실 제한',
};

export const OVERTRADE_N = 6;

export function summarizeDay(rs: TradeReview[], hours = 24): DaySummary {
  const notes = rs.flatMap((r) => [...r.entry, ...r.exit, ...r.trade]);
  const top = (tone: Tone[]) => {
    const m = new Map<string, number>();
    for (const n of notes) if (tone.includes(n.tone)) m.set(n.key, (m.get(n.key) ?? 0) + 1);
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { key: best[0], count: best[1], label: LABEL[best[0]] ?? best[0] } : null;
  };
  return {
    n: rs.length, wins: rs.filter((r) => r.pos.netProfit > 0).length,
    net: rs.reduce((s, r) => s + r.pos.netProfit, 0),
    cost: rs.reduce((s, r) => s + Math.abs(r.pos.fee) + Math.max(0, -r.pos.funding), 0),
    good: notes.filter((n) => n.tone === 'good').length, bad: notes.filter((n) => n.tone !== 'good').length,
    topBad: top(['bad', 'warn']), topGood: top(['good']), overtrade: rs.length / Math.max(1, hours / 24) >= OVERTRADE_N,
  };
}

/* ── 텔레그램 메시지 ─────────────────────────── */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ICON: Record<Tone, string> = { good: '✅', bad: '❌', warn: '⚠️' };
const kst = (ts: number) => { const d = new Date(ts + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const hold = (m: number) => (m < 60 ? `${Math.round(m)}분` : m < 1440 ? `${(m / 60).toFixed(1)}시간` : `${(m / 1440).toFixed(1)}일`);
const usdt = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
const fmtPx = (v: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v >= 1 ? v.toFixed(3) : v.toPrecision(4));

export const MAX_DETAIL = 8;
export const MAX_REVIEW = 20;

export function buildDailyReviewMessage(rs: TradeReview[], opts: { base: string; hours: number; coach?: string | null }): string {
  const s = summarizeDay(rs, opts.hours);
  const head = `📒 <b>매매 복기</b> · 지난 ${opts.hours}시간 청산 ${s.n}건`;
  const sum = [
    `결과 <b>${s.wins}승 ${s.n - s.wins}패</b> · 순손익 <b>${usdt(s.net)} USDT</b> · 비용 ${s.cost.toFixed(2)}`,
    `✅ 잘한 점 ${s.good} · ❌⚠️ 고칠 점 ${s.bad}${s.overtrade ? ` · ⚠️ 하루 ${Math.round(s.n / Math.max(1, opts.hours / 24))}건꼴(과매매 주의)` : ''}`,
    s.topBad ? `🔁 가장 많이 나온 실수: <b>${esc(s.topBad.label)}</b> ${s.topBad.count}회` : null,
    s.topGood ? `👍 가장 잘한 점: <b>${esc(s.topGood.label)}</b> ${s.topGood.count}회` : null,
    opts.coach ? `🧭 <b>코치</b> ${esc(opts.coach)}` : null,
  ].filter(Boolean).join('\n');

  const blocks = [...rs].sort((a, b) => a.pos.closeTs - b.pos.closeTs).slice(-MAX_DETAIL).map((r, i) => {
    const p = r.pos;
    const L = [`<b>${i + 1}. ${esc(p.symbol.replace('USDT', ''))} ${p.side === 'long' ? '롱' : '숏'}</b> ${kst(p.openTs)}→${kst(p.closeTs)} (${hold(r.holdMin)}) · ${fmtPx(p.openAvg)}→${fmtPx(p.closeAvg)} · <b>${usdt(p.netProfit)}</b> (${sgn(r.pnlPct, 2)}%)`];
    const part = (name: string, ns: Note[]) => { if (ns.length) L.push(`${name} ${ns.map((n) => `${ICON[n.tone]}${esc(n.text)}`).join(' · ')}`); };
    part('진입', r.entry); part('청산', r.exit); part('매매', r.trade);
    if (!r.entry.length && !r.exit.length && !r.trade.length) L.push('<i>판정할 특이점 없음</i>');
    return L.join('\n');
  });
  const more = rs.length > MAX_DETAIL ? `\n<i>…앞선 ${rs.length - MAX_DETAIL}건은 매매일지에서</i>` : '';
  const foot = `<i>결과를 아는 사후 평가 · 매매 신호 아님</i>\n🔗 ${opts.base}/journal`;
  return [head, sum, blocks.join('\n\n') + more, foot].join('\n\n');
}

/* ── 데이터 로더(네트워크) ───────────────────── */
interface RawCandle { ts: number; o: number; h: number; l: number; c: number; v: number; qv: number }

async function candles(symbol: string, granularity: string, endTime: number, limit: number): Promise<RawCandle[]> {
  const u = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${granularity}&endTime=${endTime}&limit=${Math.min(200, limit)}`;
  const j = await (await fetch(u, { signal: AbortSignal.timeout(8000), cache: 'no-store' })).json().catch(() => null);
  if (j?.code !== '00000' || !Array.isArray(j.data)) return [];
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +(r[6] ?? 0) })).sort((a, b) => a.ts - b.ts);
}

/** 진입 직전 24봉 안 위치 */
export function entryLocation(before: { h: number; l: number }[], entry: number): number | null {
  const lb = before.slice(-24);
  if (lb.length < 4) return null;
  const lo = Math.min(...lb.map((c) => c.l)), hi = Math.max(...lb.map((c) => c.h));
  return hi > lo ? Math.max(0, Math.min(1, (entry - lo) / (hi - lo))) : null;
}

/** 청산 뒤 window 동안 내 방향 기준 추가 순행·역행 % */
export function postExit(side: 'long' | 'short', exit: number, after: { h: number; l: number }[]): { favorPct: number; againstPct: number } | null {
  if (!after.length || !(exit > 0)) return null;
  const hi = Math.max(...after.map((c) => c.h)), lo = Math.min(...after.map((c) => c.l));
  const up = Math.max(0, ((hi - exit) / exit) * 100), down = Math.max(0, ((exit - lo) / exit) * 100);
  return side === 'long' ? { favorPct: up, againstPct: down } : { favorPct: down, againstPct: up };
}

export async function buildContext(pos: ClosedPosition, now: number = Date.now()): Promise<TradeContext> {
  const [h1, m15] = await Promise.all([
    candles(pos.symbol, '1H', pos.openTs, 200),
    candles(pos.symbol, '15m', pos.openTs, 200),
  ]);
  const h1Before = h1.filter((c) => c.ts + 3_600_000 <= pos.openTs);   // 진입 시점에 완성된 봉만
  const m15Before = m15.filter((c) => c.ts + 900_000 <= pos.openTs);
  let h1Trend: TradeContext['h1Trend'] = null, rsi15: number | null = null;
  try { if (h1Before.length >= 60) h1Trend = tfTrend(analyzeTimeframe('1H', h1Before)); } catch { /* 지표 계산 실패 — 생략 */ }
  try { if (m15Before.length >= 30) rsi15 = analyzeTimeframe('15m', m15Before).rsi; } catch { /* 생략 */ }

  const g = pickGranularity(pos.closeTs - pos.openTs);
  const held = await candles(pos.symbol, g.g, pos.closeTs + g.ms, g.limit);
  const ex = tradeExcursion({ side: pos.side, entry: pos.openAvg, exit: pos.closeAvg, size: pos.size, openTs: pos.openTs, closeTs: pos.closeTs, stop: pos.stop ?? null }, held, g.ms);
  const autopsy = pos.stop != null && held.length
    ? analyzeTrade({ entry: pos.openAvg, stop: pos.stop, direction: pos.side, entryTs: pos.openTs, exitTs: pos.closeTs, result: pos.netProfit > 0 ? 'win' : 'loss' }, held)
    : null;

  const postEnd = Math.min(now, pos.closeTs + 4 * 3_600_000);
  const after = postEnd > pos.closeTs + 900_000 ? (await candles(pos.symbol, '15m', postEnd, 17)).filter((c) => c.ts >= pos.closeTs) : [];
  return { h1Trend, rsi15, location: entryLocation(m15Before, pos.openAvg), autopsy, ex, post: postExit(pos.side, pos.closeAvg, after) };
}

export async function buildDailyReview(positions: ClosedPosition[], now: number = Date.now()): Promise<TradeReview[]> {
  // 캔들 조회가 매매당 4번이라 크론 시간(60초) 안에 끝나게 최근 MAX_REVIEW 건만
  const asc = [...positions].sort((a, b) => a.closeTs - b.closeTs);
  const out: TradeReview[] = [];
  for (let i = Math.max(0, asc.length - MAX_REVIEW); i < asc.length; i++) {
    const pos = asc[i];
    const ctx = await buildContext(pos, now).catch((): TradeContext => ({ h1Trend: null, rsi15: null, location: null, autopsy: null, ex: null, post: null }));
    const prev = asc.slice(0, i).reverse().find((p) => p.closeTs <= pos.openTs) ?? null;
    out.push(reviewTrade(pos, ctx, prev));
  }
  return out;
}

/** 지난 hours 시간 청산분 복기 메시지 — 청산 0건이면 null(보내지 않음) */
export async function dailyReviewMessage(opts: { base: string; hours?: number; now?: number }): Promise<{ text: string | null; n: number }> {
  const now = opts.now ?? Date.now(), hours = opts.hours ?? 24;
  const { positions } = await fetchClosedPositions(now - hours * 3_600_000, now);
  const inWindow = positions.filter((p) => p.closeTs > now - hours * 3_600_000);
  if (!inWindow.length) return { text: null, n: 0 };
  const rs = await buildDailyReview(inWindow, now);
  const coach = await coachLine(rs, hours).catch(() => null);
  return { text: buildDailyReviewMessage(rs, { base: opts.base, hours, coach }), n: rs.length };
}

/* ── AI 코치 한 줄(Gemini) ───────────────────── */
/** 방향·가격 예측으로 읽히는 문장은 버린다(앱 원칙) */
export const COACH_BANNED = /(오를|내릴|상승할|하락할|반등할|매수하세요|매도하세요|사세요|파세요|롱 ?잡|숏 ?잡|진입하세요|목표가|전망)/;

export function coachPrompt(rs: TradeReview[], hours: number): string {
  const s = summarizeDay(rs, hours);
  const counts = new Map<string, number>();
  for (const n of rs.flatMap((r) => [...r.entry, ...r.exit, ...r.trade])) {
    const k = `${n.tone === 'good' ? '잘함' : '고칠 점'}|${LABEL[n.key] ?? n.key}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const facts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k.replace('|', ' ')} ${v}회`).join('\n');
  return [
    '너는 코인 선물 매매 습관 코치다. 아래는 지난 매매의 규칙 판정 집계다(결과를 아는 사후 평가).',
    `매매 ${s.n}건, ${s.wins}승 ${s.n - s.wins}패, 순손익 ${s.net.toFixed(1)} USDT, 비용 ${s.cost.toFixed(1)} USDT.`,
    facts,
    '규칙: 시장 방향·가격·종목 예측이나 매수/매도 권유는 절대 하지 마라. 위 집계에 없는 숫자를 만들지 마라.',
    '"내일 하나만 바꾼다면"을 구체적인 행동 하나로, 한국어 한 문장(60자 이내)으로 써라.',
    '출력은 JSON: {"headline": "<그 한 문장>", "bullets": []}',
  ].join('\n');
}

/** Gemini 한 문장 — 실패·금지 표현·과도한 길이면 null(메시지에서 생략) */
export async function coachLine(rs: TradeReview[], hours: number): Promise<string | null> {
  if (!rs.length) return null;
  const r = await geminiBrief(coachPrompt(rs, hours), Date.now() + 12_000);
  const line = r.ok ? r.brief?.headline?.trim() : '';
  if (!line || line.length > 120 || COACH_BANNED.test(line)) return null;
  return line;
}
