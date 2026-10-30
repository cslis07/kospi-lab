'use client';

/**
 * 종목 상세 '뉴스 · 공시' — 이 종목 관련 최근 기사 10건과 공시 10건(탭). 누르면 원문(네이버 뉴스·공시)으로.
 * 참고: 네이버페이 증권 종목 뉴스/공시 탭 · 토스증권 종목 소식. 데이터 = /api/stock/[code]/news.
 */
import useSWR from 'swr';
import { useState } from 'react';
import Collapsible from '@/components/ui/Collapsible';
import Segmented from '@/components/ui/Segmented';
import type { StockNewsItem, StockDisclosure } from '@/lib/stockFinance';

const fetcher = (u: string) => fetch(u).then((r) => r.json());
type Tab = 'news' | 'disc';

export default function StockNews({ code }: { code: string }) {
  const { data } = useSWR<{ news: StockNewsItem[]; disclosures: StockDisclosure[]; error?: string }>(`/api/stock/${code}/news`, fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const [tab, setTab] = useState<Tab>('news');
  if (!data || data.error || (!data.news?.length && !data.disclosures?.length)) return null;
  const rows = tab === 'news'
    ? data.news.map((n) => ({ id: n.id, title: n.title, sub: `${n.source} · ${n.at}`, url: n.url }))
    : data.disclosures.map((d) => ({ id: d.id, title: d.title, sub: d.at, url: d.url }));
  return (
    <Collapsible title="뉴스 · 공시" sub={`뉴스 ${data.news.length} · 공시 ${data.disclosures.length}`}>
      <div className="mb-2"><Segmented label="뉴스·공시" value={tab} options={[['news', '뉴스'], ['disc', '공시']] as const} onChange={setTab} /></div>
      {rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="block py-2.5 border-b border-[var(--line-2)] last:border-0 hover:opacity-80">
                <span className="block text-[13px] text-[var(--ink)] leading-snug">{r.title}</span>
                <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">{r.sub}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-[var(--text-muted)] py-4 text-center">최근 {tab === 'news' ? '뉴스가' : '공시가'} 없습니다.</p>}
      <p className="text-[10.5px] text-[var(--faint)] mt-2">출처: 네이버페이 증권·각 언론사·KRX 공시. 기사·공시는 참고용이며 매매 신호가 아닙니다.</p>
    </Collapsible>
  );
}
