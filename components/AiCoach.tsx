'use client';

/**
 * AI 복기 코치 — 과거 통계로 규율 피드백을 받는다(방향 추천 아님).
 * 집계(buildRetro)는 클라이언트에서 하고, 그 통계만 서버(/api/coach)로 보낸다.
 */

import { useState } from 'react';
import { buildRetro, type RetroEntry } from '@/lib/journalRetro';
import { evaluateBreaker, type BreakerEntry } from '@/lib/circuitBreaker';
import { useRiskLimits } from '@/hooks/useRiskLimits';

export default function AiCoach({ entries }: { entries: RetroEntry[] }) {
  const { limits } = useRiskLimits();
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closed = entries.filter((e) => e.result !== 'open').length;

  const run = async () => {
    setBusy(true); setErr(null); setText(null);
    try {
      const retro = buildRetro(entries);
      const breaker = evaluateBreaker(entries as unknown as BreakerEntry[], limits);
      const res = await fetch('/api/coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retro, breaker }),
      });
      if (res.status === 401) { setErr('잠금 상태입니다 — /bitget 에서 접근 토큰을 1회 입력하세요.'); return; }
      const j = await res.json() as { text?: string; error?: string };
      if (j.error) { setErr(j.error); return; }
      setText(j.text ?? '');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (closed < 3) return null;   // 표본이 너무 적으면 코칭이 무의미

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.05] p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-[var(--text)]">🎓 AI 복기 코치 <span className="text-[10px] font-normal text-[var(--text-muted)]">방향 추천 아님 · 습관·규율만</span></h3>
        <button onClick={run} disabled={busy}
          className="px-3 py-1 rounded-lg border border-violet-500/40 bg-violet-500/15 text-violet-300 text-[11px] font-semibold disabled:opacity-50">
          {busy ? '분석 중…' : text ? '다시 받기' : '복기 받기'}
        </button>
      </div>
      {!text && !err && !busy && (
        <p className="text-[10px] text-[var(--text-muted)]">청산 {closed}건의 통계를 AI에게 넘겨 <strong className="text-[var(--text)]">행동 피드백</strong>을 받습니다. 종목·방향 추천은 하지 않습니다(엔진이 방향을 못 맞히는 게 측정됨).</p>
      )}
      {busy && <p className="text-[11px] text-[var(--text-muted)]">통계를 분석하는 중…</p>}
      {err && <p className="text-[11px] text-red-400">⚠ {err}</p>}
      {text && (
        <div className="mt-1 text-[12px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">{text}</div>
      )}
      {text && <p className="text-[9px] text-[var(--text-muted)] mt-2">AI 생성 조언은 참고용이며 투자 판단·책임은 본인에게 있습니다.</p>}
    </section>
  );
}
