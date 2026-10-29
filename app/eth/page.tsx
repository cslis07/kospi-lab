'use client';

import { useMemo } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import useSWR from 'swr';
import type { RegimeRead, LayerTilt } from '@/lib/coinRegime';
import type { SupplyLayer } from '@/lib/coinSupply';
import type { DemandLayer } from '@/lib/coinPremium';
import type { OptionsLayer } from '@/lib/coinOptions';
import type { BaseRates } from '@/lib/regimeEdge';
import type { MacroContext } from '@/lib/coinMacroContext';
import { upcomingCatalysts, CRYPTO_CATALYSTS, CATALYSTS_ASOF, type CatalystKind } from '@/lib/cryptoCatalysts';

interface Positioning {
  fundingRate: number | null;
  fundingPctAnnual: number | null;
  longShortRatio: number | null;
  oiEth: number | null;
  priceUsd: number | null;
  fundingDeltaAnnual: number | null;
  lsDelta: number | null;
  oi24hChgPct: number | null;
}
interface RegimePayload {
  regime: RegimeRead;
  supply: SupplyLayer | null;
  demand: DemandLayer | null;
  options: OptionsLayer | null;
  positioning: Positioning | null;
  macro: MacroContext | null;
  edge: BaseRates & { priceUsd: number | null };
  asof: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(v: number | null | undefined, dec = 2) {
  return v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function signed(v: number | null | undefined, dec = 2, unit = '%') {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(dec)}${unit}`;
}
function usd(v: number | null | undefined) {
  return v == null || !Number.isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
// Δ 화살표 — 상승=빨강/하락=파랑(국내 관행). null이면 아무것도 안 그림(지어내지 않음).
function Dlt({ v, dec = 2, unit = '%p', label = '어제比' }: { v: number | null | undefined; dec?: number; unit?: string; label?: string }) {
  if (v == null || !Number.isFinite(v)) return null;
  const cls = v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text-muted)]';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '·';
  return (
    <span className={`ml-1 ${cls}`} title={label}>
      {arrow}{Math.abs(v).toFixed(dec)}{unit}
    </span>
  );
}

const KIND_LABEL: Record<CatalystKind, string> = { regulation: '규제', institution: '기관', politics: '정치' };
const KIND_CLS: Record<CatalystKind, string> = { regulation: 'text-sky-400', institution: 'text-emerald-400', politics: 'text-amber-400' };
function ddayLabel(d: number) {
  return d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : `${-d}일 전`;
}

const TILT_STYLE: Record<number, { cls: string; badge: string }> = {
  1: { cls: 'text-emerald-400', badge: '순풍' },
  0: { cls: 'text-[var(--text-muted)]', badge: '중립' },
  [-1]: { cls: 'text-rose-400', badge: '맞바람' },
};

function TiltCard({ t, children }: { t: LayerTilt; children?: React.ReactNode }) {
  const s = TILT_STYLE[t.tilt];
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-bold text-[var(--text)]">{t.label}</p>
        <span className={`text-[11px] font-semibold ${s.cls}`}>{s.badge}</span>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{t.reason}</p>
      {children}
    </div>
  );
}

export default function EthRegimePage() {
  const { data, isLoading } = useSWR<RegimePayload>('/api/coin/regime', fetcher, { refreshInterval: 60000 });
  const price = data?.positioning?.priceUsd ?? data?.edge?.priceUsd ?? data?.demand?.ethUsd ?? null;
  const catalysts = useMemo(() => upcomingCatalysts(CRYPTO_CATALYSTS, Date.now()), []);

  const r = data?.regime;
  const STRENGTH_CLS: Record<string, string> = { '강': 'text-emerald-400', '보통': 'text-[var(--accent)]', '약': 'text-amber-400', '혼조': 'text-[var(--text-muted)]' };

  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto pb-12">
      <PageHeader title="ETH 체제" sub={<>공급·수요·포지셔닝·거시 4개 층을 모아 <b className="text-[var(--text)]">“지금 어떤 체제인가”</b>를 읽습니다. 1분마다 갱신.</>} />
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 mb-5">
        <p className="text-[11px] text-amber-300/90 leading-snug">
          ⚠ <b>방향 예측·매매 신호가 아닙니다.</b> 이 앱 실측 결론은 “방향 우위 없음”. 여기 정렬도(confluence)는 맞힐 확신이 아니라
          <b className="text-amber-200"> 레버리지·사이징을 조절</b>하는 참고입니다(계산은 계산기에서). 배경(공급·수요·거시)은 상승의 <b>증폭 조건</b>일 뿐 트리거가 아닙니다.
        </p>
      </div>

      {isLoading && !data ? (
        <p className="text-[12px] text-[var(--text-muted)] text-center py-10 border border-dashed border-[var(--border)] rounded-xl">체제 집계 중…</p>
      ) : !r ? (
        <p className="text-[12px] text-[var(--text-muted)] text-center py-10 border border-dashed border-[var(--border)] rounded-xl">데이터를 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>
      ) : (
        <>
          {/* 종합 헤드라인 */}
          <div className="rounded-xl border border-[var(--accent)]/50 bg-[var(--surface-2)] p-4 mb-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">현재 체제 · ETH {usd(price)}<Dlt v={data!.demand?.eth24hChgPct} dec={2} unit="%" label="24h" /></span>
              <span className={`text-[12px] font-bold ${STRENGTH_CLS[r.confluence.strength] ?? ''}`}>정렬도 {r.confluence.strength} (net {signed(r.confluence.net, 0, '')})</span>
            </div>
            <p className="text-[15px] font-extrabold text-[var(--text)] leading-snug">{r.headline}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-snug">{r.note}</p>
          </div>

          {/* 4레이어 카드 */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <TiltCard t={r.tilts[0]}>
              {data!.supply && (
                <div className="mt-2 text-[10.5px] text-[var(--text-muted)] space-y-0.5 tabular-nums">
                  <p>스테이블 공급 {signed(data!.supply.stables?.weekChangePct, 2)}<span className="opacity-60"> /주</span><Dlt v={data!.supply.stables?.dayChangePct} dec={2} unit="%" /></p>
                  <p>stETH peg {signed(data!.supply.steth?.pegPct, 3)}<Dlt v={data!.supply.steth?.peg24hChg} dec={3} /></p>
                </div>
              )}
            </TiltCard>
            <TiltCard t={r.tilts[1]}>
              {data!.demand && (
                <div className="mt-2 text-[10.5px] text-[var(--text-muted)] space-y-0.5 tabular-nums">
                  <p>코인베이스 프리미엄 {signed(data!.demand.coinbasePremiumPct, 3)}</p>
                  <p>CVD {signed(data!.demand.cvdRatioPct, 1)}<span className="opacity-60"> /{data!.demand.cvdWindowH}h 순테이커</span></p>
                  <p>김프 {signed(data!.demand.kimchiPct, 2)}</p>
                </div>
              )}
            </TiltCard>
            {/* 포지셔닝(쏠림) — 별도 오버레이 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-[var(--text)]">포지셔닝(쏠림)</p>
                <span className={`text-[11px] font-semibold ${r.crowding === 'crowded_long' ? 'text-rose-400' : r.crowding === 'crowded_short' ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                  {r.crowding === 'crowded_long' ? '롱 과열' : r.crowding === 'crowded_short' ? '숏 과열' : r.crowding === 'balanced' ? '균형' : '미상'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{r.crowdingNote}</p>
              {data!.positioning && (
                <div className="mt-2 text-[10.5px] text-[var(--text-muted)] space-y-0.5 tabular-nums">
                  <p>펀딩(연율) {signed(data!.positioning.fundingPctAnnual, 1)}<Dlt v={data!.positioning.fundingDeltaAnnual} dec={1} /></p>
                  <p>롱숏비율 {fmt(data!.positioning.longShortRatio, 2)}<Dlt v={data!.positioning.lsDelta} dec={2} unit="" /></p>
                  <p>OI {data!.positioning.oiEth != null && price ? `$${((data!.positioning.oiEth * price) / 1e9).toFixed(2)}B` : '—'}<span className="opacity-50"> Bitget</span><Dlt v={data!.positioning.oi24hChgPct} dec={1} unit="%" label="24h" /></p>
                </div>
              )}
            </div>
            <TiltCard t={r.tilts[2]}>
              {data!.macro && <p className="mt-2 text-[10.5px] text-[var(--text-muted)] leading-snug">{data!.macro.headline}</p>}
            </TiltCard>
          </div>

          {/* 옵션 만기·맥스페인 */}
          {data!.options && data!.options.expiries.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 mb-2">
              <p className="text-[12px] font-bold text-[var(--text)] mb-1.5">옵션 만기·맥스페인 <span className="text-[10px] font-normal text-[var(--text-muted)]">(변동성 트리거 일정 · 방향 아님)</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {data!.options.expiries.map((e) => (
                  <div key={e.expiry} className="rounded-lg bg-[var(--surface-2)] px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-[var(--text)]">{e.expiry} <span className="text-[10px] text-[var(--text-muted)]">D-{e.daysToExpiry}</span></p>
                    <p className="text-[10.5px] text-[var(--text-muted)] tabular-nums">맥스페인 {usd(e.maxPain)} · OI {fmt(e.totalOiEth, 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 정책·규제 이벤트 워치 (큐레이션·변동성 일정, 방향 아님) */}
          {catalysts.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 mb-2">
              <p className="text-[12px] font-bold text-[var(--text)] mb-1.5">정책·규제 이벤트 워치 <span className="text-[10px] font-normal text-[var(--text-muted)]">(큐레이션 {CATALYSTS_ASOF} 기준 · 변동성 주의 · 매수 신호 아님)</span></p>
              <ul className="space-y-1.5">
                {catalysts.map((c) => (
                  <li key={c.date + c.title} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] font-semibold text-[var(--text)] leading-snug">
                        <span className={`${KIND_CLS[c.kind]} mr-1`}>[{KIND_LABEL[c.kind]}]</span>{c.title}
                      </p>
                      <span className="text-[10.5px] text-[var(--text-muted)] tabular-nums shrink-0 text-right">{c.dateLabel}<br />{ddayLabel(c.dday)}</span>
                    </div>
                    <p className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-snug">{c.desc} <span className="opacity-80">{c.note}</span> <span className="opacity-50">({c.source})</span></p>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-[var(--text-muted)] opacity-60 mt-1.5 leading-snug">규제는 대부분 제안/의견수렴 단계이며 마감일은 승인일이 아닙니다. 수동 큐레이션이라 자동 갱신되지 않습니다.</p>
            </div>
          )}

          {/* 과거 base rate */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 mb-2">
            <p className="text-[12px] font-bold text-[var(--text)] mb-1.5">과거 통계 — {data!.edge.stateLabel} 체제의 다음 {data!.edge.horizonDays}일 <span className="text-[10px] font-normal text-[var(--text-muted)]">(예측 아님)</span></p>
            {data!.edge.matched ? (
              <>
                <table className="w-full text-[11px] tabular-nums">
                  <thead><tr className="text-[var(--text-muted)] text-left"><th className="font-normal py-0.5">구분</th><th className="font-normal">표본</th><th className="font-normal">상승비율</th><th className="font-normal">중앙 변동폭</th></tr></thead>
                  <tbody className="text-[var(--text)]">
                    <tr><td className="py-0.5">현재 체제</td><td>{data!.edge.matched.n}</td><td>{(data!.edge.matched.upRatio * 100).toFixed(0)}%</td><td>±{data!.edge.matched.medianAbsMovePct.toFixed(1)}%</td></tr>
                    {data!.edge.control && <tr className="text-[var(--text-muted)]"><td className="py-0.5">전체(대조군)</td><td>{data!.edge.control.n}</td><td>{(data!.edge.control.upRatio * 100).toFixed(0)}%</td><td>±{data!.edge.control.medianAbsMovePct.toFixed(1)}%</td></tr>}
                  </tbody>
                </table>
                <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5 leading-snug">{data!.edge.note}</p>
              </>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">{data!.edge.note}</p>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
            출처(무키): 공급=DefiLlama·CoinGecko · 수요=Coinbase·Upbit · 포지셔닝=Bitget·Binance · 옵션=Deribit · 과거통계=Bitget 일봉.
            거래소 ETH 단독 보유량 정밀값·온체인 순유입은 유료라 제외했고, 스테이블코인·stETH·리저브 추세로 공급 그림을 대신합니다.
            어떤 수치도 방향 예측이 아니며, 투자 권유가 아닙니다.
          </p>
        </>
      )}
    </div>
  );
}
