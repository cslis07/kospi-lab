'use client';

/**
 * 홈 인기|관심 종목 탭(StockTabs) — 2.0 홈 '관심종목' 카드. (최근 소식은 홈 '발견' 탭 뉴스로 옮김)
 * 인기 = /api/home/status.popular(네이버 실시간 인기 = 조회 많은 순, 20초 갱신 · 실패 시 KRX 전 거래일 거래대금) · 관심 = watchlist + /api/stock/batch 실시간가.
 * 종목 클릭 → 상세. 색: 상승 빨강 · 하락 파랑.
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useWatchlist } from '@/hooks/useWatchlist';
import { Flash, LiveStamp } from '@/components/naver/ui';

interface PopularItem { code: string; name: string; price: number; changeRate: number }
interface StatusResp { popular: PopularItem[]; date?: string; source?: 'naver' | 'krx'; asOf?: string }

interface BatchItem { ticker: string; name: string; price: number; changeRate: number }

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

function Badge({ name }: { name: string }) {
  const ch = (name || '?').trim().charAt(0);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: `hsl(${hue} 45% 45%)` }}>{ch}</span>
  );
}

function StockRow({ code, name, price, changeRate, href }: { code: string; name: string; price: number; changeRate: number; href: string }) {
  return (
    <Link prefetch={false} href={href} className="wl-row" style={{ padding: '10px 4px', textDecoration: 'none', color: 'inherit' }}>
      <Badge name={name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--faint)' }}>{code}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="tabular-nums" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{price ? <Flash value={price}>{price.toLocaleString('ko-KR')}</Flash> : '—'}</div>
        <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: colorOf(changeRate) }}>{changeRate >= 0 ? '+' : ''}{changeRate.toFixed(2)}%</div>
      </div>
    </Link>
  );
}

/** 인기 | 관심 종목 탭 — 2.0 홈 '관심종목' 카드도 이걸 쓴다(initial='watch', limit 행 수) */
export function StockTabs({ initial = 'popular', limit }: { initial?: 'popular' | 'watch'; limit?: number }) {
  const [tab, setTab] = useState<'popular' | 'watch'>(initial);
  const { data: st } = useSWR<StatusResp>('/api/home/status', fetcher, { refreshInterval: tab === 'popular' ? 20000 : 0, revalidateOnFocus: false, keepPreviousData: true });
  const { watchlist, mounted } = useWatchlist();
  const tickers = watchlist.map((w) => w.ticker).join(',');
  const { data: batch } = useSWR<BatchItem[] | Record<string, BatchItem>>(
    tab === 'watch' && tickers ? `/api/stock/batch?tickers=${tickers}` : null, fetcher, { refreshInterval: 30000, revalidateOnFocus: false },
  );
  const priceOf = (t: string): BatchItem | undefined => {
    if (!batch) return undefined;
    if (Array.isArray(batch)) return batch.find((b) => b.ticker === t);
    return (batch as Record<string, BatchItem>)[t];
  };

  const popular = (st?.popular ?? []).slice(0, limit ?? 99);

  return (
    <div className="fin-card h-full" style={{ padding: '14px 14px 6px' }}>
      <div style={{ display: 'flex', gap: 16, padding: '0 4px 10px', borderBottom: '1px solid var(--line-2)' }}>
        {([['popular', '인기'], ['watch', '관심']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: tab === k ? 'var(--ink)' : 'var(--faint)', borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent' }}>
            {lbl}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--faint)', alignSelf: 'center' }}>
          {tab !== 'popular' ? '실시간'
            : st?.source === 'naver' ? <span title="네이버 증권 실시간 인기 종목(조회 많은 순)">조회 많은 순 <LiveStamp asOf={st.asOf} every={20} /></span>
            : `${st?.date && st.date.length === 8 ? `${st.date.slice(4, 6)}.${st.date.slice(6, 8)} ` : ''}거래대금 상위`}
        </span>
      </div>
      <div>
        {tab === 'popular' ? (
          popular.length === 0
            ? <div className="skeleton" style={{ height: 200, margin: '10px 0', borderRadius: 10 }} />
            : popular.map((p) => <StockRow key={p.code} code={p.code} name={p.name} price={p.price} changeRate={p.changeRate} href={`/stock/${p.code}`} />)
        ) : (
          !mounted
            ? <div className="skeleton" style={{ height: 120, margin: '10px 0', borderRadius: 10 }} />
            : watchlist.length === 0
              ? <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>관심종목이 없습니다.</div>
              : watchlist.slice(0, limit ?? 99).map((w) => {
                  const b = priceOf(w.ticker);
                  return <StockRow key={w.ticker} code={w.ticker} name={w.name} price={b?.price ?? 0} changeRate={b?.changeRate ?? 0} href={`/stock/${w.ticker}`} />;
                })
        )}
      </div>
    </div>
  );
}
