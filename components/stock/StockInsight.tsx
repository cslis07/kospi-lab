'use client';

/**
 * 종목 상세 추가 섹션 — 투자 지표·목표주가 컨센서스 / 동종업계 비교 / 최근 리포트 / 수급 20일(외국인 보유율 추이).
 * 참고: 네이버페이 증권 종목 홈·토스증권 애널리스트 의견·인베스팅 동종업계·네이버 외국인·기관 매매동향.
 * 데이터 = /api/stock/[code]/insight(네이버 integration 1회) · /api/stock/[code]/investor?days=20. 없으면 카드째 숨김.
 * 목표주가·투자의견은 증권사 의견 평균일 뿐 매수·매도 신호가 아니다(문구로 고지).
 */
import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import Collapsible from '@/components/ui/Collapsible';
import Segmented from '@/components/ui/Segmented';
import { opinionLabel, upsidePct, type StockInsight, type OverseasInsight } from '@/lib/stockInsight';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const UP = 'var(--up)';
const DOWN = 'var(--down)';
const won = (n: number) => new Intl.NumberFormat('ko-KR').format(Math.round(n));
const signedPct = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`;
const toneOf = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : 'var(--text-muted)');
const eok = (n: number) => (n >= 10000 ? `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}조` : `${n.toLocaleString('ko-KR')}억`);
function vol(n: number) {
  const a = Math.abs(n);
  if (a >= 1e8) return `${(a / 1e8).toFixed(1)}억`;
  if (a >= 1e4) return `${(a / 1e4).toFixed(1)}만`;
  return a.toLocaleString('ko-KR');
}

export function useStockInsight(code: string) {
  return useSWR<StockInsight & { error?: string }>(`/api/stock/${code}/insight`, fetcher, { revalidateOnFocus: false });
}

/* ── 투자 지표 + 목표주가 컨센서스 ─────────────────────── */
export function ValuationSection({ code, price }: { code: string; price: number }) {
  const { data } = useStockInsight(code);
  if (!data || data.error || (!data.metrics?.length && !data.consensus)) return null;
  const c = data.consensus;
  const up = upsidePct(c?.targetMean ?? null, price);
  const op = opinionLabel(c?.recommMean ?? null);
  // 1~5 척도 위치(막대) — 1 매도 · 3 중립 · 5 매수
  const pos = c?.recommMean ? Math.min(100, Math.max(0, ((c.recommMean - 1) / 4) * 100)) : null;
  return (
    <Collapsible title="투자 지표 · 목표주가" sub="네이버페이 증권" defaultOpen>
      {c && (c.targetMean || op) && (
        <div className="rounded-xl bg-[var(--surface-2)] p-3.5 mb-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11.5px] text-[var(--text-muted)]">증권사 평균 목표주가</p>
              <p className="text-[20px] font-extrabold tabular-nums text-[var(--ink)]">{c.targetMean ? `${won(c.targetMean)}원` : '—'}</p>
            </div>
            {up != null && (
              <div className="text-right">
                <p className="text-[11.5px] text-[var(--text-muted)]">현재가 대비</p>
                <p className="text-[16px] font-bold tabular-nums" style={{ color: toneOf(up) }}>{signedPct(up, 1)}</p>
              </div>
            )}
          </div>
          {pos != null && (
            <div className="mt-3">
              <div className="flex justify-between text-[10.5px] text-[var(--faint)]"><span>매도</span><span>중립</span><span>매수</span></div>
              <div className="relative h-1.5 rounded-full mt-1" style={{ background: `linear-gradient(90deg, ${DOWN}, var(--line) 50%, ${UP})` }} aria-hidden>
                <span className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-[var(--surface)]" style={{ left: `calc(${pos}% - 6px)`, transform: 'translateY(-50%)', background: 'var(--ink)' }} />
              </div>
              <p className="text-[12px] mt-1.5 text-[var(--text)]">투자의견 평균 <b>{c.recommMean?.toFixed(2)}</b> / 5 {op && <span className="text-[var(--text-muted)]">({op})</span>}</p>
            </div>
          )}
          <p className="text-[10.5px] text-[var(--faint)] mt-2">증권사 의견 평균{c.date ? ` · ${c.date} 기준` : ''}. 목표주가는 예측이며 매수·매도 신호가 아닙니다.</p>
        </div>
      )}
      {data.metrics.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {data.metrics.map((m) => (
            <div key={m.key} className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
              <dt className="text-[11px] text-[var(--text-muted)]">{m.label}</dt>
              <dd className="text-[13.5px] font-bold tabular-nums text-[var(--ink)] mt-0.5">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {data.metrics.some((m) => m.key === 'cnsPer') && (
        <p className="text-[10.5px] text-[var(--faint)] mt-2">추정 PER·EPS = 증권사 올해 실적 추정치 기준. 업종마다 적정 수준이 달라 같은 업종끼리 비교하세요.</p>
      )}
    </Collapsible>
  );
}

/* ── 동종업계 비교 ──────────────────────────────────── */
export function PeersSection({ code }: { code: string }) {
  const { data } = useStockInsight(code);
  if (!data || data.error || !data.peers?.length) return null;
  return (
    <Collapsible title="동종업계 비교" sub={`같은 업종 ${data.peers.length}종목`}>
      <div className="-mx-1">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-1 pb-1.5 text-[11px] text-[var(--text-muted)] border-b border-[var(--line-2)]">
          <span>종목</span><span className="text-right">현재가</span><span className="text-right w-[64px]">시가총액</span>
        </div>
        {data.peers.map((p) => (
          <Link key={p.code} href={`/stock/${p.code}`} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-1 py-2 border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--bg-card-hover)] rounded-md">
            <span className="min-w-0">
              <span className="block text-[13px] text-[var(--ink)] truncate">{p.name}</span>
              <span className="block text-[10.5px] text-[var(--faint)]">{p.code}{p.market ? ` · ${p.market}` : ''}</span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block text-[13px] text-[var(--ink)]">{won(p.price)}</span>
              <span className="block text-[11px] font-semibold" style={{ color: toneOf(p.changeRate) }}>{signedPct(p.changeRate)}</span>
            </span>
            <span className="text-right text-[12px] tabular-nums text-[var(--text)] w-[64px]">{p.marketCapEok != null ? eok(p.marketCapEok) : '—'}</span>
          </Link>
        ))}
      </div>
      <p className="text-[10.5px] text-[var(--faint)] mt-2">네이버 업종 분류 기준 비교 종목.</p>
    </Collapsible>
  );
}

/* ── 최근 리포트 ───────────────────────────────────── */
export function ReportsSection({ code }: { code: string }) {
  const { data } = useStockInsight(code);
  if (!data || data.error || !data.reports?.length) return null;
  return (
    <Collapsible title="증권사 리포트" sub={`최근 ${data.reports.length}건`}>
      <ul>
        {data.reports.map((r) => (
          <li key={r.id}>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="block py-2.5 border-b border-[var(--line-2)] last:border-0 hover:opacity-80">
              <span className="block text-[13px] text-[var(--ink)] leading-snug">{r.title}</span>
              <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{r.broker} · {r.date}</span>
            </a>
          </li>
        ))}
      </ul>
      <Link href="/research" className="dash-more block mt-2 !ml-0">리서치 전체 →</Link>
    </Collapsible>
  );
}

/* ── 투자자별 수급(오늘 · 5일 · 20일 누적) + 외국인 보유율 추이 ── */
interface FlowRow { date: string; individual: number; foreign: number; institution: number; foreignHoldRatio: number | null; close: number }
type Span = 'd1' | 'd5' | 'd20';
const SPANS: readonly (readonly [Span, string])[] = [['d1', '오늘'], ['d5', '5일'], ['d20', '20일']];

function HoldSpark({ rows }: { rows: FlowRow[] }) {
  const pts = rows.filter((r) => r.foreignHoldRatio != null).slice().reverse(); // 과거 → 최근
  if (pts.length < 2) return null;
  const vs = pts.map((r) => r.foreignHoldRatio as number);
  const min = Math.min(...vs), max = Math.max(...vs), rng = max - min || 1;
  const W = 300, H = 48;
  const d = vs.map((v, i) => `${i ? 'L' : 'M'}${((i / (vs.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / rng) * (H - 8)).toFixed(1)}`).join(' ');
  const delta = vs[vs.length - 1] - vs[0];
  return (
    <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-[var(--text-muted)]">외국인 보유율 · {pts.length}거래일</span>
        <span className="text-[13px] tabular-nums">
          <b className="text-[var(--ink)]">{vs[vs.length - 1].toFixed(2)}%</b>
          <span className="ml-1.5 text-[11.5px] font-semibold" style={{ color: toneOf(delta) }}>{delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta).toFixed(2)}%p</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12 mt-1" preserveAspectRatio="none" role="img" aria-label={`외국인 보유율 ${vs[0].toFixed(2)}%에서 ${vs[vs.length - 1].toFixed(2)}%로`}>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[10.5px] text-[var(--faint)] tabular-nums"><span>{pts[0].date}</span><span>{pts[pts.length - 1].date}</span></div>
    </div>
  );
}

export function FlowSection({ code }: { code: string }) {
  const { data, error } = useSWR<FlowRow[] | { error: string }>(`/api/stock/${code}/investor?days=20`, fetcher, { refreshInterval: 60000 });
  const [span, setSpan] = useState<Span>('d1');
  if (error || !data || !Array.isArray(data) || !data.length) return null;
  const n = span === 'd1' ? 1 : span === 'd5' ? 5 : 20;
  const rows = data.slice(0, n);
  const sum = (k: 'individual' | 'foreign' | 'institution') => rows.reduce((a, r) => a + r[k], 0);
  const items = [
    { label: '개인', value: sum('individual') },
    { label: '외국인', value: sum('foreign') },
    { label: '기관', value: sum('institution') },
  ];
  return (
    <Collapsible title="투자자별 수급" sub={`순매수 주식 수 · ${data[0].date} 기준`} defaultOpen>
      <div className="mb-3"><Segmented label="수급 기간" value={span} options={SPANS} onChange={setSpan} /></div>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value }) => (
          <div key={label} className="text-center p-3 rounded-xl bg-[var(--surface-2)]">
            <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
            <p className="font-bold text-sm tabular-nums" style={{ color: toneOf(value) }}>{value > 0 ? '+' : value < 0 ? '−' : ''}{vol(value)}</p>
          </div>
        ))}
      </div>
      {span !== 'd1' && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums">
            <thead><tr className="text-[var(--text-muted)] text-[11px]"><th className="text-left font-medium py-1">날짜</th><th className="text-right font-medium">종가</th><th className="text-right font-medium">개인</th><th className="text-right font-medium">외국인</th><th className="text-right font-medium">기관</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-t border-[var(--line-2)]">
                  <td className="py-1.5 text-[var(--text-muted)] whitespace-nowrap">{r.date.slice(5)}</td>
                  <td className="text-right text-[var(--ink)]">{won(r.close)}</td>
                  {([r.individual, r.foreign, r.institution]).map((v, i) => <td key={i} className="text-right" style={{ color: toneOf(v) }}>{v > 0 ? '+' : v < 0 ? '−' : ''}{vol(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <HoldSpark rows={data} />
    </Collapsible>
  );
}

/* ── 해외 종목: 애널리스트 목표주가(최저~최고 범위) · 기업 개요 · 동종업계 ── */
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const usdCap = (n: number) => (n >= 1e12 ? `$${(n / 1e12).toFixed(2)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`);

export function OverseasInsightSections({ symbol, price }: { symbol: string; price: number | null }) {
  const { data } = useSWR<OverseasInsight & { error?: string }>(`/api/overseas/insight?symbol=${encodeURIComponent(symbol)}`, fetcher, { revalidateOnFocus: false });
  if (!data || data.error) return null;
  const c = data.consensus;
  const up = upsidePct(c?.targetMean ?? null, price);
  const op = opinionLabel(c?.recommMean ?? null);
  // 목표가 범위 막대: 최저~최고 안에서 평균·현재가 위치
  const lo = c?.targetLow ?? null, hi = c?.targetHigh ?? null;
  const span = lo != null && hi != null && hi > lo ? [Math.min(lo, price ?? lo), Math.max(hi, price ?? hi)] : null;
  const at = (v: number) => (span ? ((v - span[0]) / (span[1] - span[0])) * 100 : 0);
  return (
    <>
      {c && (
        <Collapsible title="애널리스트 목표주가" sub="네이버페이 증권" defaultOpen>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11.5px] text-[var(--text-muted)]">평균 목표주가</p>
              <p className="text-[20px] font-extrabold tabular-nums text-[var(--ink)]">{c.targetMean ? usd(c.targetMean) : '—'}</p>
            </div>
            {up != null && (
              <div className="text-right">
                <p className="text-[11.5px] text-[var(--text-muted)]">현재가 대비</p>
                <p className="text-[16px] font-bold tabular-nums" style={{ color: toneOf(up) }}>{signedPct(up, 1)}</p>
              </div>
            )}
          </div>
          {span && lo != null && hi != null && (
            <div className="mt-4 mb-1">
              <div className="relative h-2 rounded-full bg-[var(--surface-2)]" aria-hidden>
                <span className="absolute h-full rounded-full" style={{ left: `${at(lo)}%`, width: `${at(hi) - at(lo)}%`, background: 'var(--accent-soft)' }} />
                {c.targetMean && <span className="absolute top-1/2 w-1 h-4 rounded" style={{ left: `calc(${at(c.targetMean)}% - 2px)`, transform: 'translateY(-50%)', background: 'var(--accent)' }} />}
                {price != null && <span className="absolute top-1/2 w-3 h-3 rounded-full border-2 border-[var(--surface)]" style={{ left: `calc(${at(price)}% - 6px)`, transform: 'translateY(-50%)', background: 'var(--ink)' }} />}
              </div>
              <div className="flex justify-between text-[11px] tabular-nums text-[var(--text-muted)] mt-1.5">
                <span>최저 {usd(lo)}</span><span className="text-[var(--ink)]">● 현재가 · <span style={{ color: 'var(--accent)' }}>▮</span> 평균</span><span>최고 {usd(hi)}</span>
              </div>
            </div>
          )}
          {op && <p className="text-[12px] mt-2 text-[var(--text)]">투자의견 평균 <b>{c.recommMean?.toFixed(2)}</b> / 5 <span className="text-[var(--text-muted)]">({op})</span></p>}
          <p className="text-[10.5px] text-[var(--faint)] mt-2">애널리스트 의견 평균{c.date ? ` · ${c.date} 기준` : ''}. 목표주가는 예측이며 매수·매도 신호가 아닙니다.</p>
        </Collapsible>
      )}
      {data.overview && (
        <Collapsible title="기업 개요" sub="네이버페이 증권">
          <p className="text-[13px] leading-relaxed text-[var(--text)]">{data.overview}</p>
        </Collapsible>
      )}
      {data.peers.length > 0 && (
        <Collapsible title="동종업계 비교" sub={`같은 업종 ${data.peers.length}종목`}>
          <div className="-mx-1">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-1 pb-1.5 text-[11px] text-[var(--text-muted)] border-b border-[var(--line-2)]">
              <span>종목</span><span className="text-right">현재가</span><span className="text-right w-[64px]">시가총액</span>
            </div>
            {data.peers.map((p) => (
              <Link key={p.symbol} href={`/overseas/${encodeURIComponent(p.symbol)}`} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-1 py-2 border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--bg-card-hover)] rounded-md">
                <span className="min-w-0">
                  <span className="block text-[13px] text-[var(--ink)] truncate">{p.name}</span>
                  <span className="block text-[10.5px] text-[var(--faint)]">{p.symbol}{p.dividendYield ? ` · 배당 ${p.dividendYield.toFixed(2)}%` : ''}</span>
                </span>
                <span className="text-right tabular-nums">
                  <span className="block text-[13px] text-[var(--ink)]">{usd(p.price)}</span>
                  <span className="block text-[11px] font-semibold" style={{ color: toneOf(p.changeRate) }}>{signedPct(p.changeRate)}</span>
                </span>
                <span className="text-right text-[12px] tabular-nums text-[var(--text)] w-[64px]">{p.marketCapUsd ? usdCap(p.marketCapUsd) : '—'}</span>
              </Link>
            ))}
          </div>
        </Collapsible>
      )}
    </>
  );
}
