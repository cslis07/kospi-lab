'use client';

/**
 * 📒 엔진 사전 기록·사후 판정 — lib/intel/evidenceLog. 열었을 때만 1시간봉을 받아 판정한다(공개 캔들, CDN 캐시).
 * 판정 30건 전에는 성과를 말하지 않는다. 주문·알림 없음.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  candleRanges, judgeLog, summarizeOutcomes, HORIZON_H, MIN_JUDGED, VOID_H, ENGINE_VERSION,
  type Bucket, type EngineLogEntry, type SetupOutcome,
} from '@/lib/intel/evidenceLog';
import { loadLog, LOG_EVENT } from '@/lib/intel/evidenceStore';
import { STATUS_LABEL } from '@/lib/intel/decisionEngine';
import type { Candle } from '@/lib/paperJudge';

const MAX_PAGES = 10; // 심볼당 200봉 × 10 ≈ 83일

async function fetchRange(symbol: string, from: number, to: number): Promise<Candle[]> {
  const out = new Map<number, Candle>();
  let end = to;
  for (let i = 0; i < MAX_PAGES && end > from; i++) {
    const res = await fetch(`/api/candles?symbol=${symbol}&granularity=1H&limit=200&endTime=${Math.floor(end)}`);
    const j = await res.json() as { candles?: Candle[] };
    const cs = j.candles ?? [];
    if (!cs.length) break;
    for (const c of cs) out.set(c.ts, c);
    const first = cs[0].ts;
    if (first >= end) break;
    end = first - 1;
  }
  return [...out.values()].sort((a, b) => a.ts - b.ts);
}

const sgn = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}R`);

function BucketRow({ b }: { b: Bucket }) {
  return (
    <div className="py-1 border-b border-[var(--border)] last:border-0">
      <p className="text-[10.5px] font-bold text-[var(--text)]">{b.label}</p>
      <p className="text-[10.5px] text-[var(--text-muted)] tabular-nums">
        후보 {b.n} · 체결 {b.filled} (승 {b.wins} · 패 {b.losses} · 미결 {b.open}) · 무효 {b.voided} · 진행 중 {b.pending}
      </p>
      <p className="text-[10.5px] tabular-nums">
        판정 끝 {b.judged}건 · 평균 순R <b className={b.avgNetR == null ? 'text-[var(--text-muted)]' : b.avgNetR > 0 ? 'text-emerald-400' : 'text-red-400'}>{sgn(b.avgNetR)}</b>
        <span className="text-[var(--text-muted)]"> (비용 전 {sgn(b.avgGrossR)}) · 합계 {sgn(b.sumNetR)}</span>
      </p>
    </div>
  );
}

export default function EngineEvidence() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<EngineLogEntry[]>(() => (typeof window === 'undefined' ? [] : loadLog()));
  const [res, setRes] = useState<{ outcomes: SetupOutcome[]; at: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => setLog(loadLog());
    window.addEventListener(LOG_EVENT, load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener(LOG_EVENT, load); window.removeEventListener('storage', load); };
  }, []);

  const judge = useCallback(async () => {
    const now = Date.now();
    const cur = loadLog();
    setLog(cur);
    const ranges = candleRanges(cur, now);
    setBusy(true); setErr(null);
    try {
      const entries = await Promise.all(Object.entries(ranges).map(async ([s, r]) => [s, await fetchRange(s, r.from, r.to)] as const));
      setRes({ outcomes: judgeLog(cur, Object.fromEntries(entries), now), at: now });
    } catch { setErr('1시간봉을 받지 못해 판정하지 못했습니다'); }
    setBusy(false);
  }, []);

  const buckets = res ? summarizeOutcomes(res.outcomes) : null;
  const sel = buckets?.[0];
  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-white/[0.02] px-2.5 py-2">
      <button type="button" onClick={() => { const next = !open; setOpen(next); if (next && log.length) void judge(); }} className="w-full flex items-center gap-2 text-left">
        <span className="text-[11px] font-bold text-[var(--text)]">📒 사전 기록·사후 판정</span>
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums">기록 {log.length}건</span>
        <span className="ml-auto text-[10.5px] text-[var(--text-muted)]">{open ? '접기 ▴' : '보기 ▾'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {log.length === 0 && <p className="text-[10.5px] text-[var(--text-muted)]">아직 기록 없음 — 분석을 실행하면 엔진 결정이 자동으로 남습니다.</p>}
          {res && !busy && (
            <button type="button" onClick={() => void judge()} className="text-[10.5px] font-semibold text-sky-400 hover:underline">
              다시 판정({new Date(res.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준)
            </button>
          )}
          {busy && <p className="text-[10.5px] text-[var(--text-muted)]">1시간봉으로 판정하는 중…</p>}
          {err && <p className="text-[10.5px] text-red-400">{err}</p>}
          {buckets && (
            <>
              <p className={`text-[10.5px] font-semibold ${sel && sel.judged >= MIN_JUDGED ? 'text-[var(--text)]' : 'text-amber-400'}`}>
                {sel && sel.judged >= MIN_JUDGED
                  ? `엔진 선택 판정 ${sel.judged}건 — 기준선과 비교해 볼 수 있는 표본입니다(그래도 실전 근거는 아님).`
                  : `판정 끝난 엔진 선택 ${sel?.judged ?? 0}건 / ${MIN_JUDGED}건 — 그 전에는 성과를 판단하지 않습니다.`}
                {buckets[0].avgNetR != null && buckets[0].avgNetR < 0 && ' 지금까지 순R 음수 → 관망 우선 유지.'}
              </p>
              {buckets.map((b) => <BucketRow key={b.label} b={b} />)}
            </>
          )}
          {log.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-[var(--text-muted)] mt-1">최근 기록</p>
              {log.slice(-5).reverse().map((e) => (
                <p key={e.id} className="text-[10px] text-[var(--text-muted)] tabular-nums leading-snug">
                  {new Date(e.recordedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {e.symbol.replace(/USDT$/, '')} · <b className="text-[var(--text)]">{STATUS_LABEL[e.status]}</b>
                  {e.selected ? ` · 선택 ${e.selected === 'long' ? '롱' : '숏'}` : ''} · 범위 {Math.round(e.coverage * 100)}% · {e.v}
                </p>
              ))}
            </div>
          )}
          <p className="text-[9.5px] text-[var(--text-muted)] leading-snug">
            기록 규칙: 시세가 5분 안으로 신선할 때, 코인별 60분에 한 번(상태·선택이 바뀌면 바로), 고치지 않고 덧붙이기만. 판정: 진입 기준가 지정가 · 1차 목표 · {VOID_H}시간 안 미도달 무효 · {HORIZON_H}시간에 마감 · 같은 봉 손절 먼저 · 순R 은 수수료·슬리피지·펀딩 차감.
            15분봉 진입 확인은 1시간봉으로 재현하지 못해 &lsquo;구간 도달 = 체결&rsquo;로 봅니다(실제보다 체결이 많게 나옴). 기록은 분석을 돌린 때만 생겨 표본이 고르지 않습니다. 현재 엔진 판 {ENGINE_VERSION}.
          </p>
        </div>
      )}
    </div>
  );
}
