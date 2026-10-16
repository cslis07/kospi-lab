'use client';

/** 발표일 분석 — nextprint 로 이번 발표월을 얻어 print_<YYYY_MM>.json(예측 대 실제). 발표 전=예측 비교, 발표 후=적중. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { printFile, pct, type PrintDay, type PrintTarget } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

export default function AnalysisPage() {
  const { data: np } = useSWR<{ print_month?: string; locked?: boolean }>('/api/nf/nextprint.json', fetcher, SWR_OPT);
  const file = printFile(np?.print_month);
  const { data: pd } = useSWR<PrintDay>(file ? `/api/nf/${file}` : null, fetcher, SWR_OPT);
  const locked = np?.locked || pd?.locked;
  const released = pd?.status === 'released';

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">발표일 분석</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        이번 CPI 발표에 대해 <b className="text-[var(--text)]">누가 무엇을 예측했고, 발표 후 실제와 얼마나 맞았나</b>를 정리합니다. 발표 전에는 예측 비교, 발표 후에는 적중 결과로 바뀝니다.
        <b className="text-[var(--text)]"> 매매 신호가 아닙니다.</b>
      </p>

      {locked && <div className="mb-4"><UnlockGate /></div>}

      {!locked && pd && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text)]">{pd.release?.name ?? 'CPI'} · {pd.print_month_label}</h2>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${released ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>{released ? '발표됨' : '발표 예정'}</span>
            </div>
            {pd.release?.datetime_et && <p className="text-[11px] text-[var(--text-muted)] mt-1">{pd.release.datetime_et}</p>}
          </div>

          {(pd.targets ?? []).map((t) => <TargetCard key={t.target} t={t} released={released} />)}

          {released && pd.what_happened && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1.5">무슨 일이 있었나</h2>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{pd.what_happened}</p>
            </div>
          )}
        </>
      )}

      {!locked && np && !file && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">예정된 발표 분석이 아직 없습니다.</p>}
      {!np && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 발표 시각은 미 동부(ET) 기준. 스코어보드는 <a href="/inflation/scoreboard" className="text-[var(--accent-ink)]">예측 스코어보드</a>를 참고하세요.
      </p>
    </>
  );
}

function TargetCard({ t, released }: { t: PrintTarget; released: boolean }) {
  const calls = [...(t.calls ?? [])].sort((a, b) => (released ? (a.abs ?? 1e9) - (b.abs ?? 1e9) : (a.value ?? 1e9) - (b.value ?? 1e9)));
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">{t.label}</h2>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
          {released && t.actual != null ? <>실제 <b className="text-[var(--text)]">{pct(t.actual)}</b></> : <>컨센서스 <b className="text-[var(--text)]">{pct(t.consensus)}</b></>}
          {t.prior != null && <span> · 직전 {pct(t.prior)}</span>}
        </span>
      </div>
      <ul className="space-y-1">
        {calls.map((c, i) => (
          <li key={`${c.forecaster}-${i}`} className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-[var(--text-muted)] truncate pr-2">{c.label}</span>
            <span className="shrink-0 text-[var(--text)]">
              {pct(c.value)}
              {released && c.abs != null && <span className={`ml-1 ${sign(c.err)}`}>({c.abs.toFixed(2)})</span>}
            </span>
          </li>
        ))}
      </ul>
      {released && <p className="text-[10px] text-[var(--text-muted)] mt-1.5">괄호 = 공식과의 절대오차(%p).</p>}
    </div>
  );
}
