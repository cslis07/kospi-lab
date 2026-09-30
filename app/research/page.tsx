'use client';

/**
 * 리서치 — 네이버 증권 홈의 두 위젯 전체 화면판.
 *  ① 최근 1주간 애널리스트들이 집중한 산업: 산업 칩 → 산업분석 리포트 목록(원문은 네이버 리서치)
 *  ② 목표주가 변화가 큰 종목: 상향/하향 · 최신 vs 직전 리포트 목표가·투자의견·작성일 기준가
 * ⚠ 증권사 애널리스트 의견을 그대로 옮긴 것 — 이 앱의 매수·매도 신호가 아니다(앱 원칙: 측정상 예측 우위 없음).
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { fetcher, colorOf, signPct, Seg, SectionTitle, SourceNote, Empty, fmtCount } from '@/components/naver/ui';

interface Res { nid: string; title: string; writeDate: string; goalPrice: number; priceAtWriteDate: number; opinion: string; opinionType: string }
interface GoalSet { itemCode: string; itemName: string; brokerName: string; goalPriceDiff: number; goalPriceDiffRate: number; latest: Res; prev: Res | null }
interface Report { nid: string; title: string; brokerName: string; analystName: string; writeDate: string; readCount: number; url: string }
interface Resp {
  direction: 'up' | 'down';
  goal: { writeDate: string; sets: GoalSet[] };
  analyst: { baseDate: string; industry: string; industries: { industry: string; name: string; count: number }[]; reports: Report[] };
}

const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const kdate = (d: string) => { const [y, m, dd] = d.split('-'); return y && m && dd ? `${y}년 ${m}월 ${dd}일` : d; };
const OP_STYLE: Record<string, { bg: string; fg: string }> = {
  buy: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  sell: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
};
// 증권사마다 'Buy'·'매수'·'BUY' 로 제각각 → opinionType 기준 한국어로 통일(모르는 값은 원문)
const OP_LABEL: Record<string, string> = { buy: '매수', strongbuy: '적극매수', sell: '매도', hold: '중립', neutral: '중립', marketperform: '중립', outperform: '매수' };
const opLabel = (r: { opinion: string; opinionType: string }) => OP_LABEL[(r.opinionType || '').toLowerCase()] ?? r.opinion;

function ResBox({ r, first }: { r: Res; first: boolean }) {
  const op = OP_STYLE[r.opinionType] ?? { bg: 'var(--surface-2)', fg: 'var(--muted)' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--faint)' }}>목표주가</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <b className="tabular-nums" style={{ fontSize: first ? 16 : 14, color: 'var(--ink)' }}>{r.goalPrice.toLocaleString()}원</b>
          {r.opinion && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: op.bg, color: op.fg }}>{opLabel(r)}</span>}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--faint)' }}>작성일 기준가</div>
        <div className="tabular-nums" style={{ fontSize: first ? 16 : 14, fontWeight: 600, color: 'var(--ink-2)', marginTop: 2 }}>{r.priceAtWriteDate ? `${r.priceAtWriteDate.toLocaleString()}원` : '—'}</div>
      </div>
    </div>
  );
}

function GoalCard({ s }: { s: GoalSet }) {
  const rows = [s.latest, s.prev].filter(Boolean) as Res[];
  return (
    <div className="fin-card" style={{ padding: 18, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Link href={`/stock/${s.itemCode}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{s.itemName}</span>
        <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{s.itemCode}</span>
      </Link>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, flex: 1 }}>
        {rows.map((r, i) => (
          <div key={r.nid}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? 'var(--ink)' : 'transparent', border: '1.5px solid var(--ink-2)' }} />
              <b style={{ fontSize: 13, color: 'var(--ink)' }}>{kdate(r.writeDate)}</b>
              {r.writeDate === today && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ok)', border: '1px solid var(--ok)', borderRadius: 5, padding: '0 5px' }}>TODAY</span>}
              {i === 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--faint)' }}>이전대비 <b className="tabular-nums" style={{ color: colorOf(s.goalPriceDiffRate) }}>{signPct(s.goalPriceDiffRate)}</b></span>
              )}
            </div>
            <a href={`https://finance.naver.com/research/company_read.naver?nid=${r.nid}`} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              “{r.title}”
            </a>
            <ResBox r={r} first={i === 0} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line-2)' }}>{s.brokerName}</div>
    </div>
  );
}

export default function ResearchPage() {
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [industry, setIndustry] = useState<string>('');
  const { data, error, isLoading } = useSWR<Resp>(`/api/naver/research?direction=${direction}${industry ? `&industry=${industry}` : ''}`, fetcher, { keepPreviousData: true });
  const a = data?.analyst;
  const sel = industry || a?.industry || '';

  return (
    <div style={{ paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ① 애널리스트 집중 산업 */}
      <section>
        <SectionTitle title="최근 1주간 애널리스트들이 집중한 산업" sub={a?.baseDate ? `${a.baseDate} 이후 7일` : undefined} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(a?.industries ?? []).map((x) => (
            <button key={x.industry} type="button" className={`chip ${sel === x.industry ? 'active' : ''}`} onClick={() => setIndustry(x.industry)}>
              {x.name} <span style={{ opacity: 0.7, fontWeight: 600 }}>{x.count}</span>
            </button>
          ))}
        </div>
        <div className="fin-card" style={{ padding: '4px 16px' }}>
          {error ? <Empty /> : isLoading && !a ? <div className="skeleton" style={{ height: 220, margin: '12px 0' }} /> : (a?.reports ?? []).length === 0 ? <Empty text="리포트가 없습니다." /> :
            a!.reports.map((r, i) => (
              <a key={r.nid} href={r.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', padding: '14px 2px', borderTop: i ? '1px solid var(--line-2)' : 'none', textDecoration: 'none' }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.4 }}>
                  {r.title}
                  {r.writeDate === today && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: 'var(--warn)' }}>NEW</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>
                  {r.brokerName}{r.analystName ? ` · ${r.analystName}` : ''} · {r.writeDate}{r.readCount ? ` · 조회 ${fmtCount(r.readCount)}` : ''}
                </div>
              </a>
            ))}
        </div>
      </section>

      {/* ② 목표주가 변화 */}
      <section>
        <SectionTitle title="목표주가 변화가 큰 종목 리서치" sub={data?.goal.writeDate ? `${data.goal.writeDate} 기준` : undefined}
          right={<Seg<'up' | 'down'> value={direction} onChange={setDirection} options={[['up', '목표주가 상향'], ['down', '목표주가 하향']]} />} />
        {error ? <div className="fin-card"><Empty /></div> : (
          <div className="rs-grid">
            {(isLoading && !data ? Array.from({ length: 4 }) : data?.goal.sets ?? []).map((s, i) =>
              s ? <GoalCard key={`${(s as GoalSet).itemCode}-${(s as GoalSet).brokerName}`} s={s as GoalSet} /> : <div key={i} className="skeleton" style={{ height: 320, borderRadius: 'var(--r)' }} />)}
          </div>
        )}
        {data && data.goal.sets.length === 0 && <div className="fin-card"><Empty text={`오늘 목표주가 ${direction === 'up' ? '상향' : '하향'} 리포트가 없습니다.`} /></div>}
      </section>

      <SourceNote>출처: 네이버페이 증권 리서치(증권사 리포트). 목표주가·투자의견은 <b>각 증권사 애널리스트의 의견</b>을 그대로 옮긴 것으로, 이 앱의 매수·매도 신호가 아닙니다. 리포트 원문은 제목을 누르면 네이버 리서치에서 열립니다.</SourceNote>

      <style jsx>{`
        .rs-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        @media (max-width: 760px) { .rs-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
