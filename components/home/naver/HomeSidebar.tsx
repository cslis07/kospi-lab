'use client';

/**
 * 홈 우측 사이드바 — 최근 소식(뉴스 상위) + 인기|관심 종목 탭.
 * 인기 = /api/home/status.popular(KRX 거래대금 상위) · 관심 = watchlist + /api/stock/batch 실시간가.
 * 종목 클릭 → 상세. 색: 상승 빨강 · 하락 파랑.
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useWatchlist } from '@/hooks/useWatchlist';

interface PopularItem { code: string; name: string; price: number; changeRate: number }
interface StatusResp { popular: PopularItem[] }
interface NewsItem { title: string; link: string; source: string; pubDate?: string }
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
    <Link href={href} className="wl-row" style={{ padding: '10px 4px', textDecoration: 'none', color: 'inherit' }}>
      <Badge name={name} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--faint)' }}>{code}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="tabular-nums" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{price ? price.toLocaleString('ko-KR') : '—'}</div>
        <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: colorOf(changeRate) }}>{changeRate >= 0 ? '+' : ''}{changeRate.toFixed(2)}%</div>
      </div>
    </Link>
  );
}

function RecentNews() {
  const { data } = useSWR<NewsItem[]>('/api/news?category=domestic', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const items = (data ?? []).slice(0, 5);
  return (
    <div className="fin-card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>최근 소식</h3>
        <Link href="/news" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>더보기 →</Link>
      </div>
      {items.length === 0 ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
              style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line-2)' : 'none', textDecoration: 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 3 }}>{n.source}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StockTabs() {
  const [tab, setTab] = useState<'popular' | 'watch'>('popular');
  const { data: st } = useSWR<StatusResp>('/api/home/status', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
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

  const popular = st?.popular ?? [];

  return (
    <div className="fin-card" style={{ padding: '14px 14px 6px' }}>
      <div style={{ display: 'flex', gap: 16, padding: '0 4px 10px', borderBottom: '1px solid var(--line-2)' }}>
        {([['popular', '인기'], ['watch', '관심']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: tab === k ? 'var(--ink)' : 'var(--faint)', borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent' }}>
            {lbl}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--faint)', alignSelf: 'center' }}>{tab === 'popular' ? '거래대금 상위' : ''}</span>
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
              : watchlist.map((w) => {
                  const b = priceOf(w.ticker);
                  return <StockRow key={w.ticker} code={w.ticker} name={w.name} price={b?.price ?? 0} changeRate={b?.changeRate ?? 0} href={`/stock/${w.ticker}`} />;
                })
        )}
      </div>
    </div>
  );
}

export default function HomeSidebar() {
  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RecentNews />
      <StockTabs />
    </aside>
  );
}
