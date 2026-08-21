'use client';

/** 현물 ETF 일별 순유입 — BTC·ETH. /api/coin-env 의 etf 를 렌더(미니 막대 + 누적). */
import type { EtfFlow } from '@/lib/etfFlow';

function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${n < 0 ? '-' : ''}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${n < 0 ? '-' : ''}$${Math.round(a / 1e6)}M`;
  return `${n < 0 ? '-' : '+'}$${Math.round(a).toLocaleString()}`;
}
const signed = (n: number) => (n >= 0 ? `+${fmtUsd(n)}` : fmtUsd(n));

function Card({ title, flow }: { title: string; flow: EtfFlow | null }) {
  if (!flow) return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="text-sm font-bold text-[var(--text)] mb-1">{title}</p>
      <p className="text-xs text-[var(--text-muted)]">데이터 없음</p>
    </div>
  );
  const bars = [...flow.recent].reverse().slice(-7);   // 오래된→최신
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.netUsd)));
  const cum7 = bars.reduce((s, b) => s + b.netUsd, 0);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-sm font-bold text-[var(--text)]">{title}</p>
        <span className="text-[10px] text-[var(--text-muted)]">{flow.latest.date}</span>
      </div>
      <p className={`text-3xl font-bold tabular-nums ${flow.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{signed(flow.net)}</p>
      <p className={`text-xs mt-1 ${flow.streak >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {Math.abs(flow.streak)}일 연속 {flow.streak >= 0 ? '순유입' : '순유출'}
      </p>
      <div className="flex items-end gap-1 h-12 mt-3">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full" title={`${b.date}: ${signed(b.netUsd)}`}>
            <div className={`w-full rounded-sm ${b.netUsd >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
              style={{ height: `${Math.max(6, (Math.abs(b.netUsd) / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-2">누적 순유입 {signed(cum7)} · 최근 7일</p>
    </div>
  );
}

export default function EtfInflow({ etf }: { etf: { BTC: EtfFlow | null; ETH: EtfFlow | null } | null }) {
  if (!etf) return null;
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold text-[var(--text)]">현물 ETF 일별 순유입</h2>
        <span className="text-xs text-[var(--text-muted)]">기관 수급 · SoSoValue</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="BTC 현물 ETF" flow={etf.BTC} />
        <Card title="ETH 현물 ETF" flow={etf.ETH} />
      </div>
    </section>
  );
}
