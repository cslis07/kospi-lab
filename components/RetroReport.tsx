'use client';

/**
 * 매매 복기 리포트 — "왜 지고 있는가"를 거울처럼 비춘다.
 * 예측이 아니라 과거 서술이다. 집계는 lib/journalRetro(테스트 고정), 여기는 표시만.
 */

import { useMemo } from 'react';
import { buildRetro, type RetroEntry, type RetroSlice } from '@/lib/journalRetro';

function usd(v: number | null) { return v == null ? '-' : `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`; }
function wr(v: number | null) { return v == null ? '-' : `${v.toFixed(0)}%`; }

function SliceRow({ s, highlightLoss }: { s: RetroSlice; highlightLoss?: boolean }) {
  const neg = s.realizedUsdt != null && s.realizedUsdt < 0;
  return (
    <div className="flex items-center justify-between text-[11px] py-1 border-b border-dashed border-[var(--border)] last:border-0">
      <span className="text-[var(--text)]">{s.label}</span>
      <div className="flex items-center gap-3 tabular-nums">
        <span className="text-[var(--text-muted)]">{s.n}건</span>
        <span className={`w-10 text-right ${s.winRate != null && s.winRate >= 50 ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>{wr(s.winRate)}</span>
        <span className={`w-14 text-right font-semibold ${s.realizedUsdt == null ? 'text-[var(--text-muted)]' : neg ? 'text-red-400' : 'text-emerald-400'} ${highlightLoss && neg ? 'font-bold' : ''}`}>{usd(s.realizedUsdt)}</span>
      </div>
    </div>
  );
}

export default function RetroReport({ entries }: { entries: RetroEntry[] }) {
  const r = useMemo(() => buildRetro(entries), [entries]);
  if (r.totalClosed === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4">
      <h3 className="text-sm font-bold text-[var(--text)] mb-1">매매 복기 <span className="text-[10px] font-normal text-[var(--text-muted)]">왜 이겼고 왜 졌는가 — 과거 사실</span></h3>
      <p className="text-[10px] text-[var(--text-muted)] mb-3">방향 예측이 아닙니다. 청산된 {r.totalClosed}건을 쪼개 <strong className="text-[var(--text)]">내 습관</strong>을 비춥니다(실현손익 입력분 기준).</p>

      {/* 통찰 — 자동 유도 */}
      {r.insights.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {r.insights.map((it, i) => (
            <p key={i} className={`text-[11px] leading-relaxed rounded-lg px-2.5 py-1.5 ${
              it.level === 'high' ? 'bg-red-500/[0.07] text-red-300' : it.level === 'mid' ? 'bg-amber-500/[0.06] text-amber-300' : 'bg-white/[0.03] text-[var(--text-muted)]'
            }`}>{it.level === 'high' ? '🔴' : it.level === 'mid' ? '🟡' : '💡'} {it.text}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">계획 유무</p>
          <SliceRow s={r.planned} />
          <SliceRow s={r.unplanned} highlightLoss />
        </div>
        <div>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">방향</p>
          <SliceRow s={r.long} />
          <SliceRow s={r.short} />
        </div>
      </div>

      {(r.byWeekday.length > 1 || r.byHour.length > 1) && (
        <details className="mt-3">
          <summary className="text-[11px] text-sky-400 cursor-pointer">시간대·요일별 성적 펼치기</summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
            <div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">요일별</p>
              {r.byWeekday.map((s) => <SliceRow key={s.label} s={s} />)}
            </div>
            <div>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide mb-1">시간대별(KST)</p>
              {r.byHour.map((s) => <SliceRow key={s.label} s={s} />)}
            </div>
          </div>
        </details>
      )}
      <p className="text-[9px] text-[var(--text-muted)] mt-2 text-right">칸: 건수 · 승률 · 실현손익(USDT)</p>
    </section>
  );
}
