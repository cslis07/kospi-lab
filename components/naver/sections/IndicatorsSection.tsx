'use client';

/**
 * 환율 · 시장지표 섹션 — /indicators 페이지와 홈(PC) 공용. 네이버 증권 홈과 같은 12종.
 * home=true: 네이버처럼 6칸 × 2줄(환율·미국채 / 원자재·국채 순). page: 환율·금리·원자재 분류별 4칸.
 * 값 30초 갱신, 미니차트 = 최근 30거래일 종가. 상태: 실시간 / N분 지연 / 장마감.
 */
import useSWR from 'swr';
import { fetcher, colorOf, arrowOf, MiniLine, SectionTitle, SourceNote, Empty, EMPTY_SOURCE, MoreLink } from '@/components/naver/ui';

interface Q { code: string; name: string; cat: string; unit?: string; price: number; change: number; changeRate: number; status: string; spark: number[] }

const GROUPS: [string, string[]][] = [
  ['환율', ['FX_USDKRW', 'FX_EURKRW', 'FX_JPYKRW', '.DXY']],
  ['금리(국채)', ['US3YT=RR', 'US10YT=RR', 'KR2YT=RR', 'KR10YT=RR']],
  ['원자재', ['CLcv1', 'GCcv1', 'M04020000', 'SIcv1']],
];
// 네이버 홈 배치 순서(번들의 코드 배열과 동일)
const HOME_ORDER = ['FX_USDKRW', 'FX_EURKRW', 'FX_JPYKRW', '.DXY', 'US3YT=RR', 'US10YT=RR', 'CLcv1', 'GCcv1', 'M04020000', 'SIcv1', 'KR2YT=RR', 'KR10YT=RR'];

const dec = (q: Q) => (q.cat === 'bond' ? 4 : q.code === 'M04020000' ? 0 : 2);
const fmt = (q: Q, v: number) => v.toLocaleString('en-US', { minimumFractionDigits: dec(q), maximumFractionDigits: dec(q) });

function Card({ q, compact }: { q: Q; compact?: boolean }) {
  const live = q.status === '실시간' || q.status.endsWith('지연');
  return (
    <div className="fin-card" style={{ padding: compact ? '12px 12px 8px' : '14px 14px 10px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: compact ? 13 : 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}</span>
        <span className={`idx-live${live ? ' on' : ''}`} style={{ marginLeft: 'auto' }}><i />{q.status}</span>
      </div>
      <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: compact ? 18 : 20, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>
        {q.price ? fmt(q, q.price) : '—'}
        {q.unit === '%' && q.price ? <span style={{ fontSize: 12, marginLeft: 2 }}>%</span> : null}
      </div>
      <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: colorOf(q.changeRate), marginTop: 1, whiteSpace: 'nowrap' }}>
        {arrowOf(q.changeRate)}{fmt(q, Math.abs(q.change))} ({q.changeRate > 0 ? '+' : ''}{q.changeRate.toFixed(2)}%)
      </div>
      <div style={{ marginTop: 8 }}><MiniLine points={q.spark} rate={q.changeRate} height={compact ? 28 : 34} /></div>
    </div>
  );
}

export default function IndicatorsSection({ home = false }: { home?: boolean }) {
  const { data, error } = useSWR<{ items: Q[] }>('/api/naver/indicators', fetcher, { refreshInterval: 30000, keepPreviousData: true });
  const by = new Map((data?.items ?? []).map((q) => [q.code, q]));
  // 응답이 왔는데 이 지표만 없으면(코드 변경 등) 스켈레톤을 끝없이 돌리지 않고 '없음' 카드로
  const slot = (c: string) => {
    const q = by.get(c);
    if (q) return <Card key={c} q={q} compact={home} />;
    if (data) return <div key={c} className="fin-card" style={{ height: home ? 118 : 128, display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--faint)' }}>지표 없음</div>;
    return <div key={c} className="skeleton" style={{ height: home ? 118 : 128, borderRadius: 'var(--r)' }} />;
  };

  return (
    <div>
      <SectionTitle big={home} title="환율 · 시장지표" sub={home ? undefined : '30초마다 갱신 · 미니차트 최근 30거래일'} right={home ? <MoreLink href="/indicators" /> : undefined} />
      {error ? <div className="fin-card"><Empty /></div> : data && !data.items.length ? <div className="fin-card"><Empty text={EMPTY_SOURCE} /></div> : home ? (
        <div className="nv-ind-home">{HOME_ORDER.map(slot)}</div>
      ) : GROUPS.map(([g, codes]) => (
        <section key={g} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '0 2px 8px' }}>{g}</div>
          <div className="nv-ind-grid">{codes.map(slot)}</div>
        </section>
      ))}
      {!home && <SourceNote>출처: 네이버페이 증권(하나은행 고시 환율·로이터 채권·선물). 국내 금은 g당 원화 가격, 엔화는 100엔 기준입니다. ‘N분 지연’ 표시 지표는 실시간이 아닙니다.</SourceNote>}
    </div>
  );
}
