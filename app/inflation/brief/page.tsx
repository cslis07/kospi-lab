'use client';

/** 데일리 브리핑 — brief_daily.json. nowflation의 하루치 인플레 요약(오늘 + 최근 아카이브). 앱 /brief(증시 모닝)와 역할 구분. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { pct, signPp, type BriefDaily } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

export default function BriefPage() {
  const { data: bd } = useSWR<BriefDaily>('/api/nf/brief_daily.json', fetcher, SWR_OPT);
  const t = bd?.today;
  const archive = (bd?.archive ?? []).filter((d) => d.date !== t?.date).slice(0, 14);
  const nr = t?.next_release;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">데일리 브리핑</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        Nowflation이 매일 내는 <b className="text-[var(--text)]">하루치 인플레 요약</b>입니다. 오늘 게이지가 어디고 무엇이 움직였는지, 다음 발표는 언제인지.
        <b className="text-[var(--text)]"> 예측·매매 신호가 아닙니다.</b>
      </p>

      {bd?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!bd?.locked && t && (
        <>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              {t.narrative?.tag && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)]">{t.narrative.tag}</span>}
              <span className="text-[10px] text-[var(--text-muted)] ml-auto">{t.date_label ?? t.date}</span>
            </div>
            {t.narrative?.headline && <p className="text-[15px] font-bold text-[var(--text)] leading-snug">{t.narrative.headline}</p>}
            {t.narrative?.body && <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mt-1">{t.narrative.body}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-[var(--border)] text-[11px] tabular-nums">
              <span className="text-[var(--text-muted)]">게이지 <b className={sign(t.gauge?.yoy_pct)}>{pct(t.gauge?.yoy_pct)}</b></span>
              <span className="text-[var(--text-muted)]">전일 <b className={sign(t.gauge?.dod_pp)}>{signPp(t.gauge?.dod_pp)}</b></span>
              <span className="text-[var(--text-muted)]">전주 <b className={sign(t.gauge?.wow_pp)}>{signPp(t.gauge?.wow_pp)}</b></span>
              {t.gauge?.pace_3m_pct != null && <span className="text-[var(--text-muted)]">3개월 연율 <b className={sign(t.gauge.pace_3m_pct)}>{pct(t.gauge.pace_3m_pct)}</b></span>}
            </div>
          </div>

          {Array.isArray(t.what_moved) && t.what_moved.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-2">무엇이 움직였나</h2>
              <ul className="space-y-1.5 list-disc pl-4">
                {t.what_moved.slice(0, 5).map((m, i) => <li key={i} className="text-[12px] text-[var(--text-muted)] leading-relaxed">{m}</li>)}
              </ul>
            </div>
          )}

          {nr && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h2 className="text-sm font-semibold text-[var(--text)]">다음 발표</h2>
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{nr.date_label}{nr.days_to != null ? ` · D-${nr.days_to}` : ''}</span>
              </div>
              <p className="text-[12px] text-[var(--text)] mb-1">{nr.name} · {nr.print_month_label}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-[var(--text-muted)]">
                {nr.nowflation_forecast != null && <span>나우캐스트 <b className="text-[var(--text)]">{pct(nr.nowflation_forecast)}</b></span>}
                {nr.street != null && <span>컨센서스 <b className="text-[var(--text)]">{pct(nr.street)}</b></span>}
                {nr.cleveland != null && <span>클리블랜드 {pct(nr.cleveland)}</span>}
                {nr.kalshi != null && <span>Kalshi {pct(nr.kalshi)}</span>}
                {nr.prior != null && <span>직전 {pct(nr.prior)}</span>}
              </div>
            </div>
          )}

          {archive.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-2">최근 흐름</h2>
              <ul className="divide-y divide-[var(--border)]/60">
                {archive.map((d) => (
                  <li key={d.date} className="py-1.5 flex items-center justify-between text-[11px] tabular-nums">
                    <span className="text-[var(--text-muted)]">{d.date_label ?? d.date}</span>
                    <span className="shrink-0">게이지 <b className={sign(d.gauge?.yoy_pct)}>{pct(d.gauge?.yoy_pct)}</b> <span className={sign(d.gauge?.dod_pp)}>{signPp(d.gauge?.dod_pp)}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {!bd && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 영어 원문 요약의 수치 중심 정리이며 번역이 아닙니다. 증시 아침 정리는 앱 <a href="/brief" className="text-[var(--accent-ink)]">모닝 브리핑</a>을 참고하세요.
      </p>
    </>
  );
}
