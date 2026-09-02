'use client';

/**
 * 손실 서킷브레이커 바 — "오늘 더 매매하면 안 되는 상태"를 산수로 알린다.
 *
 * 방향 예측이 아니다. 연패·오늘 손실 같은 과거 사실만 근거로 신규 진입을 멈추라고 한다.
 * blocked 는 실행가능 판정으로도 전달돼 진입을 NO 로 만든다(components/TradeGate).
 */

import { useMemo, useState } from 'react';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import { evaluateBreaker, type BreakerEntry } from '@/lib/circuitBreaker';

export default function CircuitBreakerBar() {
  const journal = useCoinJournal();
  const { limits, update, mounted } = useRiskLimits();
  const [openCfg, setOpenCfg] = useState(false);

  const state = useMemo(
    () => evaluateBreaker(journal.entries as BreakerEntry[], limits),
    [journal.entries, limits],
  );

  if (!mounted) return null;
  // 정상이고 한도도 안 정했으면 조용히 접어 둔다(설정만 노출)
  const idle = state.status === 'ok' && state.lossStreak === 0;

  const box = state.status === 'blocked' ? 'border-red-500/50 bg-red-500/[0.08]'
    : state.status === 'warn' ? 'border-amber-500/40 bg-amber-500/[0.06]'
    : 'border-[var(--border)] bg-[var(--bg-card)]';
  const tone = state.status === 'blocked' ? 'text-red-400' : state.status === 'warn' ? 'text-amber-400' : 'text-[var(--text-muted)]';
  const title = state.status === 'blocked' ? '🛑 서킷브레이커 작동 — 오늘 진입 금지'
    : state.status === 'warn' ? '🟡 서킷브레이커 경고'
    : '🛡 서킷브레이커 정상';

  const numOrEmpty = (v: number | null) => (v == null ? '' : String(v));

  return (
    <div className={`rounded-2xl border p-3.5 mb-4 ${box}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-bold ${tone}`}>{title}</p>
        <button onClick={() => setOpenCfg((v) => !v)} className="text-[11px] text-sky-400 hover:underline">
          {openCfg ? '설정 접기' : '한도 설정'}
        </button>
      </div>

      {!idle && (
        <div className="mt-1.5 space-y-1">
          {state.reasons.map((r, i) => (
            <p key={i} className={`text-[11px] leading-relaxed ${state.status === 'blocked' ? 'text-red-300' : 'text-[var(--text-muted)]'}`}>• {r}</p>
          ))}
          <p className="text-[10px] text-[var(--text-muted)] tabular-nums">
            현재 연속손절 {state.lossStreak} · 오늘 실현 {state.todayRealized == null ? '-' : `${state.todayRealized >= 0 ? '+' : ''}${Math.round(state.todayRealized)}`} · 최근7일 {state.weekRealized == null ? '-' : `${state.weekRealized >= 0 ? '+' : ''}${Math.round(state.weekRealized)}`} USDT
          </p>
        </div>
      )}
      {idle && (
        <p className="text-[10px] text-[var(--text-muted)] mt-1">연패·손실 한도를 정해두면, 넘었을 때 신규 진입을 막고 실행가능 판정에서 NO로 처리합니다.</p>
      )}

      {openCfg && (
        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
          <label className="text-[var(--text-muted)]">
            연속 손절 한도
            <input type="number" min={1} value={limits.maxConsecutiveLosses}
              onChange={(e) => update({ maxConsecutiveLosses: Math.max(1, Number(e.target.value) || 3) })}
              className="mt-1 w-full px-2 py-1.5 bg-transparent border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-sky-500/50 tabular-nums" />
          </label>
          <label className="text-[var(--text-muted)]">
            일일 손실 한도 (USDT)
            <input type="number" min={0} placeholder="미설정" value={numOrEmpty(limits.dailyLossLimitUsdt)}
              onChange={(e) => update({ dailyLossLimitUsdt: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full px-2 py-1.5 bg-transparent border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-sky-500/50 tabular-nums" />
          </label>
          <label className="text-[var(--text-muted)]">
            주간 손실 한도 (USDT)
            <input type="number" min={0} placeholder="미설정" value={numOrEmpty(limits.weeklyLossLimitUsdt)}
              onChange={(e) => update({ weeklyLossLimitUsdt: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full px-2 py-1.5 bg-transparent border border-[var(--border)] rounded-lg text-[var(--text)] outline-none focus:border-sky-500/50 tabular-nums" />
          </label>
          <p className="sm:col-span-3 text-[10px] text-[var(--text-muted)]">양수로 입력하세요(예: 50 → 오늘 −50 USDT면 차단). 손실은 거래소 대조로 채워진 실현손익 기준. 설정은 기기 간 동기화됩니다.</p>
        </div>
      )}
    </div>
  );
}
