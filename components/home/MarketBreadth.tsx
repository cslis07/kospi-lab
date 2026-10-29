'use client';

/**
 * 홈 '시장 폭'(2.0 기획서 §5.1-4) — 코스피·코스닥 상승·보합·하락 종목 수(상한·하한) 막대.
 * 데이터 = /api/home/board 의 upDown(지수 보드와 같은 키라 코스피는 요청이 합쳐진다). 값이 없으면 수치를 만들지 않고 '없음'.
 */
import useSWR from 'swr';
import Link from 'next/link';
import DataStatus from '@/components/ui/DataStatus';

interface UpDown { up: number; upper: number; flat: number; down: number; lower: number }
interface Board { upDown: UpDown | null; live: { live: boolean; tradedAt: string } | null; tradingDate: string | null }
const fetcher = (u: string) => fetch(u).then((r) => r.json());

function Row({ name, ud }: { name: string; ud: UpDown | null | undefined }) {
  if (ud === undefined) return <div className="skeleton" style={{ height: 52 }} />;
  if (!ud) return <p className="text-[12px] text-[var(--text-muted)]">{name} — 데이터 없음</p>;
  const total = ud.up + ud.flat + ud.down || 1;
  const w = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{name}</span>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{total.toLocaleString()}종목</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden mt-1.5 bg-[var(--surface-2)]" aria-hidden>
        <span style={{ width: w(ud.up), background: 'var(--up)' }} />
        <span style={{ width: w(ud.flat), background: 'var(--faint)', opacity: .5 }} />
        <span style={{ width: w(ud.down), background: 'var(--down)' }} />
      </div>
      <div className="grid grid-cols-3 mt-1.5 text-[12px] tabular-nums">
        <span style={{ color: 'var(--up)' }}>▲ 상승 <b>{ud.up.toLocaleString()}</b>{ud.upper ? <span className="text-[10.5px]"> (상한 {ud.upper})</span> : null}</span>
        <span className="text-center text-[var(--text-muted)]">보합 <b>{ud.flat.toLocaleString()}</b></span>
        <span className="text-right" style={{ color: 'var(--down)' }}>▼ 하락 <b>{ud.down.toLocaleString()}</b>{ud.lower ? <span className="text-[10.5px]"> (하한 {ud.lower})</span> : null}</span>
      </div>
    </div>
  );
}

export default function MarketBreadth() {
  const opts = { refreshInterval: 30000, revalidateOnFocus: true, keepPreviousData: true };
  const { data: k } = useSWR<Board>('/api/home/board?code=KOSPI&range=1d', fetcher, opts);
  const { data: q } = useSWR<Board>('/api/home/board?code=KOSDAQ&range=1d', fetcher, opts);
  const live = k?.live?.live;
  return (
    <section className="fin-card p-4 lg:p-5 h-full" aria-label="시장 폭">
      <div className="dash-h">
        <h2>시장 폭</h2>
        {k && <span className="ml-auto"><DataStatus state={live ? 'live' : 'closed'} at={k.tradingDate} source="네이버페이 증권" /></span>}
      </div>
      <div className="space-y-4">
        <Row name="코스피" ud={k ? k.upDown : undefined} />
        <Row name="코스닥" ud={q ? q.upDown : undefined} />
      </div>
      <Link href="/domestic" className="dash-more block mt-4 !ml-0">국내 시장 →</Link>
    </section>
  );
}
