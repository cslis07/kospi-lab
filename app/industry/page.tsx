'use client';

/**
 * 산업 트렌드 — 네이버 증권 홈 '산업 트렌드' 위젯의 전체 화면판.
 * 국내(업종·테마) / 미국(섹터) × 일간·주간·월간 등락률 순위. 카드 = 순위·등락률·상승/보합/하락 막대·상승률 TOP3.
 * 데이터 /api/naver/industry (stock.naver.com rankings/v2). 매수·매도 신호가 아닌 시장 흐름 참고.
 */
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, colorOf, signPct, Badge, Change, Seg, SectionTitle, SourceNote, Empty, StockLink, fmtUsd } from '@/components/naver/ui';

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
    <div className="fin-card" style={{ padding: 18, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {c.rank === 1 && <span aria-hidden>🔥</span>}
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{c.rank}위</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{c.name}</span>
        <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: colorOf(c.changeRate) }}>{signPct(c.changeRate)}</span>
      </div>
      <div style={{ marginTop: 12 }}><Bar rising={c.rising} flat={c.flat} falling={c.falling} /></div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', margin: '16px 0 4px' }}>상승률 TOP</div>
      {c.stocks.length === 0 ? <Empty text="종목 정보 없음" /> : c.stocks.map((s) => (
        <div key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line-2)' }}>
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

export default function IndustryPage() {
  const [market, setMarket] = useState<Market>('kr');
  const [cat, setCat] = useState<Cat>('industries');
  const [period, setPeriod] = useState<Period>('daily');
  const [size, setSize] = useState(6);
  const key = `/api/naver/industry?market=${market}&cat=${cat}&period=${period}&size=${size}`;
  const { data, error, isLoading } = useSWR<Resp>(key, fetcher, { refreshInterval: 60000, keepPreviousData: true });
  const cards = data?.cards ?? [];

  return (
    <div style={{ paddingBottom: 24 }}>
      <SectionTitle title="산업 트렌드" sub={market === 'kr' ? '국내 업종·테마 등락률 순위' : '미국 섹터 등락률 순위'}
        right={<Seg<Period> value={period} onChange={setPeriod} options={[['daily', '일간'], ['weekly', '주간'], ['monthly', '월간']]} />} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Seg<Market> value={market} onChange={(v) => { setMarket(v); setSize(6); }} options={[['kr', '국내'], ['us', '미국']]} />
        {market === 'kr' && <Seg<Cat> value={cat} onChange={setCat} options={[['industries', '업종'], ['themes', '테마']]} />}
      </div>

      {error ? <div className="fin-card"><Empty /></div> : (
        <div className="it-grid">
          {(isLoading && !cards.length ? Array.from({ length: 6 }) : cards).map((c, i) =>
            c ? <Card key={(c as TrendCard).code} c={c as TrendCard} market={market} /> : <div key={i} className="skeleton" style={{ height: 300, borderRadius: 'var(--r)' }} />)}
        </div>
      )}
      {cards.length > 0 && size < 18 && (
        <button type="button" className="kl-ghost" onClick={() => setSize((s) => s + 6)} style={{ width: '100%', marginTop: 14, padding: '11px 0', fontSize: 13.5 }}>
          순위 더보기
        </button>
      )}
      <SourceNote>출처: 네이버페이 증권(업종·테마·섹터 분류와 등락률). {period === 'daily' ? '일간' : period === 'weekly' ? '주간' : '월간'} 등락률 기준 순위이며, 시장 흐름 참고용일 뿐 매수·매도 신호가 아닙니다.</SourceNote>

      <style jsx>{`
        .it-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 1023px) { .it-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) { .it-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
