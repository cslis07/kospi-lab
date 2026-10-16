'use client';

/** 인플레 히트맵 — quilt_months_*.json. 품목 × 월 YoY 색지도(빨강=상승·파랑=하락, 진할수록 큼). 가로 스크롤. */
import { useState } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { quiltCellColor, type Quilt } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const mLabel = (m: string) => { const [y, mm] = m.split('-'); return `${y.slice(2)}.${mm}`; };
const cellPct = (yoy?: number | null) => (yoy == null || !Number.isFinite(yoy) ? '' : `${(yoy * 100).toFixed(1)}`);

export default function QuiltPage() {
  const [win, setWin] = useState<24 | 48>(24);
  const { data: q } = useSWR<Quilt>(`/api/nf/quilt_months_${win}.json`, fetcher, SWR_OPT);
  const months = q?.months ?? [];
  const comps = q?.components ?? [];

  const seg = (on: boolean) => `px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${on ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">인플레 히트맵</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        품목별 물가(YoY)가 <b className="text-[var(--text)]">달마다 어떻게 달아올랐다 식었나</b>를 색지도로 봅니다. <span className="text-red-400 font-semibold">빨강=상승</span>, <span className="text-blue-400 font-semibold">파랑=하락</span>, 진할수록 변화가 큽니다.
        <b className="text-[var(--text)]"> 매매 신호가 아닙니다.</b>
      </p>

      {q?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!q?.locked && (
        <div className="flex gap-1.5 mb-3">
          <button type="button" className={seg(win === 24)} onClick={() => setWin(24)}>최근 24개월</button>
          <button type="button" className={seg(win === 48)} onClick={() => setWin(48)}>48개월</button>
        </div>
      )}

      {!q?.locked && comps.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-2 mb-3 overflow-x-auto no-scrollbar">
          <table className="border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--bg-card)] text-left text-[10px] font-semibold text-[var(--text-muted)] pr-2 pl-1">품목</th>
                {months.map((m) => (
                  <th key={m} className="text-[8px] font-medium text-[var(--text-muted)] tabular-nums" style={{ minWidth: 20 }}>{m.endsWith('-01') || m.endsWith('-07') ? mLabel(m) : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.key}>
                  <td className="sticky left-0 z-10 bg-[var(--bg-card)] text-[10px] text-[var(--text)] whitespace-nowrap pr-2 pl-1">{c.label}</td>
                  {c.cells.map((cell, i) => (
                    <td key={i} title={`${c.label} ${months[i] ?? ''}: ${cellPct(cell.yoy)}%`}
                      className="rounded-[3px]" style={{ background: quiltCellColor(cell.yoy), width: 20, height: 18 }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!q && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mb-3">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: quiltCellColor(-0.05) }} /> 하락
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: quiltCellColor(0.02) }} />
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: quiltCellColor(0.06) }} /> 상승(강)
        <span className="ml-1">· 셀을 누르면 값이 뜹니다</span>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 중계 데이터는 최근 수년 범위라 100년 장기 시계열은 포함되지 않습니다.
      </p>
    </>
  );
}
