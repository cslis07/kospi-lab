'use client';

/** 예측시장 — predmarkets_summary(Polymarket·Kalshi). 실제 돈이 걸린 시장 확률(시장 심리), 예측·매매 신호 아님. */
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import type { PredMarkets, PredMarket } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };
function fmtVol(n?: number) {
  if (!n || !Number.isFinite(n)) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function MarketsPage() {
  const { data: pm } = useSWR<PredMarkets>('/api/nf/predmarkets_summary.json', fetcher, SWR_OPT);
  const groups = (pm?.groups ?? []).filter((g) => g.markets?.length);

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">예측시장</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        Polymarket·Kalshi 등에서 <b className="text-[var(--text)]">실제 돈이 걸린 시장</b>이 Fed·금리·물가를 어떻게 보는지(확률). 전문가 전망이 아니라 베팅으로 드러난 시장 심리입니다.
        <b className="text-[var(--text)]"> 예측·매매 신호가 아닙니다.</b>
      </p>

      {pm?.locked && <div className="mb-4"><UnlockGate /></div>}

      {!pm?.locked && groups.map((g) => (
        <div key={g.key} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-2">{g.label}</h2>
          <ul className="space-y-3">
            {g.markets.slice(0, 5).map((m, i) => <MarketRow key={`${m.title}-${i}`} m={m} />)}
          </ul>
        </div>
      ))}

      {!pm && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (CC BY 4.0, 중계) · 원시장 Polymarket·Kalshi. 확률은 시장 가격이며 사실·예측이 아닙니다.
      </p>
    </>
  );
}

function MarketRow({ m }: { m: PredMarket }) {
  const outs = [...(m.outcomes ?? [])].sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0)).slice(0, 4);
  return (
    <li className="border-t border-[var(--border)] pt-3 first:border-0 first:pt-0">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-[12px] font-semibold text-[var(--text)] leading-snug min-w-0">
          {m.url ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.title}</a> : m.title}
        </p>
        <span className="shrink-0 text-[10px] text-[var(--text-muted)] tabular-nums">{m.source}{m.volume ? ` · ${fmtVol(m.volume)}` : ''}</span>
      </div>
      <ul className="space-y-1">
        {outs.map((o, i) => {
          const w = Math.max(0, Math.min(100, o.prob ?? 0));
          return (
            <li key={`${o.name}-${i}`}>
              <div className="flex items-center justify-between text-[11px] tabular-nums mb-0.5">
                <span className="text-[var(--text)] truncate pr-2">{o.name}</span>
                <span className="shrink-0 font-bold text-[var(--text)]">{w.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${w}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
