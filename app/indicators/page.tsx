'use client';

/**
 * 환율 · 시장지표 — 네이버 증권 홈 위젯과 같은 12종(USD·EUR·JPY·달러인덱스·미국채 3/10년·WTI·국제금·국내금·은·국채 2/10년).
 * 값 30초 갱신, 미니차트 = 최근 30거래일 종가. 상태: 실시간 / N분 지연 / 장마감 (네이버 표기 그대로).
 */
import useSWR from 'swr';
import { fetcher, colorOf, arrowOf, MiniLine, SectionTitle, SourceNote, Empty } from '@/components/naver/ui';

interface Q { code: string; name: string; cat: string; unit?: string; flag?: string; price: number; change: number; changeRate: number; status: string; spark: number[] }

const GROUPS: [string, string[]][] = [
  ['환율', ['FX_USDKRW', 'FX_EURKRW', 'FX_JPYKRW', '.DXY']],
  ['금리(국채)', ['US3YT=RR', 'US10YT=RR', 'KR2YT=RR', 'KR10YT=RR']],
  ['원자재', ['CLcv1', 'GCcv1', 'M04020000', 'SIcv1']],
];

const dec = (q: Q) => (q.cat === 'bond' ? 4 : q.code === 'M04020000' ? 0 : 2);
const fmt = (q: Q, v: number) => v.toLocaleString('en-US', { minimumFractionDigits: dec(q), maximumFractionDigits: dec(q) });

function Card({ q }: { q: Q }) {
  const live = q.status === '실시간' || q.status.endsWith('지연');
  return (
    <div className="fin-card" style={{ padding: '14px 14px 10px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* 국기 이모지는 Windows 에서 'US'·'KR' 글자로 보여 생략(이름에 국가가 들어 있음) */}
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}</span>
        <span className={`idx-live${live ? ' on' : ''}`} style={{ marginLeft: 'auto' }}><i />{q.status}</span>
      </div>
      <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>
        {q.price ? fmt(q, q.price) : '—'}
        {q.unit === '%' && q.price ? <span style={{ fontSize: 13, marginLeft: 2 }}>%</span> : null}
      </div>
      <div className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: colorOf(q.changeRate), marginTop: 1 }}>
        {arrowOf(q.changeRate)}{fmt(q, Math.abs(q.change))} ({q.changeRate > 0 ? '+' : ''}{q.changeRate.toFixed(2)}%)
      </div>
      <div style={{ marginTop: 8 }}><MiniLine points={q.spark} rate={q.changeRate} /></div>
    </div>
  );
}

export default function IndicatorsPage() {
  const { data, error, isLoading } = useSWR<{ items: Q[] }>('/api/naver/indicators', fetcher, { refreshInterval: 30000, keepPreviousData: true });
  const by = new Map((data?.items ?? []).map((q) => [q.code, q]));

  return (
    <div style={{ paddingBottom: 24 }}>
      <SectionTitle title="환율 · 시장지표" sub="30초마다 갱신 · 미니차트 최근 30거래일" />
      {error ? <div className="fin-card"><Empty /></div> : GROUPS.map(([g, codes]) => (
        <section key={g} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '0 2px 8px' }}>{g}</div>
          <div className="ind-grid">
            {codes.map((c) => {
              const q = by.get(c);
              return q ? <Card key={c} q={q} /> : <div key={c} className="skeleton" style={{ height: 128, borderRadius: 'var(--r)' }} aria-busy={isLoading} />;
            })}
          </div>
        </section>
      ))}
      <SourceNote>출처: 네이버페이 증권(하나은행 고시 환율·로이터 채권·선물). 국내 금은 g당 원화 가격, 엔화는 100엔 기준입니다. ‘N분 지연’ 표시 지표는 실시간이 아닙니다.</SourceNote>
      <style jsx>{`
        .ind-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        @media (max-width: 900px) { .ind-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      `}</style>
    </div>
  );
}
