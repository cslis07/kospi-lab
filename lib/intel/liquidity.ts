/**
 * 유동성 그룹 관측값 — 의사결정 엔진 Phase 2. 순수 함수(네트워크 없음).
 *
 *  - 스테이블코인 전체 유통 시총 7일·30일 변화(DefiLlama, 일간). 시총이 늘었다고 바로 매수세는 아니다(명세 §2)
 *    → 신뢰도 0.4 로 낮게, 30일 방향이 반대면 강도를 반으로.
 *  - 현물 ETF 순유입(SoSoValue, 미국 거래일). BTC·ETH 만. 다른 코인은 BTC ETF 로 대신하지 않는다(데이터 없음으로 표시).
 *    방향은 기존 lib/etfFlow etfBiasFor(연속 유입일·최근 3일 합) 값을 서버에서 받아 그대로 쓴다.
 * 기준값(±0.5%·±0.3)은 검증 전 임시값이다.
 */
import type { SignalObservation, Direction } from './decisionEngine';
import type { FedItem, RawNews } from './newsEvents';

export interface StablePointLite { date: string; value: number }   // value: 십억 달러
export interface StableChange {
  latest: number; latestDate: string;
  chg7dPct: number | null; chg30dPct: number | null;
}
export interface EtfLite {
  latestDate: string; latestNetUsd: number;
  recent: { date: string; netUsd: number }[];
  streak: number; recent3: number;
  /** lib/etfFlow etfBiasFor 결과(−1~+1, 지연 데이터면 0) */
  bias: number;
  stale: boolean;
}
export interface ProviderHealth { ok: boolean; note?: string }
/** 공식 일정의 미국 주요 발표(−2시간~+48시간). 시각은 공식 일정 그대로(서머타임 반영) */
export interface ReleaseLite { title: string; at: string; importance: string }

/** /api/intel/context 응답 — 공개 시세·뉴스만(개인 데이터 없음) */
export interface IntelContext {
  ingestedAt: number;
  stable: StableChange | null;
  etf: { BTC: EtfLite | null; ETH: EtfLite | null };
  fed: FedItem[];
  news: RawNews[];
  releases: ReleaseLite[];
  health: { stable: ProviderHealth; etf: ProviderHealth; fed: ProviderHealth; news: ProviderHealth; calendar: ProviderHealth };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

/** 날짜순 시계열 → 최신값과 7일·30일 전 대비 변화(%). 기준일(asOfMs) 이후 점은 쓰지 않는다 */
export function stableChange(points: StablePointLite[], asOfMs: number): StableChange | null {
  const asOfDate = new Date(asOfMs).toISOString().slice(0, 10);
  const pts = points.filter((p) => p.date <= asOfDate && Number.isFinite(p.value) && p.value > 0);
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const back = (days: number) => {
    const cut = new Date(Date.parse(`${last.date}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].date <= cut) return pts[i].value;
    return null;
  };
  const b7 = back(7), b30 = back(30);
  return {
    latest: last.value, latestDate: last.date,
    chg7dPct: b7 ? r2((last.value / b7 - 1) * 100) : null,
    chg30dPct: b30 ? r2((last.value / b30 - 1) * 100) : null,
  };
}

export const ETF_ASSET: Readonly<Record<string, 'BTC' | 'ETH'>> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH' };
const sign = (n: number) => (n > 0 ? '+' : '');

export function liquidityObservations(ctx: IntelContext | null | undefined, symbol: string): SignalObservation[] {
  if (!ctx) return [];
  const out: SignalObservation[] = [];
  const st = ctx.stable;
  if (st && st.chg7dPct != null) {
    const c7 = st.chg7dPct, c30 = st.chg30dPct;
    const dir: Direction = c7 >= 0.5 ? 1 : c7 <= -0.5 ? -1 : 0;
    let strength = dir ? Math.min(1, Math.abs(c7) / 2) : 0.1;
    const against = dir !== 0 && c30 != null && Math.sign(c30) === -dir;
    if (against) strength = r2(strength / 2);
    out.push({
      id: 'liq-stable', group: 'liquidity', family: 'stablecoin_supply', direction: dir, strength, reliability: 0.4,
      availableAt: `${st.latestDate}T00:00:00Z`, maxAgeMinutes: 3 * 1440, source: 'DefiLlama 스테이블코인(일간)',
      sourceUrl: 'https://defillama.com/stablecoins',
      explanation: `스테이블코인 시총 $${st.latest.toFixed(1)}B · 7일 ${sign(c7)}${c7.toFixed(2)}%${c30 != null ? ` · 30일 ${sign(c30)}${c30.toFixed(2)}%` : ''}`
        + (dir > 0 ? ' — 대기 자금 증가(바로 매수는 아님)' : dir < 0 ? ' — 대기 자금 감소' : ' — 뚜렷한 변화 없음') + (against ? ' · 30일 방향 반대라 약하게' : ''),
    });
  }
  const asset = ETF_ASSET[symbol];
  const e = asset ? ctx.etf[asset] : null;
  if (asset && e) {
    const dir: Direction = e.bias >= 0.3 ? 1 : e.bias <= -0.3 ? -1 : 0;
    const usd = (n: number) => `${n < 0 ? '−' : '+'}$${(Math.abs(n) / 1e6).toFixed(0)}M`;
    out.push({
      id: 'liq-etf', group: 'liquidity', family: 'etf_flow', direction: dir, strength: dir ? Math.min(1, Math.abs(e.bias)) : 0.1, reliability: 0.6,
      // 미국 장 마감(16:00 ET ≈ 21:00 UTC) 뒤 집계 — 유효기간은 lib/etfFlow STALE_DAYS(4일)와 맞춘 '집계일 + 5일 0시'
      availableAt: `${e.latestDate}T21:00:00Z`, maxAgeMinutes: 5 * 1440 - 21 * 60, source: `SoSoValue ${asset} 현물 ETF(거래일)`,
      sourceUrl: `https://sosovalue.com/assets/etf/us-${asset.toLowerCase()}-spot`,
      explanation: `${asset} 현물 ETF ${e.latestDate} ${usd(e.latestNetUsd)} · 최근 3일 ${usd(e.recent3)} · 연속 ${e.streak > 0 ? `유입 ${e.streak}일` : e.streak < 0 ? `유출 ${-e.streak}일` : '—'}`,
    });
  }
  return out;
}
