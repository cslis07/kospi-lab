'use client';

/**
 * 실시간 랭킹 — 네이버 증권 홈 '실시간 랭킹'의 전체 화면판.
 * 탭: 거래대금 상위 · 인기 종목 · 상승 · 하락 · 시가총액 · 거래량 상위 × 4열(국내 주식 · 미국 주식 · 국내 ETF · 가상자산[업비트/빗썸]).
 * 20초마다 갱신. 가상자산 '인기'는 네이버에 없어 거래대금 상위로 대신한다(표기).
 */
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, colorOf, Change, Seg, SectionTitle, SourceNote, Empty, StockLink, fmtKrw, fmtUsdBig, fmtCount, fmtUsd } from '@/components/naver/ui';

type Tab = 'value' | 'popular' | 'up' | 'down' | 'cap' | 'volume';
interface Row { code: string; name: string; price: number; change: number; changeRate: number; metric: number; metricLabel: string; href?: string }
interface Resp { tab: Tab; coin: 'UPBIT' | 'BITHUMB'; kr: Row[]; us: Row[]; etf: Row[]; crypto: Row[] }

const TABS: [Tab, string][] = [['value', '거래대금 상위'], ['popular', '인기 종목'], ['up', '상승'], ['down', '하락'], ['cap', '시가총액'], ['volume', '거래량 상위']];

function metricText(r: Row, kind: 'krw' | 'usd' | 'coin') {
  if (r.metricLabel === '조회') return `조회 ${fmtCount(r.metric)}`;
  if (r.metricLabel === '거래량') return `거래량 ${fmtCount(r.metric)}`;
  if (!r.metric) return '';
  return `${r.metricLabel} ${kind === 'usd' ? fmtUsdBig(r.metric) : fmtKrw(r.metric)}`;
}

function Column({ title, sub, rows, kind, right }: { title: string; sub?: string; rows?: Row[]; kind: 'krw' | 'usd' | 'coin'; right?: React.ReactNode }) {
  return (
    <div className="fin-card" style={{ padding: '14px 14px 6px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{title}</h3>
        {sub && <span style={{ fontSize: 11, color: 'var(--faint)' }}>{sub}</span>}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      {!rows ? <div className="skeleton" style={{ height: 420, borderRadius: 10 }} /> : rows.length === 0 ? <Empty /> : rows.map((r, i) => (
        <div key={`${r.code}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
          <span className="tabular-nums" style={{ width: 18, flexShrink: 0, fontSize: 13, fontWeight: 700, color: i < 3 ? 'var(--ink)' : 'var(--faint)' }}>{i + 1}</span>
          <StockLink href={r.href}>
            {/* 4열이 좁아 뱃지를 빼고 이름을 두 줄까지 허용(잘림 방지) */}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metricText(r, kind)}</div>
            </div>
          </StockLink>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="tabular-nums" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {kind === 'usd' ? fmtUsd(r.price) : r.price >= 100 ? Math.round(r.price).toLocaleString() : r.price.toLocaleString()}
            </div>
            <Change change={r.change} rate={r.changeRate} currency={kind === 'usd' ? 'USD' : 'KRW'} small />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RankingPage() {
  const [tab, setTab] = useState<Tab>('value');
  const [coin, setCoin] = useState<'UPBIT' | 'BITHUMB'>('UPBIT');
  const { data, error } = useSWR<Resp>(`/api/naver/ranking?tab=${tab}&coin=${coin}`, fetcher, { refreshInterval: 20000, keepPreviousData: true });
  const same = data?.tab === tab && data?.coin === coin;

  return (
    <div style={{ paddingBottom: 24 }}>
      <SectionTitle title="실시간 랭킹" sub="20초마다 갱신" />
      <div className="chip-scroll in-card" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} type="button" className={`chip ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {error ? <div className="fin-card"><Empty /></div> : (
        <div className="rk-grid">
          <Column title="국내 주식" rows={same ? data!.kr : data?.kr} kind="krw" />
          <Column title="미국 주식" sub="정규장 랭킹" rows={same ? data!.us : data?.us} kind="usd" />
          <Column title="국내 ETF" rows={same ? data!.etf : data?.etf} kind="krw" />
          <Column title="가상자산" sub={tab === 'popular' ? '인기 = 거래대금 기준' : undefined} rows={same ? data!.crypto : data?.crypto} kind="coin"
            right={<Seg<'UPBIT' | 'BITHUMB'> value={coin} onChange={setCoin} options={[['UPBIT', '업비트'], ['BITHUMB', '빗썸']]} />} />
        </div>
      )}
      <SourceNote>출처: 네이버페이 증권(국내·미국 주식·ETF), 업비트·빗썸 원화마켓(가상자산). 순위는 시장 관심도 참고용이며 매수·매도 신호가 아닙니다. 등락률 색: <span style={{ color: colorOf(1) }}>상승</span> · <span style={{ color: colorOf(-1) }}>하락</span>.</SourceNote>
      <style jsx>{`
        .rk-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; }
        @media (max-width: 1200px) { .rk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) { .rk-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
