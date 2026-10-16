'use client';

/** 고용 — labor.json. NFP 나우캐스트·최근 예측 대 실제·실업률·임금 상승. 매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { seriesLast, type Labor } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const k = (v?: number | null) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${Math.round(v)}K`);

export default function JobsPage() {
  const { data: lb } = useSWR<Labor>('/api/nf/labor.json', fetcher, SWR_OPT);
  const nfp = lb?.nfp;
  const rows = (nfp?.rows ?? []).slice(-8).reverse();
  const unemp = seriesLast(lb?.unemployment?.series);
  const atlanta = seriesLast(lb?.wages?.atlanta?.series);
  const indeed = seriesLast(lb?.wages?.indeed?.series);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">고용</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        비농업 고용(NFP) 실시간 추정과 과거 적중, 실업률·임금 상승률입니다. 고용은 연준 금리 경로의 한 축이라 물가와 함께 봅니다.
        <b className="text-[var(--text)]"> 예측·매매 신호가 아닙니다.</b>
      </p>

      {lb?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!lb?.locked && lb && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-semibold text-[var(--text)]">비농업 고용 나우캐스트</h2>
              {nfp?.print_month && <span className="text-[11px] text-[var(--text-muted)]">{nfp.print_month}</span>}
            </div>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--text)] leading-tight">{k(nfp?.nowcast_k)}</p>
            {nfp?.backtest && (
              <p className="text-[11px] text-[var(--text-muted)] tabular-nums mt-1">
                과거 평균오차 {nfp.backtest.mae_model_k?.toFixed(0)}K vs 나이브 {nfp.backtest.mae_naive_k?.toFixed(0)}K · 나이브 대비 승률 {nfp.backtest.beats_naive_pct != null ? `${(nfp.backtest.beats_naive_pct * 100).toFixed(0)}%` : '—'}
              </p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-2">최근 예측 대 실제</h2>
              <div className="grid grid-cols-4 gap-1 px-1 py-1.5 text-[10px] font-semibold text-[var(--text-muted)] border-b border-[var(--border)]">
                <span>월</span><span className="text-right">실제</span><span className="text-right">모델</span><span className="text-right">나이브</span>
              </div>
              <ul className="divide-y divide-[var(--border)]/60">
                {rows.map((r) => (
                  <li key={r.month} className="grid grid-cols-4 gap-1 px-1 py-1.5 text-[11px] tabular-nums">
                    <span className="text-[var(--text-muted)]">{r.month}</span>
                    <span className="text-right font-bold text-[var(--text)]">{k(r.actual_k)}</span>
                    <span className="text-right text-[var(--text-muted)]">{k(r.model_k)}</span>
                    <span className="text-right text-[var(--text-muted)]">{k(r.naive_k)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">K = 천 명. 모델=나우캐스트, 나이브=직전값 그대로.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-[11px] text-[var(--text-muted)]">실업률</p>
              <p className="text-2xl font-extrabold tabular-nums text-[var(--text)]">{unemp ? `${unemp.value.toFixed(1)}%` : '—'}</p>
              {unemp && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{unemp.date}</p>}
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-[11px] text-[var(--text-muted)]">임금 상승률(YoY)</p>
              <p className="text-2xl font-extrabold tabular-nums text-[var(--text)]">{atlanta ? `${atlanta.value.toFixed(1)}%` : indeed ? `${indeed.value.toFixed(1)}%` : '—'}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{atlanta ? `애틀랜타 연준 · ${atlanta.date}` : indeed ? `Indeed · ${indeed.date}` : ''}</p>
            </div>
          </div>
        </>
      )}

      {!lb && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계) · BLS·애틀랜타 연준·Indeed. 침체 신호는 <a href="/inflation/heatcheck" className="text-[var(--accent-ink)]">경기 열지수</a>를 참고하세요.
      </p>
    </>
  );
}
