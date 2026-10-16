'use client';

/** 예측 스코어보드 — accountability(발표별 누가 맞혔나) + backtest(장기 성적). 정직한 한계 표기, 매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { acctForecasters, type Accountability, type Backtest } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const fx = (x?: number) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const pctOf = (x?: number) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(0)}%`);

export default function ScoreboardPage() {
  const { data: acct } = useSWR<Accountability>('/api/nf/accountability_target_cpi_headline_yoy.json', fetcher, SWR_OPT);
  const { data: bt } = useSWR<Backtest>('/api/nf/backtest.json', fetcher, SWR_OPT);
  const locked = acct?.locked || bt?.locked;
  const prints = (acct?.prints ?? []).slice(0, 6);
  const s = bt?.summary;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">예측 스코어보드</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        공식 CPI가 나올 때마다 <b className="text-[var(--text)]">누가 가장 가깝게 맞혔나</b>를 기록합니다(헤드라인 YoY). 나우캐스트·클리블랜드 연준·월가 컨센서스·Kalshi(시장)를 같은 잣대로.
        <b className="text-[var(--text)]"> 과거 성적이며 미래 예측·매매 신호가 아닙니다.</b>
      </p>

      {locked && <div className="mb-4"><UnlockGate /></div>}

      {!locked && s && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-2">장기 성적 (백테스트)</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="나우캐스트 MAE" value={fx(s.mae_fmc)} sub="%p" />
            <Stat label="나이브 MAE" value={fx(s.mae_naive)} sub="%p·직전값" />
            <Stat label="나이브 대비 승률" value={pctOf(s.beats_naive_pct)} sub={s.prints ? `${s.prints}회` : ''} />
          </div>
          {s.street_overlap && (
            <p className="text-[11px] text-[var(--text-muted)] mt-2 tabular-nums">
              월가와 겹치는 {s.street_overlap.prints ?? '—'}회: 나우캐스트 MAE <b className="text-[var(--text)]">{fx(s.street_overlap.mae_fmc)}</b> vs 월가 <b className="text-[var(--text)]">{fx(s.street_overlap.mae_street)}</b>
            </p>
          )}
          {s.range && <p className="text-[10px] text-[var(--text-muted)] mt-1">기간 {s.range[0]}~{s.range[1]} · 모델 {s.model}</p>}
        </div>
      )}

      {!locked && prints.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-1">발표별 적중 (헤드라인 YoY)</h2>
          <p className="text-[11px] text-[var(--text-muted)] mb-2">★ = 그 달 가장 정확 · 괄호는 공식과의 절대오차(%p)</p>
          <ul className="space-y-3">
            {prints.map((p) => (
              <li key={p.print_month} className="border-t border-[var(--border)] pt-2 first:border-0 first:pt-0">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-[var(--text)]">{p.print_month}</span>
                  <span className="text-[11px] text-[var(--text-muted)] tabular-nums">공식 <b className="text-[var(--text)]">{fx(p.actual)}%</b></span>
                </div>
                <ul className="space-y-0.5">
                  {acctForecasters(p).map((x) => (
                    <li key={x.key} className="flex items-center justify-between text-[11px] tabular-nums">
                      <span className="flex items-center gap-1 min-w-0">
                        {x.best && <span className="text-amber-400">★</span>}
                        <span className={`truncate ${x.best ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>{x.name}</span>
                        {x.f.pre_registered && <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">사전등록</span>}
                      </span>
                      <span className="shrink-0 text-[var(--text)]">{fx(x.f.value)}% <span className="text-[var(--text-muted)]">({fx(x.f.abs)})</span></span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!acct && !bt && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 백테스트는 빈티지 기준 과거 재현치로 표본이 작습니다. 서프라이즈로 방향을 맞히는 우위는 이 앱의 측정에서 확인되지 않았습니다.
      </p>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-2.5">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="text-base font-bold tabular-nums text-[var(--text)]">{value}</p>
      {sub && <p className="text-[9px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
