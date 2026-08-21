// BTC·ETH 현물 ETF 일별 순유입 (SoSoValue 공개 API, 무키) — coin-signal에서 이식
export interface EtfFlow { net: number; streak: number; recent3: number; latest: { date: string; netUsd: number; cumUsd: number }; recent: { date: string; netUsd: number; cumUsd: number }[] }

async function one(type: string): Promise<EtfFlow | null> {
  const res = await fetch('https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }), signal: AbortSignal.timeout(8000), next: { revalidate: 1800 },
  });
  const raw = await res.json();
  const rows = ((raw?.data ?? []) as { date: string; totalNetInflow: number; cumNetInflow: number }[])
    .filter((r) => r.date && r.totalNetInflow != null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) return null;
  let streak = 0; const sign = Math.sign(rows[0].totalNetInflow);
  for (const r of rows) { if (Math.sign(r.totalNetInflow) === sign && sign !== 0) streak++; else break; }
  const recent = rows.slice(0, 10).map((r) => ({ date: r.date, netUsd: Math.round(r.totalNetInflow), cumUsd: Math.round(r.cumNetInflow || 0) }));
  return { net: rows[0].totalNetInflow, streak: streak * sign, recent3: rows.slice(0, 3).reduce((s, r) => s + r.totalNetInflow, 0), latest: recent[0], recent };
}

export async function getEtfFlows(): Promise<{ BTC: EtfFlow | null; ETH: EtfFlow | null }> {
  const [BTC, ETH] = await Promise.all([one('us-btc-spot').catch(() => null), one('us-eth-spot').catch(() => null)]);
  return { BTC, ETH };
}

// 코인별 ETF 방향 점수 -1..+1 (BTC/ETH만 유효, XRP/SOL은 0)
export function etfBiasFor(flows: { BTC: EtfFlow | null; ETH: EtfFlow | null } | null, coinTag: string): number {
  const d = flows && (flows as Record<string, EtfFlow | null>)[coinTag];
  if (!d) return 0;
  let s = 0;
  if (d.streak >= 3) s += 0.6; else if (d.streak >= 1) s += 0.3;
  else if (d.streak <= -3) s -= 0.6; else if (d.streak <= -1) s -= 0.3;
  if (d.recent3 > 1e9) s += 0.3; else if (d.recent3 < -1e9) s -= 0.3;
  return Math.max(-1, Math.min(1, s));
}
