'use client';

/**
 * 산업 트렌드 섹션 — /industry 페이지와 홈(PC) 공용.
 * 국내(업종·테마) / 미국(섹터) × 일간·주간·월간 등락률 순위. 카드 = 순위·등락률·상승/보합/하락 막대·상승률 TOP3.
 * home=true: 1~3위만, '순위 더보기' 대신 '전체보기 →' 링크. 데이터 /api/naver/industry.
 */
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, colorOf, signPct, Badge, Change, Seg, SectionTitle, SourceNote, Empty, StockLink, fmtUsd, MoreLink } from '@/components/naver/ui';

interface TrendStock { code: string; name: string; logo?: string; price: number; change: number; changeRate: number }
interface TrendCard { rank: number; code: string; name: string; changeRate: number; rising: number; flat: number; falling: number; stocks: TrendStock[] }
interface Resp { market: 'kr' | 'us'; cat: string; period: string; cards: TrendCard[] }

type Market = 'kr' | 'us';
type Cat = 'industries' | 'themes';
type Period = 'daily' | 'weekly' | 'monthly';

function Bar({ rising, flat, falling }: { rising: number; flat: number; falling: number }) {
  const t = rising + flat + falling || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 6, borderRadius: 99, overflow: 'hidden', gap: 2, background: 'var(--surface-2)' }}>
        <div style={{ width: `${(rising / t) * 100}%`, background: 'var(--warn)' }} />
        {flat > 0 && <div style={{ width: `${(flat / t) * 100}%`, background: 'var(--faint)', opacity: 0.5 }} />}
        <div style={{ width: `${(falling / t) * 100}%`, background: 'var(--accent)' }} />
      </div>
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12.5, fontWeight: 700 }}>
        <span style={{ color: 'var(--warn)' }}>상승 {rising}</span>
        <span><span style={{ color: 'var(--faint)', marginRight: 10 }}>보합 {flat}</span><span style={{ color: 'var(--accent)' }}>하락 {falling}</span></span>
      </div>
    </div>
  );
}

function Card({ c, market }: { c: TrendCard; market: Market }) {
  return (
    <div className="fin-card" style={{ padding: 18, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 제목 줄은 한 줄 고정(긴 업종명은 말줄임) — 카드 높이가 제각각 되지 않게 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap', minWidth: 0 }}>
        {c.rank === 1 && <span aria-hidden>🔥</span>}
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', flexShrink: 0 }}>{c.rank}위</span>
        <span title={c.name} style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
        <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: colorOf(c.changeRate), flexShrink: 0 }}>{signPct(c.changeRate)}</span>
      </div>
      <div style={{ marginTop: 12 }}><Bar rising={c.rising} flat={c.flat} falling={c.falling} /></div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', margin: '16px 0 4px' }}>상승률 TOP</div>
      {c.stocks.length === 0 ? <Empty text="종목 정보 없음" /> : c.stocks.map((s) => (
        <div key={s.code} className="nv-it-row">
          <StockLink href={market === 'kr' ? `/stock/${s.code}` : `/overseas/${encodeURIComponent(s.code)}`}>
            <Badge name={s.name} logo={s.logo} size={32} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          </StockLink>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              {s.price ? (market === 'us' ? fmtUsd(s.price) : s.price.toLocaleString()) : '—'}
            </div>
            <Change change={s.price ? s.change : undefined} rate={s.changeRate} currency={market === 'us' ? 'USD' : 'KRW'} small />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function IndustrySection({ home = false }: { home?: boolean }) {
  const [market, setMarket] = useState<Market>('kr');
  const [cat, setCat] = useState<Cat>('industries');
  const [period, setPeriod] = useState<Period>('daily');
  const [size, setSize] = useState(home ? 3 : 6);
  const key = `/api/naver/industry?market=${market}&cat=${cat}&period=${period}&size=${size}`;
  const { data, error, isLoading } = useSWR<Resp>(key, fetcher, { refreshInterval: 60000, keepPreviousData: true });
  const cards = data?.cards ?? [];

  return (
    <div>
      <SectionTitle big={home} title="산업 트렌드" sub={market === 'kr' ? '국내 업종·테마 등락률 순위' : '미국 섹터 등락률 순위'}
        right={<>
          <Seg<Period> value={period} onChange={setPeriod} options={[['daily', '일간'], ['weekly', '주간'], ['monthly', '월간']]} />
          {home && <MoreLink href="/industry" />}
        </>} />
      <div className="nv-chips" style={{ marginBottom: 14 }}>
        <Seg<Market> value={market} onChange={(v) => { setMarket(v); setSize(home ? 3 : 6); }} options={[['kr', '국내'], ['us', '미국']]} />
        {market === 'kr' && <Seg<Cat> value={cat} onChange={setCat} options={[['industries', '업종'], ['themes', '테마']]} />}
      </div>

      {error ? <div className="fin-card"><Empty /></div> : (
        <div className="nv-it-grid">
          {(isLoading && !cards.length ? Array.from({ length: home ? 3 : 6 }) : cards).map((c, i) =>
            c ? <Card key={(c as TrendCard).code} c={c as TrendCard} market={market} /> : <div key={i} className="skeleton" style={{ height: 300, borderRadius: 'var(--r)' }} />)}
        </div>
      )}
      {!home && cards.length > 0 && size < 18 && (
        <button type="button" className="kl-ghost" onClick={() => setSize((s) => s + 6)} style={{ width: '100%', marginTop: 14, padding: '11px 0', fontSize: 13.5 }}>
          순위 더보기
        </button>
      )}
      {!home && <SourceNote>출처: 네이버페이 증권(업종·테마·섹터 분류와 등락률). {period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 등락률 기준 순위이며, 시장 흐름 참고용일 뿐 매수·매도 신호가 아닙니다.</SourceNote>}
    </div>
  );
}
