'use client';

/**
 * 자산 상관관계 행렬(참고: Finviz Elite·Koyfin correlation, Portfolio Visualizer) — 내 자산 화면.
 * 대상: 보유 국내주식(이 기기 보유 기록) + 열린 선물 포지션 코인 + 기준(코스피·S&P500·BTC). '관심 포함'이면 관심종목(국내·해외·코인)까지(최대 14개).
 * 계산: lib/correlation(테스트 고정) — 두 자산 모두 종가가 있는 날의 일간 수익률 피어슨 상관. 서버엔 종목 코드만 보낸다(수량·평단 X).
 * 해석: 0.7 이상 = 사실상 같은 베팅(분산 효과 작음), 음수 = 반대로 움직여 손실을 덜어 주는 조합. 과거 관계일 뿐 앞으로를 보장하지 않는다.
 */
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Segmented from '@/components/ui/Segmented';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useOverseasWatchlist } from '@/hooks/useOverseasWatchlist';
import { useCryptoWatchlist } from '@/hooks/useCryptoWatchlist';
import { strongPairs, avgCorr, corrLabel, type CorrMatrix } from '@/lib/correlation';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
type Scope = 'hold' | 'watch';
type Days = '90' | '180';
const MAX = 14;
const BENCH = [{ id: 'ix:KOSPI', label: '코스피' }, { id: 'ix:SP500', label: 'S&P 500' }, { id: 'cx:BTC', label: 'BTC' }];

interface Resp { days: number; assets: { id: string; label: string; ok: boolean; points: number; ret: number | null }[]; r: (number | null)[][]; n: number[][]; error?: string }

/** 상관 → 칸 색: 양(같이 움직임)=파랑 계열, 음(반대)=주황 계열. 상승·하락 색(빨강·파랑 손익)과 겹치지 않게 */
function cellBg(r: number | null) {
  if (r == null) return 'var(--surface-2)';
  const t = Math.min(1, Math.abs(r));
  return `color-mix(in srgb, ${r >= 0 ? 'var(--accent)' : 'var(--amber)'} ${Math.round(8 + t * 72)}%, var(--surface))`;
}

export default function CorrelationMatrix() {
  const { portfolio } = usePortfolio();
  const kr = useWatchlist();
  const ov = useOverseasWatchlist();
  const cr = useCryptoWatchlist();
  const [scope, setScope] = useState<Scope>('hold');
  const [days, setDays] = useState<Days>('90');
  // 열린 선물 포지션(잠금 해제 기기만 — 실패하면 조용히 빼고 진행)
  const { data: pos } = useSWR<{ positions?: { symbol: string }[] }>('/api/bitget/positions', fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });

  const picks = useMemo(() => {
    const out: { id: string; label: string; group: string }[] = [];
    const add = (id: string, label: string, group: string) => { if (!out.some((x) => x.id === id) && out.length < MAX) out.push({ id, label, group }); };
    const krName = (t: string) => kr.watchlist.find((w) => w.ticker === t)?.name ?? t;
    for (const t of Object.keys(portfolio).filter((t) => portfolio[t]?.quantity > 0).sort()) add(`kr:${t.replace(/\.(KS|KQ)$/, '')}`, krName(t), '보유');
    for (const p of pos?.positions ?? []) { const b = p.symbol.replace(/USDT$/i, '').toUpperCase(); if (b) add(`cx:${b}`, b, '포지션'); }
    for (const b of BENCH) add(b.id, b.label, '기준');
    if (scope === 'watch') {
      for (const w of kr.watchlist) add(`kr:${w.ticker.replace(/\.(KS|KQ)$/, '')}`, w.name, '관심');
      for (const w of ov.watchlist) add(`us:${w.symbol.toUpperCase()}`, w.name, '관심');
      for (const w of cr.watchlist) add(`cx:${w.base.toUpperCase()}`, w.base, '관심');
    }
    return out;
  }, [portfolio, pos, scope, kr.watchlist, ov.watchlist, cr.watchlist]);

  // 관심종목에 없는 보유 종목은 이름을 시세 일괄 API로(코드만 보인다)
  const unnamed = picks.filter((p) => p.id.startsWith('kr:') && p.label === p.id.slice(3)).map((p) => p.id.slice(3));
  const { data: names } = useSWR<Record<string, { name?: string }>>(unnamed.length ? `/api/stock/batch?tickers=${unnamed.join(',')}` : null, fetcher, { revalidateOnFocus: false });
  const key = picks.length >= 2 ? `/api/correlation?ids=${encodeURIComponent(picks.map((p) => p.id).join(','))}&days=${days}` : null;
  const { data, error } = useSWR<Resp>(key, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const label = (id: string) => (id.startsWith('kr:') ? names?.[id.slice(3)]?.name : undefined) ?? picks.find((p) => p.id === id)?.label ?? data?.assets.find((a) => a.id === id)?.label ?? id;
  const groupOf = (id: string) => picks.find((p) => p.id === id)?.group;
  const isBench = (id: string) => groupOf(id) === '기준';
  const mine = (id: string) => groupOf(id) === '보유' || groupOf(id) === '포지션';

  const m: CorrMatrix | null = data && !data.error ? { ids: data.assets.map((a) => a.id), r: data.r, n: data.n } : null;
  const allStrong = m ? strongPairs(m, 0.7) : [];
  // 종목끼리(기준 지수 제외) = 같은 베팅 · 내 보유 ↔ 기준 = 시장 민감도
  const strong = allStrong.filter((p) => !isBench(p.a) && !isBench(p.b));
  const market = allStrong.filter((p) => (isBench(p.a) && mine(p.b)) || (isBench(p.b) && mine(p.a)));
  const hedges = m ? (() => { const out: { a: string; b: string; r: number }[] = []; m.ids.forEach((a, i) => m.ids.forEach((b, j) => { const v = m.r[i][j]; if (j > i && v != null && v <= -0.2) out.push({ a, b, r: v }); })); return out.sort((x, y) => x.r - y.r).slice(0, 3); })() : [];
  const holdIdx = m ? m.ids.map((id, i) => (mine(id) ? i : -1)).filter((i) => i >= 0) : [];
  const holdAvg = m && holdIdx.length >= 2 ? avgCorr(m, holdIdx) : null;
  const failed = data?.assets?.filter((a) => !a.ok) ?? [];

  return (
    <div className="fin-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Segmented label="상관관계 대상" value={scope} options={[['hold', '보유·기준'], ['watch', '관심 포함']] as const} onChange={setScope} />
        <span className="ml-auto"><Segmented label="상관관계 기간" value={days} options={[['90', '90일'], ['180', '180일']] as const} onChange={setDays} /></span>
      </div>

      {picks.length < 2 ? (
        <p className="text-[12.5px] text-[var(--text-muted)] py-4 text-center">비교할 자산이 2개 이상 필요합니다.</p>
      ) : error || data?.error ? (
        <p className="text-[12.5px] text-[var(--text-muted)] py-4 text-center">가격 이력을 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>
      ) : !m ? <div className="skeleton" style={{ height: 220 }} /> : (
        <>
          {/* 요약 */}
          <div className="space-y-1.5 mb-3 text-[12.5px] leading-relaxed">
            {holdAvg != null && (
              <p className="text-[var(--text)]">보유·포지션끼리 평균 상관 <b className="tabular-nums text-[var(--ink)]">{holdAvg.toFixed(2)}</b> — {holdAvg >= 0.6 ? '한 덩어리로 움직이는 편이라 분산 효과가 작습니다.' : holdAvg >= 0.3 ? '어느 정도 같이 움직입니다.' : '서로 꽤 따로 움직여 분산이 되는 편입니다.'}</p>
            )}
            {strong.length > 0 ? (
              <p className="text-[var(--text)]"><b className="text-[var(--ink)]">사실상 같은 베팅</b>(0.7 이상): {strong.slice(0, 4).map((p) => `${label(p.a)}↔${label(p.b)} ${p.r.toFixed(2)}`).join(' · ')}</p>
            ) : <p className="text-[var(--text-muted)]">종목끼리 0.7 이상으로 강하게 같이 움직이는 쌍은 없습니다.</p>}
            {market.length > 0 && <p className="text-[var(--text)]"><b className="text-[var(--ink)]">시장과 거의 같이</b>: {market.slice(0, 4).map((p) => `${label(isBench(p.a) ? p.b : p.a)}(${label(isBench(p.a) ? p.a : p.b)} ${p.r.toFixed(2)})`).join(' · ')} — 지수가 빠지면 같이 빠지는 편</p>}
            {hedges.length > 0 && <p className="text-[var(--text)]"><b className="text-[var(--ink)]">반대로 움직인 쌍</b>: {hedges.map((p) => `${label(p.a)}↔${label(p.b)} ${p.r.toFixed(2)}`).join(' · ')}</p>}
          </div>

          {/* 행렬 */}
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="text-[11px] tabular-nums border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] bg-[var(--surface)]" />
                  {m.ids.map((id) => <th key={id} className="font-medium text-[var(--text-muted)] px-0.5 align-bottom"><span className="block max-w-[52px] truncate mx-auto" title={label(id)}>{label(id)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {m.ids.map((a, i) => (
                  <tr key={a}>
                    <th className="sticky left-0 z-[1] bg-[var(--surface)] text-left font-medium pr-1.5 whitespace-nowrap max-w-[96px] truncate" title={label(a)} style={{ color: isBench(a) ? 'var(--text-muted)' : 'var(--ink)' }}>
                      {mine(a) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] mr-1 align-middle" aria-label="보유" />}{label(a)}
                    </th>
                    {m.ids.map((b, j) => {
                      const v = m.r[i][j];
                      return (
                        <td key={b} className="text-center rounded-[4px] w-[44px] min-w-[40px] h-[30px]" style={{ background: i === j ? 'var(--surface-2)' : cellBg(v), color: 'var(--ink)' }}
                          title={i === j ? label(a) : `${label(a)} ↔ ${label(b)}: ${v == null ? '자료 부족' : v.toFixed(2)} (${corrLabel(v)}, 공통 ${m.n[i][j]}일)`}>
                          {i === j ? '—' : v == null ? '·' : v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10.5px] text-[var(--text-muted)]">
            <span>−1 반대</span>
            <span className="inline-block w-24 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, var(--amber), var(--surface-2), var(--accent))' }} aria-hidden />
            <span>+1 같이</span>
            <span className="ml-auto flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)]" aria-hidden />보유·포지션</span>
          </div>
          {failed.length > 0 && <p className="text-[11px] text-[var(--text-muted)] mt-1.5">가격 이력을 못 받은 자산: {failed.map((a) => label(a.id)).join(', ')}</p>}
        </>
      )}
      <p className="text-[10.5px] text-[var(--faint)] mt-2 leading-relaxed">
        최근 {days}일 일간 수익률 상관(두 자산 모두 거래한 날 기준). 한국·미국은 장 마감 시각이 달라 같은 날짜 비교 시 상관이 낮게 나올 수 있습니다. 과거 관계이며 앞으로도 같다는 보장은 없습니다.
        {Object.keys(portfolio).length === 0 && <> 보유 종목은 <Link href="/my-stocks" className="underline">내 종목</Link>에서 수량·평단을 넣으면 들어갑니다.</>}
      </p>
    </div>
  );
}
