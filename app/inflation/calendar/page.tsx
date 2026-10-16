'use client';

/** 발표 일정(미국) — release_calendar(나우캐스트 예측 포함 주요 지표) + econcal_window(미국 주요 경제 이벤트). */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { usHighImpact, type ReleaseCalendar, type EconCalWindow } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const fx = (x?: number | null) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(x >= 10 ? 1 : 2));
const KIND_KO: Record<string, string> = { cpi: 'CPI', pce: 'PCE', ppi: 'PPI', jobs: '고용', nfp: '고용', gdp: 'GDP', retail: '소매판매' };
const dShort = (d?: string) => (d ? d.slice(0, 10).replace(/-/g, '.').slice(2) : '—');

export default function CalendarPage() {
  const { data: rc } = useSWR<ReleaseCalendar>('/api/nf/release_calendar.json', fetcher, SWR_OPT);
  const { data: ec } = useSWR<EconCalWindow>('/api/nf/econcal_window.json', fetcher, SWR_OPT);
  const locked = rc?.locked || ec?.locked;
  const releases = (rc?.events ?? []).slice(0, 10);
  const events = usHighImpact(ec, 24);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">발표 일정 (미국)</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        다가오는 미국 주요 지표 발표와, 그에 대한 <b className="text-[var(--text)]">컨센서스·나우캐스트 예측</b>을 모았습니다. 발표 전 "시장이 뭘 기대하는지" 읽는 맥락 도구입니다.
        <b className="text-[var(--text)]"> 매매 신호가 아닙니다.</b>
      </p>

      {locked && <div className="mb-4"><UnlockGate /></div>}

      {!locked && releases.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-2">주요 지표 (예측 포함)</h2>
          <ul className="space-y-2.5">
            {releases.map((e, i) => (
              <li key={`${e.kind}-${e.date}-${i}`} className="border-t border-[var(--border)] pt-2.5 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--amber-soft)] text-[var(--amber)]">{KIND_KO[e.kind] ?? e.kind.toUpperCase()}</span>
                    <span className="text-[12px] font-semibold text-[var(--text)] truncate">{e.data_month ?? ''}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums">{dShort(e.date)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-[var(--text-muted)]">
                  {e.nowflation_forecast != null && <span>나우캐스트 <b className="text-[var(--text)]">{fx(e.nowflation_forecast)}{e.unit ?? ''}</b></span>}
                  {e.street != null && <span>컨센서스 <b className="text-[var(--text)]">{fx(e.street)}{e.unit ?? ''}</b></span>}
                  {e.cleveland != null && <span>클리블랜드 {fx(e.cleveland)}{e.unit ?? ''}</span>}
                  {e.kalshi != null && <span>Kalshi {fx(e.kalshi)}{e.unit ?? ''}</span>}
                  {e.prior != null && <span>직전 {fx(e.prior)}{e.unit ?? ''}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!locked && events.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-2">경제 캘린더 (미국·영향 높음)</h2>
          <ul className="divide-y divide-[var(--border)]/60">
            {events.map((e, i) => (
              <li key={`${e.event}-${e.date}-${i}`} className="py-2 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                <span className="min-w-0 flex items-center gap-1.5">
                  {e.impact === 'High' && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-400" aria-label="영향 높음" />}
                  <span className="text-[var(--text)] truncate">{e.event}</span>
                </span>
                <span className="shrink-0 text-[var(--text-muted)]">
                  {e.estimate != null && <>예상 <b className="text-[var(--text)]">{fx(e.estimate)}{e.unit ?? ''}</b> · </>}
                  {e.previous != null && <>이전 {fx(e.previous)}{e.unit ?? ''} · </>}
                  {dShort(e.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!rc && !ec && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 발표 시각은 미 동부(ET) 기준. 공시·실적 일정은 앱 <a href="/calendar" className="text-[var(--accent-ink)]">경제 캘린더</a>를 참고하세요.
      </p>
    </>
  );
}
