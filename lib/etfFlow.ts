// BTC·ETH 현물 ETF 일별 순유입 (SoSoValue) — coin-signal에서 이식
// 2026-10: 옛 무키 주소(api.sosovalue.xyz)가 Cloudflare 403으로 막힘 → 공식 OpenAPI(키 필요)로 이전.
// 키(env SOSOVALUE_API_KEY)가 없으면 옛 주소를 한 번 시도하고, 그래도 실패하면 null('데이터 없음').
// 실패해도 Next 데이터 캐시가 마지막 성공값을 계속 내줄 수 있어(10-07에서 멈춘 원인) 날짜로 지연을 판정한다.
export interface EtfFlow {
  net: number; streak: number; recent3: number;
  latest: { date: string; netUsd: number; cumUsd: number };
  recent: { date: string; netUsd: number; cumUsd: number }[];
  /** 최신 집계일이 오늘(UTC)로부터 며칠 전인지 */
  ageDays: number;
  /** 최신 집계일이 STALE_DAYS 넘게 지났으면 true — 방향 점수에서 빼고 화면에 '지연' 표기 */
  stale: boolean;
}
type Row = { date: string; totalNetInflow: number; cumNetInflow: number };

/** 주말·미국 휴장 + 하루 늦은 집계를 감안한 허용 일수(금요일분을 화요일 아침에 봐도 4일) */
export const STALE_DAYS = 4;

export function etfAgeDays(date: string, now: number = Date.now()): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((now - t) / 86_400_000);
}

export function buildEtfFlow(raw: Row[], now: number = Date.now()): EtfFlow | null {
  const rows = raw.filter((r) => r.date && r.totalNetInflow != null).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) return null;
  let streak = 0; const sign = Math.sign(rows[0].totalNetInflow);
  for (const r of rows) { if (Math.sign(r.totalNetInflow) === sign && sign !== 0) streak++; else break; }
  const recent = rows.slice(0, 10).map((r) => ({ date: r.date, netUsd: Math.round(r.totalNetInflow), cumUsd: Math.round(r.cumNetInflow || 0) }));
  const ageDays = etfAgeDays(rows[0].date, now);
  return {
    net: rows[0].totalNetInflow, streak: streak * sign, recent3: rows.slice(0, 3).reduce((s, r) => s + r.totalNetInflow, 0),
    latest: recent[0], recent, ageDays, stale: ageDays > STALE_DAYS,
  };
}

const HOSTS = [
  { url: 'https://openapi.sosovalue.com/openapi/v2/etf/historicalInflowChart', keyed: true },
  { url: 'https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart', keyed: false },
];

async function one(type: string): Promise<EtfFlow | null> {
  const key = process.env.SOSOVALUE_API_KEY?.trim();
  for (const h of HOSTS) {
    if (h.keyed && !key) continue;
    try {
      const res = await fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(h.keyed ? { 'x-soso-api-key': key! } : {}) },
        body: JSON.stringify({ type }), signal: AbortSignal.timeout(8000), next: { revalidate: 1800 },
      });
      if (!res.ok) continue;
      const raw = await res.json().catch(() => null);
      if (raw?.code !== 0 || !Array.isArray(raw?.data)) continue;
      const flow = buildEtfFlow(raw.data as Row[]);
      if (flow) return flow;
    } catch { /* 다음 주소 */ }
  }
  return null;
}

export async function getEtfFlows(): Promise<{ BTC: EtfFlow | null; ETH: EtfFlow | null }> {
  const [BTC, ETH] = await Promise.all([one('us-btc-spot').catch(() => null), one('us-eth-spot').catch(() => null)]);
  return { BTC, ETH };
}

// 코인별 ETF 방향 점수 -1..+1 (BTC/ETH만 유효, XRP/SOL은 0). 지연된 데이터는 0(근거에서 제외).
export function etfBiasFor(flows: { BTC: EtfFlow | null; ETH: EtfFlow | null } | null, coinTag: string): number {
  const d = flows && (flows as Record<string, EtfFlow | null>)[coinTag];
  if (!d || d.stale) return 0;
  let s = 0;
  if (d.streak >= 3) s += 0.6; else if (d.streak >= 1) s += 0.3;
  else if (d.streak <= -3) s -= 0.6; else if (d.streak <= -1) s -= 0.3;
  if (d.recent3 > 1e9) s += 0.3; else if (d.recent3 < -1e9) s -= 0.3;
  return Math.max(-1, Math.min(1, s));
}
