'use client';

/** 방법론·현황 — siteMeta(버전·가중치·백테스트) + qa(헬스체크) + sources_status(소스 상태). 정보 페이지, 매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import type { SiteMeta, Qa, SourcesStatus } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };

export default function MethodologyPage() {
  const { data: meta } = useSWR<SiteMeta>('/api/nf/siteMeta.json', fetcher, SWR_OPT);
  const { data: qa } = useSWR<Qa>('/api/nf/qa.json', fetcher, SWR_OPT);
  const { data: ss } = useSWR<SourcesStatus>('/api/nf/sources_status.json', fetcher, SWR_OPT);
  const locked = meta?.locked;
  const v = (k: string) => (meta?.[k] != null ? String(meta[k]) : '—');
  const sources = (ss?.sources ?? []).slice(0, 12);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">방법론·현황</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        실시간 게이지가 <b className="text-[var(--text)]">어떻게 만들어지는지</b>와 데이터 현황입니다. 공식 CPI가 아니라 공개 데이터로 매일 추정하는 참고 지표입니다.
      </p>

      {locked && <div className="mb-4"><UnlockGate /></div>}

      {!locked && meta && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">개요</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <Row k="방법 버전" v={v('method_version')} />
              <Row k="기준 시점" v={v('base_period')} />
              <Row k="2018년 이후 누적" v={`${v('cum_since_2018_pct')}%`} />
              <Row k="추적 시계열" v={`${v('series_count')}개`} />
              <Row k="데이터 소스" v={`${v('source_count')}곳`} />
              <Row k="게이지 YoY" v={`${v('gauge_yoy_pct')}%`} />
            </dl>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">주요 가중치</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <Row k="주거(쉘터)" v={`${v('weight_shelter_pct')}%`} />
              <Row k="자가주거비(OER)" v={`${v('weight_oer_pct')}%`} />
              <Row k="식품" v={`${v('weight_food_pct')}%`} />
              <Row k="에너지" v={`${v('weight_energy_pct')}%`} />
              <Row k="의료" v={`${v('weight_medical_pct')}%`} />
            </dl>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">백테스트</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <Row k="검증 발표 수" v={`${v('backtest_prints')}회`} />
              <Row k="평균오차(MAE)" v={`${v('backtest_mae_pp')}%p`} />
              <Row k="나이브 대비 승률" v={v('backtest_beats_naive_pct')} />
            </dl>
          </div>
        </>
      )}

      {!locked && (qa || sources.length > 0) && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-[var(--text)]">데이터 상태</h2>
            {qa && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${qa.critical_ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                점검 {qa.passed}/{qa.total}
              </span>
            )}
          </div>
          {sources.length > 0 && (
            <ul className="divide-y divide-[var(--border)]/60">
              {sources.map((s) => (
                <li key={s.name} className="py-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[var(--text)] truncate pr-2">{s.name}</span>
                  <span className="shrink-0 flex items-center gap-1.5">
                    {s.last_success_at && <span className="text-[var(--text-muted)] tabular-nums">{s.last_success_at.slice(0, 10)}</span>}
                    <span className={`w-1.5 h-1.5 rounded-full ${s.last_status === 'OK' ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-label={s.last_status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!meta && !qa && !ss && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 전체 방법론·용어·정정 이력은 원문을 참고하세요.
      </p>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--text-muted)]">{k}</dt>
      <dd className="font-bold tabular-nums text-[var(--text)] text-right">{v}</dd>
    </div>
  );
}
