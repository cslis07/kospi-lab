'use client';

/**
 * 상승률/하락률 TOP 리스트 카드 — 좌측 컬러 바 행(레퍼런스의 Top Gainers/Losers 레이아웃).
 * KRX 공식 일별 데이터(/api/krx/ranking, 5분). 기준일을 헤더에 표기해 신선도를 숨기지 않는다.
 */
import useSWR from 'swr';
import Link from 'next/link';

interface RankItem { code: string; name: string; market: string; close: number; change: number; changeRate: number }
interface RankResp { configured: boolean; date?: string; rankings?: { gainers?: RankItem[]; losers?: RankItem[] } }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export default function RankList({ kind, limit = 4 }: { kind: 'gainers' | 'losers'; limit?: number }) {
  const { data, isLoading } = useSWR<RankResp>('/api/krx/ranking', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const up = kind === 'gainers';
  const rows = (data?.rankings?.[kind] ?? []).slice(0, limit);
  const date = data?.date && data.date.length === 8 ? `${data.date.slice(4, 6)}.${data.date.slice(6, 8)} 기준` : null;

  return (
    <section>
      <div className="fin-sec">
        <h3>
          {up ? '상승률 TOP' : '하락률 TOP'}
          {date && <span className="ml-2 text-[11px] font-semibold text-[var(--faint)] align-middle">{date}</span>}
        </h3>
        <Link href="/krx" className="fin-more">전체보기</Link>
      </div>

      <div className="fin-card overflow-hidden">
        {isLoading && !data ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="fin-row">
              <div className="flex-1 space-y-1.5"><span className="skeleton h-3.5 w-24" /><span className="skeleton h-2.5 w-16" /></div>
              <div className="flex flex-col items-end space-y-1.5"><span className="skeleton h-3.5 w-16" /><span className="skeleton h-2.5 w-10" /></div>
            </div>
          ))
        ) : rows.length ? (
          rows.map((r) => (
            <Link key={r.code} href={`/stock/${r.code}`} className={`fin-row ${up ? 'up' : 'down'}`}>
              <div className="min-w-0 flex-1">
                <div className="nm truncate">{r.name}</div>
                <div className="sb">{r.market} · {r.code}</div>
              </div>
              <div className="shrink-0">
                <div className="pr tabular-nums">{r.close.toLocaleString('ko-KR')}</div>
                <div className="ch tabular-nums" style={{ color: up ? 'var(--warn)' : 'var(--accent)' }}>
                  {r.changeRate > 0 ? '+' : ''}{r.changeRate.toFixed(2)}%
                </div>
              </div>
            </Link>
          ))
        ) : (
          <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            {data?.configured === false ? 'KRX 데이터 연결 전입니다' : '표시할 종목이 없습니다'}
          </p>
        )}
      </div>
    </section>
  );
}
