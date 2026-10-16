'use client';

/** 인플레 계산기 — quilt_102 ours_cpi_comparable YoY를 연 앵커로, N년 전 금액의 지금 가치(구매력). 게이지 기준·연 단위·우리 데이터 범위(~2018~) 한정. */
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import { yoyAnchors, inflateByYears, type Quilt } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
const won = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function CalculatorPage() {
  const { data: q } = useSWR<Quilt>('/api/nf/quilt_months_102.json', fetcher, SWR_OPT);
  const [amount, setAmount] = useState(100);
  const [years, setYears] = useState(5);

  const anchors = useMemo(() => {
    const h = q?.headlines?.find((x) => /cpi.comparable|ours/i.test(x.key)) ?? q?.headlines?.[0];
    return yoyAnchors(h?.cells);
  }, [q]);
  const maxYears = anchors.length;
  const yy = Math.min(years, maxYears || 1);
  const res = inflateByYears(amount, anchors, yy);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">인플레 계산기</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        <b className="text-[var(--text)]">N년 전 금액이 지금 얼마의 가치</b>인지, 실시간 게이지(CPI 준거) 기준으로 환산합니다. 통화 단위는 무관(비율만). <b className="text-[var(--text)]"> 참고용이며 매매 신호가 아닙니다.</b>
      </p>

      {q?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!q?.locked && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <label className="block text-[11px] text-[var(--text-muted)] mb-1">금액</label>
          <input type="number" inputMode="decimal" value={amount} min={0}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            className="w-full mb-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-[15px] tabular-nums text-[var(--text)] outline-none focus:border-[var(--accent)]" />

          <label className="block text-[11px] text-[var(--text-muted)] mb-1">몇 년 전</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Array.from({ length: maxYears }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setYears(n)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border ${yy === n ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>{n}년</button>
            ))}
          </div>

          {res ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/30 p-3">
              <p className="text-[12px] text-[var(--text-muted)]">{yy}년 전 <b className="text-[var(--text)] tabular-nums">{won(amount)}</b> 의 지금 가치</p>
              <p className="text-2xl font-extrabold tabular-nums text-[var(--text)] mt-0.5">{won(res.value)}</p>
              <p className="text-[12px] tabular-nums mt-1 text-red-400">누적 물가 +{res.cumPct.toFixed(1)}% · 구매력 {(100 - 100 / (1 + res.cumPct / 100)).toFixed(1)}% 감소</p>
            </div>
          ) : <p className="text-[12px] text-[var(--text-muted)]">데이터 준비 중…</p>}
        </div>
      )}

      {!q && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계). 연 단위 YoY를 복리로 누적한 추정이며, 중계 데이터 범위상 최대 {maxYears || '—'}년까지만 계산됩니다(100년 장기 미포함).
      </p>
    </>
  );
}
