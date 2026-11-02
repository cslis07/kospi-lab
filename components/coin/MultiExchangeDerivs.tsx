'use client';

/**
 * 거래소별 파생 수급 — 합산 OI·OI/가격 4분면, 펀딩 비교(8h·연환산), 마크−인덱스 괴리, 큰손 vs 전체 계정 롱숏(참고: CoinGlass·Coinalyze·Hyblock).
 * 데이터 = /api/coin/derivs(바이낸스·바이비트·OKX·비트겟·하이퍼리퀴드 공개 무키), 계산 = lib/derivsMulti(테스트 고정).
 * 분석(무거운 스냅샷)과 따로 불러와 분석 속도에 영향 없음. 방향 예측·진입 신호 아님 — '레버리지가 어디에 얼마나 쌓였나'를 보는 표.
 */
import useSWR from 'swr';
import { VENUE_LABEL, QUAD_TEXT, crowdGapText, type Venue, type Quadrant } from '@/lib/derivsMulti';

interface VenueRow { venue: Venue; ok: boolean; fundingRate?: number | null; intervalH?: number | null; per8hPct?: number | null; annualPct?: number | null; premiumPct?: number | null; oiCoins?: number | null; oiUsd?: number | null }
interface Win { oiPct: number | null; pricePct: number | null; quadrant: Quadrant | null }
interface DerivsData {
  symbol: string; base: string; asOf: string;
  venues: VenueRow[];
  funding: { weightedAnnualPct: number | null; max: { venue: Venue; annualPct: number } | null; min: { venue: Venue; annualPct: number } | null; spreadPct: number | null };
  oi: { totalCoins: number | null; totalUsd: number | null; histVenues: Venue[]; series: { ts: number; coins: number; price: number }[]; h1: Win; h24: Win };
  longShort: { binanceGlobal: number | null; binanceTopPos: number | null; binanceTopAcc: number | null; gapNow: number | null; gap24h: number | null; bybit: number | null; okx: number | null };
}

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const sgn = (v: number | null | undefined, d = 2, unit = '%') => (v == null || !Number.isFinite(v) ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(d)}${unit}`);
const usdB = (v: number | null | undefined) => (v == null ? '–' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);
const coins = (v: number | null | undefined) => (v == null ? '–' : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0));
const kst = (iso: string) => { const d = new Date(Date.parse(iso) + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
/** 기본 펀딩 0.01%/8h 의 연환산 — 대부분 거래소 기본값(이자율 성분) */
const BASE_ANNUAL = 10.95;

/** OI(코인 수량)·가격 24시간 겹친 선 — 각자 최소~최대로 정규화 */
function OiSpark({ series }: { series: DerivsData['oi']['series'] }) {
  if (series.length < 3) return null;
  const W = 120, Hh = 34;
  const line = (vs: number[]) => {
    const lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1;
    return vs.map((v, i) => `${((i / (vs.length - 1)) * W).toFixed(1)},${(Hh - 2 - ((v - lo) / r) * (Hh - 4)).toFixed(1)}`).join(' ');
  };
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-[120px] h-[34px] shrink-0" role="img" aria-label="최근 24시간 OI와 가격 추이">
      <polyline points={line(series.map((p) => p.price))} fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeDasharray="2 2" />
      <polyline points={line(series.map((p) => p.coins))} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  );
}

function QuadTile({ title, w }: { title: string; w: Win }) {
  const q = w.quadrant ? QUAD_TEXT[w.quadrant] : null;
  const tone = q?.tone === 'build' ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'border-[var(--border)]';
  return (
    <div className={`rounded-xl border px-3 py-2 ${tone}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[var(--text-muted)]">{title}</span>
        <b className="text-[12.5px] text-[var(--text)] whitespace-nowrap">{q?.label ?? '자료 부족'}</b>
      </div>
      <p className="text-[11px] tabular-nums text-[var(--text-muted)] mt-0.5">가격 {sgn(w.pricePct)} · OI {sgn(w.oiPct)}</p>
      {q && <p className="text-[11px] text-[var(--text)] leading-snug mt-1">{q.desc}</p>}
    </div>
  );
}

function LsBar({ label, longPct, sub }: { label: string; longPct: number | null; sub?: string }) {
  if (longPct == null) return null;
  return (
    <div>
      <div className="flex justify-between gap-2 text-[11px] mb-0.5">
        <span className="text-[var(--text-muted)] min-w-0 truncate">{label}{sub && <span className="opacity-60"> · {sub}</span>}</span>
        <span className="tabular-nums text-[var(--text)] whitespace-nowrap shrink-0">롱 <b>{longPct.toFixed(1)}%</b> · 숏 {(100 - longPct).toFixed(1)}%</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden">
        <div className="bg-emerald-500/70" style={{ width: `${longPct}%` }} />
        <div className="bg-red-500/70" style={{ width: `${100 - longPct}%` }} />
      </div>
    </div>
  );
}

export default function MultiExchangeDerivs({ symbol }: { symbol: string }) {
  const { data, error, isLoading } = useSWR<DerivsData>(`/api/coin/derivs?symbol=${symbol}`, fetcher, { refreshInterval: 60_000, revalidateOnFocus: false });
  const failed = data?.venues.filter((v) => !v.ok).map((v) => VENUE_LABEL[v.venue]) ?? [];
  const ls = data?.longShort;
  const gapText = crowdGapText(ls?.gapNow ?? null);

  return (
    <section className="fin-card p-4 sm:p-5" aria-label="거래소별 파생 수급">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-sm font-bold text-[var(--text)]">거래소별 파생 수급</h3>
        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">신호 아님</span>
        {data && <span className="ml-auto text-[10.5px] text-[var(--text-muted)] tabular-nums">{kst(data.asOf)} 기준 · 1분마다</span>}
      </div>

      {error && !data && <p className="text-[12px] text-[var(--text-muted)]">거래소 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도됩니다.</p>}
      {isLoading && !data && <p className="text-[12px] text-[var(--text-muted)]">5개 거래소 자료를 모으는 중…</p>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* ① OI 합계 + 4분면 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-[var(--text-muted)]">미결제약정(OI) 합계 · {data.venues.filter((v) => v.ok).length}개 거래소</p>
                <p className="text-[18px] font-bold tabular-nums text-[var(--text)] leading-tight">{usdB(data.oi.totalUsd)} <span className="text-[12px] font-normal text-[var(--text-muted)]">{coins(data.oi.totalCoins)} {data.base}</span></p>
              </div>
              <OiSpark series={data.oi.series} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <QuadTile title="지난 1시간" w={data.oi.h1} />
              <QuadTile title="지난 24시간" w={data.oi.h24} />
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)] leading-snug">
              OI 변화 = {data.oi.histVenues.map((v) => VENUE_LABEL[v]).join('·') || '–'} 합산 코인 수량(가격 효과 제외) · 선 그래프 실선 OI, 점선 가격(24시간).
              4분면은 지난 구간에 있었던 일의 흔한 해석이지 다음 방향이 아닙니다.
            </p>
          </div>

          {/* ② 펀딩·괴리 비교 */}
          <div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[11.5px] tabular-nums">
                <thead>
                  <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
                    <th className="text-left font-normal py-1">거래소</th>
                    <th className="font-normal">펀딩 8h 환산</th>
                    <th className="font-normal">연환산</th>
                    <th className="font-normal">괴리</th>
                    <th className="font-normal hidden sm:table-cell">OI</th>
                  </tr>
                </thead>
                <tbody>
                  {data.venues.map((v) => (
                    <tr key={v.venue} className="border-t border-[var(--border)] text-right">
                      <td className="text-left py-1.5 whitespace-nowrap">
                        <span className="text-[var(--text)]">{VENUE_LABEL[v.venue]}</span>
                        {v.ok && v.intervalH != null && v.intervalH !== 8 && <span className="block text-[9.5px] text-[var(--text-muted)] leading-none">{v.intervalH}시간 정산</span>}
                      </td>
                      {v.ok ? (
                        <>
                          <td className="text-[var(--text)]">{sgn(v.per8hPct, 4)}</td>
                          <td className={v.annualPct != null && v.annualPct < 0 ? 'text-[var(--down)]' : 'text-[var(--text)]'}>{sgn(v.annualPct, 1)}</td>
                          <td className="text-[var(--text-muted)]">{sgn(v.premiumPct, 2)}</td>
                          <td className="text-[var(--text-muted)] hidden sm:table-cell">{usdB(v.oiUsd)}</td>
                        </>
                      ) : <><td colSpan={3} className="text-[var(--text-muted)] text-center">불러오지 못함</td><td className="hidden sm:table-cell" /></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.funding.weightedAnnualPct != null && (
              <p className="text-[11.5px] text-[var(--text)] mt-2 leading-snug">
                OI 가중 평균 연 <b className="tabular-nums">{sgn(data.funding.weightedAnnualPct, 1)}</b>
                <span className="text-[var(--text-muted)]"> (기본값 연 {BASE_ANNUAL}% = 0.01%/8h)</span>
                {data.funding.spreadPct != null && data.funding.max && data.funding.min && (
                  <> · 최고 {VENUE_LABEL[data.funding.max.venue]} {sgn(data.funding.max.annualPct, 1)} / 최저 {VENUE_LABEL[data.funding.min.venue]} {sgn(data.funding.min.annualPct, 1)} <span className="text-[var(--text-muted)]">(차이 {data.funding.spreadPct.toFixed(1)}%p)</span></>
                )}
              </p>
            )}
            <p className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-snug">
              펀딩 양수 = 롱이 숏에게 지급(롱 쏠림). 정산 주기가 달라 8시간·연 단위로 맞춤. 괴리 = 마크가 − 현물 인덱스(무기한 베이시스). 거래소별 OI 금액은 넓은 화면에서.
            </p>
          </div>

          {/* ③ 롱숏 — 큰손 vs 전체 */}
          {ls && (ls.binanceGlobal != null || ls.bybit != null || ls.okx != null) && (
            <div className="lg:col-span-2 space-y-2 pt-3 border-t border-[var(--border)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <LsBar label="바이낸스 전체 계정" longPct={ls.binanceGlobal} />
                <LsBar label="바이낸스 상위 포지션" longPct={ls.binanceTopPos} sub="금액" />
                <LsBar label="바이낸스 상위 계정" longPct={ls.binanceTopAcc} />
                <LsBar label="바이비트 전체 계정" longPct={ls.bybit} />
                <LsBar label="OKX 전체 계정" longPct={ls.okx} />
              </div>
              {ls.gapNow != null && (
                <p className="text-[11.5px] text-[var(--text)] leading-snug">
                  상위 포지션 롱% − 전체 계정 롱% = <b className="tabular-nums">{sgn(ls.gapNow, 1, '%p')}</b>
                  {ls.gap24h != null && <span className="text-[var(--text-muted)] tabular-nums"> (24시간 전 {sgn(ls.gap24h, 1, '%p')})</span>}
                  {gapText && <> · {gapText}</>}
                </p>
              )}
              <p className="text-[10.5px] text-[var(--text-muted)] leading-snug">계정 비율은 사람 수(돈 아님). 상위 트레이더 = 증거금 상위 20% 계정(바이낸스 정의). 쏠림은 청산이 몰릴 쪽을 보여줄 뿐 방향 예측이 아닙니다.</p>
            </div>
          )}
        </div>
      )}
      {failed.length > 0 && <p className="text-[10.5px] text-[var(--text-muted)] mt-2">불러오지 못한 거래소: {failed.join(', ')} — 나머지로 계산했습니다.</p>}
    </section>
  );
}
