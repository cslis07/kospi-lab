'use client';

/** Fed Watch — fedwatch.json(Kalshi KXFEDDECISION). 다음 FOMC 시장 확률·예상 변화폭·회의 전 주요 발표. 매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import type { FedWatch, FedOutcome } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const dShort = (d?: string) => (d ? d.slice(0, 10).replace(/-/g, '.').slice(2) : '—');

export default function FedPage() {
  const { data: fw } = useSWR<FedWatch>('/api/nf/fedwatch.json', fetcher, SWR_OPT);
  const nm = fw?.next_meeting;
  const mk = fw?.market;
  const outs = [...(mk?.outcomes ?? [])].sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0));

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">Fed Watch</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        다음 연방공개시장위원회(FOMC)에서 금리를 어떻게 할지, <b className="text-[var(--text)]">시장(Kalshi)이 매긴 확률</b>입니다. 회의 전 나오는 CPI 같은 발표가 이 확률을 흔듭니다.
        <b className="text-[var(--text)]"> 예측·매매 신호가 아닙니다.</b>
      </p>

      {fw?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!fw?.locked && mk && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">다음 회의</h2>
              {nm?.date && <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{dShort(nm.date)}{nm.days_to != null ? ` · D-${nm.days_to}` : ''}</span>}
            </div>
            {mk.modal && (
              <p className="text-[13px] text-[var(--text)] mb-1">
                시장 기대: <b>{mk.modal.label}</b> <span className="text-[var(--text-muted)]">({(mk.modal.prob * 100).toFixed(0)}%)</span>
              </p>
            )}
            {mk.implied_change_bps != null && (
              <p className="text-[12px] text-[var(--text-muted)] tabular-nums">예상 변화폭 <b className={mk.implied_change_bps > 0 ? 'text-red-400' : mk.implied_change_bps < 0 ? 'text-blue-400' : 'text-[var(--text)]'}>{mk.implied_change_bps > 0 ? '+' : ''}{mk.implied_change_bps.toFixed(1)}bp</b></p>
            )}
            {nm?.statement_et && <p className="text-[10px] text-[var(--text-muted)] mt-1">성명 발표 {nm.statement_et}</p>}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">확률 분포</h2>
            <ul className="space-y-2">
              {outs.map((o, i) => <OutcomeRow key={`${o.label}-${i}`} o={o} />)}
            </ul>
          </div>

          {nm?.releases_before && nm.releases_before.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-2">회의 전 주요 발표</h2>
              <ul className="divide-y divide-[var(--border)]/60">
                {nm.releases_before.map((r, i) => (
                  <li key={`${r.release}-${i}`} className="py-1.5 flex items-center justify-between text-[11px] tabular-nums">
                    <span className="text-[var(--text)]">{r.release}{r.print_month ? ` · ${r.print_month}` : ''}</span>
                    <span className="text-[var(--text-muted)]">{dShort(r.date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!fw && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계) · 원시장 Kalshi KXFEDDECISION{fw?.asof ? ` · ${fw.asof}` : ''}. 확률은 시장 가격이며 사실·예측이 아닙니다.
      </p>
    </>
  );
}

function OutcomeRow({ o }: { o: FedOutcome }) {
  const w = Math.max(0, Math.min(100, (o.prob ?? 0) * 100));
  return (
    <li>
      <div className="flex items-center justify-between text-[11px] tabular-nums mb-0.5">
        <span className="text-[var(--text)] truncate pr-2">{o.label}{o.bps != null && o.bps !== 0 ? ` (${o.bps > 0 ? '+' : ''}${o.bps}bp)` : ''}</span>
        <span className="shrink-0 font-bold text-[var(--text)]">{w.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${w}%` }} />
      </div>
    </li>
  );
}
