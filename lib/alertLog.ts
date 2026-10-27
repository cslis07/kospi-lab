/**
 * 경보 실전 성적 — 가드가 실제로 보낸 🚨 폭락 조기 경보·⚡ 하락 충격봉 알림이 그 뒤 어떻게 됐는지 쌓아
 * 과거 측정값(경보 적중 3~8% · 충격봉 2시간 추가 하락 vs 반등)과 실전을 비교한다.
 *
 * 판정은 측정 스크립트와 같은 정의(바꾸지 말 것):
 *   warn  — 경보 시각(5분봉 마감) 종가에서 15분 뒤~75분 안 5분봉 저가가 −3% 이하면 hit (lib/crashWarning.dropWithin, LEAD_MIN·CRASH_WIN_MIN·CRASH_PCT)
 *   shock — 충격봉(15분봉) 뒤 8봉(2시간) 안에 종가 대비 봉 크기(고가−저가)만큼 더 내려가면 cont, 올라가면 rev (lib/crashPrecursor.shockEvents)
 * 저장은 Supabase kl_sync `guard-alert-log` 한 줄(가드가 5분마다 미판정 건을 판정). 순수 함수만 여기.
 */
import { LEAD_MIN, CRASH_WIN_MIN, CRASH_PCT, type Bar } from './crashWarning';

export type AlertOutcome = 'hit' | 'miss' | 'cont' | 'rev' | 'both' | 'neither';
export interface AlertLogEntry {
  kind: 'warn' | 'shock';
  sym: string;
  /** warn: 판정 시각(5분봉 마감) · shock: 충격봉 시작 시각 */
  ts: number;
  /** warn 만: 경보 시점 종가 */
  px?: number;
  /** 알림 보낸 시각 */
  at: number;
  outcome?: AlertOutcome;
  /** 하루 지나도 캔들을 못 받아 판정 포기 — 집계에서 뺀다 */
  gaveUp?: boolean;
}
export interface AlertLog { entries: AlertLogEntry[] }

export const ALERT_LOG_MAX = 300;
const M = 60_000;
const SHOCK_BARS = 8, M15 = 15 * M;

/** 판정 가능한 시각(데이터가 다 찬 뒤) */
export function dueAt(e: Pick<AlertLogEntry, 'kind' | 'ts'>): number {
  return e.kind === 'warn' ? e.ts + (LEAD_MIN + CRASH_WIN_MIN) * M : e.ts + (SHOCK_BARS + 1) * M15;
}

/** warn — 5분봉(시작 시각 ts) 중 경보 15분 뒤~75분 안에 끝나는 봉의 저가가 −3% 이하인가. 봉이 모자라면 null */
export function resolveWarn(e: Pick<AlertLogEntry, 'ts' | 'px'>, b5: Bar[]): 'hit' | 'miss' | null {
  if (!e.px || !(e.px > 0)) return null;
  const from = e.ts + LEAD_MIN * M, to = e.ts + (LEAD_MIN + CRASH_WIN_MIN) * M;
  const win = b5.filter((b) => b.ts >= from && b.ts + 5 * M <= to);
  if (win.length < CRASH_WIN_MIN / 5) return null;
  const lvl = e.px * (1 - CRASH_PCT / 100);
  return win.some((b) => b.l <= lvl) ? 'hit' : 'miss';
}

/** shock — 15분봉 배열에서 충격봉(ts) 뒤 8봉 안 추가 하락(cont)·반등(rev). 봉이 모자라면 null */
export function resolveShock(e: Pick<AlertLogEntry, 'ts'>, m15: Bar[]): 'cont' | 'rev' | 'both' | 'neither' | null {
  const asc = [...m15].sort((a, b) => a.ts - b.ts);
  const i = asc.findIndex((b) => b.ts === e.ts);
  if (i < 0 || i + SHOCK_BARS >= asc.length) return null;
  const b = asc[i], r = b.h - b.l;
  if (!(r > 0)) return null;
  let hi = -Infinity, lo = Infinity;
  for (let k = i + 1; k <= i + SHOCK_BARS; k++) { hi = Math.max(hi, asc[k].h); lo = Math.min(lo, asc[k].l); }
  const cont = b.c - lo >= r, rev = hi - b.c >= r;
  return cont && rev ? 'both' : cont ? 'cont' : rev ? 'rev' : 'neither';
}

/** 새로 보낸 경보를 기록에 추가(같은 kind·sym·ts 는 한 번만), 오래된 것부터 잘라 최대 ALERT_LOG_MAX */
export function appendAlerts(log: AlertLog | null, add: AlertLogEntry[]): AlertLog {
  const entries = [...(log?.entries ?? [])];
  for (const a of add) if (!entries.some((e) => e.kind === a.kind && e.sym === a.sym && e.ts === a.ts)) entries.push(a);
  entries.sort((a, b) => a.ts - b.ts);
  return { entries: entries.slice(-ALERT_LOG_MAX) };
}

export interface AlertLogSummary {
  warn: { n: number; hit: number; pending: number; ratePct: number | null };
  shock: { n: number; cont: number; rev: number; both: number; neither: number; pending: number; contPct: number | null; revPct: number | null };
  recent: AlertLogEntry[];
}
export function summarizeAlertLog(log: AlertLog | null): AlertLogSummary {
  const es = (log?.entries ?? []).filter((e) => !e.gaveUp);
  const w = es.filter((e) => e.kind === 'warn'), s = es.filter((e) => e.kind === 'shock');
  const wDone = w.filter((e) => e.outcome), sDone = s.filter((e) => e.outcome);
  const cnt = (xs: AlertLogEntry[], o: AlertOutcome) => xs.filter((e) => e.outcome === o).length;
  const pct = (a: number, n: number) => (n ? (a / n) * 100 : null);
  return {
    warn: { n: wDone.length, hit: cnt(wDone, 'hit'), pending: w.length - wDone.length, ratePct: pct(cnt(wDone, 'hit'), wDone.length) },
    shock: {
      n: sDone.length, cont: cnt(sDone, 'cont'), rev: cnt(sDone, 'rev'), both: cnt(sDone, 'both'), neither: cnt(sDone, 'neither'), pending: s.length - sDone.length,
      contPct: pct(cnt(sDone, 'cont'), sDone.length), revPct: pct(cnt(sDone, 'rev'), sDone.length),
    },
    recent: [...es].sort((a, b) => b.ts - a.ts).slice(0, 10),
  };
}
