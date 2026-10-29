'use client';

/**
 * 홈 '발견' 탭 섹션(2.0 기획서 §5.1-5) — 실시간 랭킹 · 뉴스 · 산업 트렌드 · 테마 ETF · 리서치를 탭 하나로 축약.
 * 한 번에 5행만, '전체보기'로 전문 페이지 이동. 선택한 탭의 API 하나만 부른다(첫 로드에 순위 전체를 모두 받지 않게).
 * 데이터·엔드포인트는 각 전문 섹션(components/naver/sections/*)과 같다 — 계산·가공 없음.
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Segmented from '@/components/ui/Segmented';

type Tab = 'ranking' | 'news' | 'industry' | 'etf' | 'research';
const TABS: readonly (readonly [Tab, string])[] = [['ranking', '실시간 랭킹'], ['news', '뉴스'], ['industry', '산업 트렌드'], ['etf', '테마 ETF'], ['research', '리서치']];
const MORE: Record<Tab, string> = { ranking: '/ranking', news: '/news', industry: '/industry', etf: '/theme-etf', research: '/research' };
const KEY: Record<Tab, string> = {
  ranking: '/api/naver/ranking?tab=value&coin=UPBIT',
  news: '/api/news?category=domestic',
  industry: '/api/naver/industry?market=kr&cat=industries&period=daily&size=3',
  etf: '/api/naver/theme-etf?region=kr',
  research: '/api/naver/research?direction=up',
};
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const N = 5;
const chg = (r: number) => <span className="tabular-nums font-semibold" style={{ color: r > 0 ? 'var(--up)' : r < 0 ? 'var(--down)' : 'var(--text-muted)' }}>{r > 0 ? '+' : ''}{r.toFixed(2)}%</span>;

interface RankRow { code: string; name: string; price: number; changeRate: number; metric: number; metricLabel: string; href?: string }
interface NewsItem { title: string; link: string; source: string; pubDate?: string }
interface TrendCard { code: string; name: string; changeRate: number; rising: number; flat: number; falling: number }
interface Theme { code: string; name: string; count: number; return1d?: number; return3m?: number }
interface Report { nid: string; title: string; brokerName: string; writeDate: string; url: string }

function Line({ href, external, left, right, sub }: { href: string; external?: boolean; left: React.ReactNode; right?: React.ReactNode; sub?: React.ReactNode }) {
  const cls = 'flex items-center gap-3 py-2.5 border-b border-[var(--line-2)] last:border-0 hover:bg-[var(--bg-card-hover)] -mx-2 px-2 rounded-lg';
  const inner = (<><span className="min-w-0 flex-1"><span className="block text-[13.5px] text-[var(--ink)] truncate">{left}</span>{sub && <span className="block text-[11px] text-[var(--text-muted)] truncate">{sub}</span>}</span>{right && <span className="shrink-0 text-[13px] text-right">{right}</span>}</>);
  return external ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <Link href={href} className={cls}>{inner}</Link>;
}

function Body({ tab }: { tab: Tab }) {
  const { data, error } = useSWR(KEY[tab], fetcher, { refreshInterval: tab === 'news' || tab === 'research' ? 300000 : 30000, revalidateOnFocus: false, keepPreviousData: false });
  if (error) return <p className="text-[12.5px] text-[var(--text-muted)] py-6 text-center">불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>;
  if (!data) return <div className="space-y-2 py-1">{Array.from({ length: N }, (_, i) => <div key={i} className="skeleton" style={{ height: 34 }} />)}</div>;
  let rows: React.ReactNode[] = [];
  if (tab === 'ranking') rows = ((data.kr ?? []) as RankRow[]).slice(0, N).map((r, i) => (
    <Line key={r.code} href={r.href ?? `/stock/${r.code}`} left={<><span className="text-[var(--text-muted)] tabular-nums mr-2">{i + 1}</span>{r.name}</>}
      sub={`${r.metricLabel} ${r.metric >= 1e8 ? `${Math.round(r.metric / 1e8).toLocaleString('ko-KR')}억` : r.metric.toLocaleString('ko-KR')}`} right={<><span className="tabular-nums text-[var(--ink)]">{r.price.toLocaleString('ko-KR')}</span><br />{chg(r.changeRate)}</>} />));
  if (tab === 'news') rows = ((Array.isArray(data) ? data : []) as NewsItem[]).slice(0, N).map((n) => (
    <Line key={n.link} href={n.link} external left={n.title} sub={n.source} />));
  if (tab === 'industry') rows = ((data.cards ?? []) as TrendCard[]).slice(0, N).map((c) => (
    <Line key={c.code} href="/industry" left={c.name} sub={`상승 ${c.rising} · 보합 ${c.flat} · 하락 ${c.falling}`} right={chg(c.changeRate)} />));
  if (tab === 'etf') rows = ((data.themes ?? []) as Theme[]).slice(0, N).map((t) => (
    <Line key={t.code} href="/theme-etf" left={t.name} sub={`ETF ${t.count}개${t.return3m != null ? ` · 3개월 ${t.return3m > 0 ? '+' : ''}${t.return3m.toFixed(2)}%` : ''}`}
      right={t.return1d != null ? chg(t.return1d) : undefined} />));
  if (tab === 'research') rows = ((data.analyst?.reports ?? []) as Report[]).slice(0, N).map((r) => (
    <Line key={r.nid} href={r.url} external left={r.title} sub={`${r.brokerName} · ${r.writeDate}`} />));
  return rows.length ? <div>{rows}</div> : <p className="text-[12.5px] text-[var(--text-muted)] py-6 text-center">표시할 항목이 없습니다.</p>;
}

export default function DiscoveryTabs() {
  const [tab, setTab] = useState<Tab>('ranking');
  return (
    <section className="fin-card p-4 lg:p-5" aria-label="발견">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h2 className="text-[14.5px] font-bold text-[var(--ink)]">발견</h2>
        <div className="overflow-x-auto max-w-full" style={{ scrollbarWidth: 'none' }}>
          <Segmented label="발견 항목" value={tab} options={TABS} onChange={setTab} />
        </div>
        <Link href={MORE[tab]} className="dash-more ml-auto">전체보기 →</Link>
      </div>
      <Body key={tab} tab={tab} />
      <p className="text-[11px] text-[var(--faint)] mt-3">출처: 네이버페이 증권·언론사. 순위·리포트는 참고 정보이며 매수·매도 신호가 아닙니다.</p>
    </section>
  );
}
