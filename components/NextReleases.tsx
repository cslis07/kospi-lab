'use client';

/**
 * 다음 주요 지표 발표 카운트다운 — Nowflation 'CPI Release Dates' 참고.
 * 가까운 발표(CPI·PCE·고용 등)별 라이브 카운트다운 + 컨센서스·나우캐스트·직전값.
 * 데이터: release_calendar.json(ReleaseCalendar) — datetime_utc 있으면 그 시각, 없으면 날짜 08:30 ET 가정.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReleaseCalendar } from '@/lib/inflation';

const KIND_KO: Record<string, string> = { cpi: '미국 CPI', pce: '미국 PCE', ppi: '미국 PPI', nfp: '미국 고용(NFP)', jobs: '미국 고용', gdp: '미국 GDP', retail: '미국 소매판매' };
const relTs = (e: { datetime_utc?: string; date: string }) => (e.datetime_utc ? Date.parse(e.datetime_utc) : e.date ? Date.parse(`${e.date}T13:30:00Z`) : NaN); // 08:30 ET ≈ 13:30 UTC
function fmtCountdown(ms: number) {
  if (ms <= 0) return '발표 임박';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `D-${d} · ${h}시간 ${m}분`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function kstTime(iso?: string) { if (!iso) return null; const k = new Date(Date.parse(iso) + 9 * 3_600_000); return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`; }
const fx = (v?: number | null, u?: string) => (v == null ? '—' : `${(+v).toFixed(+v >= 10 ? 1 : 2)}${u ?? ''}`);

export default function NextReleases({ rc, limit = 4, detailHref }: { rc?: ReleaseCalendar; limit?: number; detailHref?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const up = (rc?.events ?? [])
    .map((e) => ({ e, t: relTs(e) }))
    .filter((x) => Number.isFinite(x.t) && x.t > now - 6 * 3_600_000) // 발표 후 6h까지 '임박'으로 유지
    .sort((a, b) => a.t - b.t)
    .slice(0, limit);
  if (!up.length) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {up.map(({ e, t }, i) => {
        const diff = t - now;
        const kt = kstTime(e.datetime_utc);
        return (
          <div key={`${e.kind}-${e.date}`} className={`rounded-xl border p-3 ${i === 0 ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)]' : 'border-[var(--line-2)]'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[var(--text)] truncate">{KIND_KO[e.kind] ?? e.kind.toUpperCase()}{e.data_month ? ` ${e.data_month}` : ''}</span>
              <span className="text-[11px] tabular-nums font-extrabold text-[var(--accent-ink)] shrink-0">{fmtCountdown(diff)}</span>
            </div>
            <p className="text-[10px] text-[var(--text-muted)] tabular-nums mt-0.5">{kt ? `${kt} KST · ` : ''}{e.date}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums mt-1.5">
              {e.street != null && <span className="text-[var(--text-muted)]">컨센서스 <b className="text-[var(--text)]">{fx(e.street, e.unit)}</b></span>}
              {e.nowflation_forecast != null && <span className="text-[var(--text-muted)]">나우캐스트 <b className="text-[var(--accent-ink)]">{fx(e.nowflation_forecast, e.unit)}</b></span>}
              {e.prior != null && <span className="text-[var(--text-muted)]">직전 {fx(e.prior, e.unit)}</span>}
            </div>
          </div>
        );
      })}
      {detailHref && <Link href={detailHref} className="sm:col-span-2 text-[11px] text-[var(--accent-ink)] font-semibold">발표 일정·예측 자세히 →</Link>}
    </div>
  );
}
