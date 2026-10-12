'use client';

/**
 * 환율 · 시장지표 섹션 — /indicators 페이지와 홈(PC) 공용. 네이버 증권 홈과 같은 12종.
 * home=true: 네이버처럼 6칸 × 2줄(환율·미국채 / 원자재·국채 순). page: 환율·금리·원자재 분류별 4칸.
 * 값 30초 갱신, 미니차트 = 최근 30거래일 종가. 상태: 실시간 / N분 지연 / 장마감.
 *
 * 🆕 페이지에선 '경제지표(FRED)' 그룹을 함께 보여주고(미국 CPI·PPI·달러지수·유가·원달러),
 *    경제지표 카드와 겹치는 live 카드(유가·달러인덱스·원/달러)를 누르면 바텀시트로 상세(차트·발표내역·영향)를 연다.
 */
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, colorOf, arrowOf, MiniLine, SectionTitle, SourceNote, Empty, EMPTY_SOURCE, MoreLink, Flash } from '@/components/naver/ui';
import BottomSheet from '@/components/ui/BottomSheet';
import MacroDetail, { FLAG } from '@/components/MacroDetail';
import MarketIndicatorDetail from '@/components/MarketIndicatorDetail';
import type { MacroIndicator } from '@/lib/macroData';

interface Q { code: string; name: string; cat: string; unit?: string; price: number; change: number; changeRate: number; status: string; spark: number[] }

const GROUPS: [string, string[]][] = [
  ['환율', ['FX_USDKRW', 'FX_EURKRW', 'FX_JPYKRW', '.DXY']],
  ['금리(국채)', ['US3YT=RR', 'US10YT=RR', 'KR2YT=RR', 'KR10YT=RR']],
  ['원자재', ['CLcv1', 'GCcv1', 'M04020000', 'SIcv1']],
];
// 네이버 홈 배치 순서(번들의 코드 배열과 동일)
const HOME_ORDER = ['FX_USDKRW', 'FX_EURKRW', 'FX_JPYKRW', '.DXY', 'US3YT=RR', 'US10YT=RR', 'CLcv1', 'GCcv1', 'M04020000', 'SIcv1', 'KR2YT=RR', 'KR10YT=RR'];
// 경제지표 그룹에 보여줄 순서(FRED). 나스닥 포함.
const MACRO_ORDER = ['cpi', 'ppi', 'nasdaq', 'dxy', 'wti', 'usdkrw'];

// 시트에 띄울 대상: live 시세 지표 또는 경제지표(FRED)
type Sel = { kind: 'live'; q: Q } | { kind: 'macro'; id: string } | null;

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
        {q.price ? <Flash value={q.price}>{fmt(q, q.price)}</Flash> : '—'}
        {q.unit === '%' && q.price ? <span style={{ fontSize: 12, marginLeft: 2 }}>%</span> : null}
      </div>
      <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: colorOf(q.changeRate), marginTop: 1, whiteSpace: 'nowrap' }}>
        {arrowOf(q.changeRate)}{fmt(q, Math.abs(q.change))} ({q.changeRate > 0 ? '+' : ''}{q.changeRate.toFixed(2)}%)
      </div>
      <div style={{ marginTop: 8 }}><MiniLine points={q.spark} rate={q.changeRate} height={compact ? 28 : 34} /></div>
    </div>
  );
}

// 경제지표(FRED) 카드 — 눌러서 상세 시트. live 시세가 아니라 공식 발표치(기준일 표기).
function MacroCard({ it, onClick }: { it: MacroIndicator; onClick: () => void }) {
  const chg = it.changePct;
  const v = it.latest?.value;
  return (
    <button type="button" onClick={onClick} className="fin-card" style={{ padding: '14px 14px 10px', minWidth: 0, width: '100%', textAlign: 'left', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{FLAG[it.country]} {it.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--faint)', whiteSpace: 'nowrap' }}>상세 ›</span>
      </div>
      <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>
        {v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: it.decimals, maximumFractionDigits: it.decimals })}
        {v != null && it.unit ? <span style={{ fontSize: 11, marginLeft: 3, color: 'var(--muted)', fontWeight: 400 }}>{it.unit}</span> : null}
      </div>
      <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: colorOf(chg ?? 0), marginTop: 1, whiteSpace: 'nowrap' }}>
        {chg == null ? '—' : `${arrowOf(chg)}${Math.abs(chg).toFixed(2)}%`}
        <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>{it.periodicity === 'monthly' ? '전월' : '전일'}</span>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 7 }}>기준일 {it.latest?.date ?? '—'}</div>
    </button>
  );
}

export default function IndicatorsSection({ home = false }: { home?: boolean }) {
  const { data, error } = useSWR<{ items: Q[]; asOf?: string }>('/api/naver/indicators', fetcher, { refreshInterval: 10000, keepPreviousData: true });
  // 경제지표는 발표치라 자주 안 바뀜 → 5분. 홈(compact)에선 불러오지 않는다(키 null).
  const { data: macro } = useSWR<MacroIndicator[]>(home ? null : '/api/macro/indicators', fetcher, { refreshInterval: 300000 });
  const macroById = new Map((macro ?? []).map((m) => [m.id, m]));
  const [sel, setSel] = useState<Sel>(null); // 시트에 띄울 대상

  const by = new Map((data?.items ?? []).map((q) => [q.code, q]));
  // 응답이 왔는데 이 지표만 없으면(코드 변경 등) 스켈레톤을 끝없이 돌리지 않고 '없음' 카드로
  const slot = (c: string) => {
    const q = by.get(c);
    if (q) {
      // 페이지에선 모든 지표 카드를 눌러 상세(히스토리·설명·영향)를 연다. 홈 레일은 그대로.
      if (!home) {
        return (
          <button key={c} type="button" onClick={() => setSel({ kind: 'live', q })} aria-label={`${q.name} 상세`}
            style={{ display: 'block', width: '100%', padding: 0, background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }}>
            <Card q={q} compact={home} />
          </button>
        );
      }
      return <Card key={c} q={q} compact={home} />;
    }
    if (data) return <div key={c} className="fin-card" style={{ height: home ? 118 : 128, display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--faint)' }}>지표 없음</div>;
    return <div key={c} className="skeleton" style={{ height: home ? 118 : 128, borderRadius: 'var(--r)' }} />;
  };

  const macroSlot = (id: string) => {
    const it = macroById.get(id);
    if (it) return <MacroCard key={id} it={it} onClick={() => setSel({ kind: 'macro', id })} />;
    if (macro) return null; // 응답엔 왔는데 이 지표만 없으면 숨김
    return <div key={id} className="skeleton" style={{ height: 128, borderRadius: 'var(--r)' }} />;
  };

  const selMacro = sel?.kind === 'macro' ? macroById.get(sel.id) : undefined;
  const sheetTitle = sel?.kind === 'live' ? sel.q.name : sel?.kind === 'macro' ? (selMacro?.label ?? '경제지표') : '';

  return (
    <div>
      <SectionTitle big={home} title="환율 · 시장지표" live={data?.asOf ?? ''} every={10} sub={home ? undefined : '10초마다 갱신 · 미니차트 최근 30거래일'} right={home ? <MoreLink href="/indicators" /> : undefined} />
      {error ? <div className="fin-card"><Empty /></div> : data && !data.items.length ? <div className="fin-card"><Empty text={EMPTY_SOURCE} /></div> : home ? (
        <div className="nv-ind-home">{HOME_ORDER.map(slot)}</div>
      ) : GROUPS.map(([g, codes]) => (
        <section key={g} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '0 2px 8px' }}>{g}</div>
          <div className="nv-ind-grid">{codes.map(slot)}</div>
        </section>
      ))}

      {/* 🆕 경제지표(FRED) — 페이지에서만. 눌러서 상세(차트·발표내역·영향) */}
      {!home && (
        <section style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', margin: '14px 2px 4px' }}>경제지표 <span style={{ fontWeight: 400, color: 'var(--faint)', fontSize: 11.5 }}>· 미국 물가·나스닥·달러·유가와 원/달러(FRED 공식 발표치) — 카드를 누르면 상세</span></div>
          <div className="nv-ind-grid">{MACRO_ORDER.map(macroSlot)}</div>
        </section>
      )}

      {/* 출처·신호 아님 고지는 홈에서도 노출(완성도 축 9) */}
      <SourceNote>출처: 네이버페이 증권(하나은행 고시 환율·로이터 채권·선물){home ? '' : ' · 경제지표는 FRED(세인트루이스 연은) 공식 발표치'}. 국내 금은 g당 원화 가격, 엔화는 100엔 기준입니다. ‘N분 지연’ 표시 지표는 실시간이 아닙니다.{home ? '' : ' 지표를 누르면 히스토리·설명을 봅니다.'}</SourceNote>

      {/* 상세 바텀시트 — live 시장지표 또는 경제지표(FRED) */}
      {!home && (
        <BottomSheet open={sel !== null} onClose={() => setSel(null)} title={sheetTitle} full>
          {sel?.kind === 'live'
            ? <MarketIndicatorDetail q={sel.q} />
            : selMacro
              ? <MacroDetail cur={selMacro} />
              : <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>지표 불러오는 중…</p>}
        </BottomSheet>
      )}
    </div>
  );
}
