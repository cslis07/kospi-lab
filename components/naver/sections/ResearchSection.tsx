'use client';

/**
 * 리서치 섹션 — /research 페이지와 홈(PC) 공용.
 *  ① 최근 1주간 애널리스트들이 집중한 산업: 산업 칩 → 산업분석 리포트(원문은 네이버 리서치)
 *  ② 목표주가 변화가 큰 종목: 상향/하향 · 최신 vs 직전 목표가·투자의견·작성일 기준가
 * home=true: 네이버 증권 홈처럼 좌(①, 리포트 4건) · 우(②, 카드 2장) 2단. page: 위아래 전체.
 * ⚠ 증권사 애널리스트 의견을 그대로 옮긴 것 — 이 앱의 매수·매도 신호가 아니다.
 */
import { useState } from 'react';
import useSWR from 'swr';
import { fetcher, colorOf, signPct, SectionTitle, SourceNote, Empty, fmtCount, MoreLink, Flash, Badge } from '@/components/naver/ui';

interface Res { nid: string; title: string; writeDate: string; goalPrice: number; priceAtWriteDate: number; opinion: string; opinionType: string }
interface GoalSet { itemCode: string; itemName: string; brokerName: string; goalPriceDiff: number; goalPriceDiffRate: number; latest: Res; prev: Res | null; logo?: string; industryName?: string; url?: string }
interface Report { nid: string; title: string; brokerName: string; analystName: string; writeDate: string; readCount: number; url: string }
interface Px { price: number; change: number; changeRate: number }
interface Resp {
  direction: 'up' | 'down';
  prices?: Record<string, Px>;
  asOf?: string;
  goal: { writeDate: string; sets: GoalSet[] };
  analyst: { baseDate: string; industry: string; industries: { industry: string; name: string; count: number }[]; reports: Report[] };
}

const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const kdate = (d: string) => { const [y, m, dd] = d.split('-'); return y && m && dd ? `${y}년 ${m}월 ${dd}일` : d; };
const OP_STYLE: Record<string, { bg: string; fg: string }> = {
  buy: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  sell: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
};
// 증권사마다 'Buy'·'매수'·'BUY' 로 제각각 → opinionType 기준 한국어로 통일(모르는 값은 원문)
const OP_LABEL: Record<string, string> = { buy: '매수', strongbuy: '적극매수', sell: '매도', hold: '중립', neutral: '중립', marketperform: '중립', outperform: '매수' };
const opLabel = (r: { opinion: string; opinionType: string }) => OP_LABEL[(r.opinionType || '').toLowerCase()] ?? r.opinion;

/** 목표주가 | 기준가 2칸 상자(가운데 세로 구분선) — 네이버 카드 배치 */
function ResBox({ r, first }: { r: Res; first: boolean }) {
  const op = OP_STYLE[r.opinionType] ?? { bg: 'var(--surface-2)', fg: 'var(--muted)' };
  const size = first ? 19 : 16;
  return (
    <div className="nv-gc-box">
      <div>
        <div className="nv-gc-k">목표주가</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <b className="tabular-nums" style={{ fontSize: size, fontWeight: first ? 800 : 600, color: first ? 'var(--ink)' : 'var(--ink-2)' }}>{r.goalPrice.toLocaleString()}원</b>
          {r.opinion && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: op.bg, color: op.fg }}>{opLabel(r)}</span>}
        </div>
      </div>
      <div className="nv-gc-sep">
        <div className="nv-gc-k">기준가</div>
        <div className="tabular-nums" style={{ fontSize: size, fontWeight: 600, color: 'var(--ink-2)', marginTop: 4 }}>{r.priceAtWriteDate ? `${r.priceAtWriteDate.toLocaleString()}원` : '—'}</div>
      </div>
    </div>
  );
}

/**
 * 목표주가 변화 카드 — stock.naver.com '목표주가 변화가 큰 종목 리서치' 배치.
 * 로고·종목명·업종 | 현재가(실시간)·등락률 → 날짜 타임라인(최신 ● · 이전 ○, 세로선 연결) → 목표주가|기준가 상자 → 증권사.
 * 카드 전체를 누르면 네이버 증권 리포트 상세(stock.naver.com/research/company/{nid})로 이동(새 탭).
 */
function GoalCard({ s, today, px }: { s: GoalSet; today: string; px?: Px }) {
  const rows = [s.latest, s.prev].filter(Boolean) as Res[];
  return (
    <a className="fin-card nv-gc" href={s.url ?? `https://stock.naver.com/research/company/${s.latest.nid}`} target="_blank" rel="noopener noreferrer"
      aria-label={`${s.itemName} ${s.brokerName} 리포트 — 네이버 증권에서 보기`} title={`“${s.latest.title}” — 네이버 증권에서 리포트 보기`}>
      <div className="nv-gc-top">
        <Badge name={s.itemName} logo={s.logo} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nv-gc-name">{s.itemName}</div>
          <div className="nv-gc-ind">{s.industryName || s.itemCode}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="tabular-nums" style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>
            {px?.price ? <Flash value={px.price}>{px.price.toLocaleString()}원</Flash> : '—'}
          </div>
          {px?.price ? <div className="tabular-nums" style={{ fontSize: 12.5, fontWeight: 600, color: colorOf(px.changeRate), marginTop: 2 }}>{signPct(px.changeRate)}</div> : null}
        </div>
      </div>

      <ol className="nv-gc-tl">
        {rows.map((r, i) => (
          <li key={r.nid} className={i === 0 ? 'latest' : 'prev'}>
            <div className="nv-gc-date">
              <b>{kdate(r.writeDate)}</b>
              {r.writeDate === today && <span className="nv-gc-today">TODAY</span>}
              {i === 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  이전대비 <b className="tabular-nums" style={{ color: colorOf(s.goalPriceDiffRate), fontWeight: 800 }}>{signPct(s.goalPriceDiffRate)}</b>
                </span>
              )}
            </div>
            <ResBox r={r} first={i === 0} />
          </li>
        ))}
      </ol>

      <div className="nv-gc-broker">
        <Badge name={s.brokerName} size={22} />
        <span>{s.brokerName}</span>
      </div>
    </a>
  );
}

export default function ResearchSection({ home = false }: { home?: boolean }) {
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [industry, setIndustry] = useState<string>('');
  const { data, error, isLoading } = useSWR<Resp>(`/api/naver/research?direction=${direction}${industry ? `&industry=${industry}` : ''}`, fetcher, { refreshInterval: 30000, keepPreviousData: true });
  const a = data?.analyst;
  const sel = industry || a?.industry || '';
  const today = todayKst();
  const reports = (a?.reports ?? []).slice(0, home ? 5 : 8);
  const sets = (data?.goal.sets ?? []).slice(0, home ? 2 : 10);

  const analyst = (
    <section className="nv-rs-col">
      <SectionTitle big={home} title="최근 1주간 애널리스트들이 집중한 산업" sub={!home && a?.baseDate ? `${a.baseDate} 이후 7일` : undefined} />
      <div className="nv-chips" style={{ marginBottom: 12 }}>
        {(a?.industries ?? []).slice(0, home ? 4 : 12).map((x) => (
          <button key={x.industry} type="button" className={`chip ${sel === x.industry ? 'active' : ''}`} onClick={() => setIndustry(x.industry)}>
            {x.name} <span style={{ opacity: 0.7, fontWeight: 600 }}>{x.count}</span>
          </button>
        ))}
      </div>
      {/* nv-fill: 홈에선 오른쪽 목표주가 카드 높이까지 늘어나 두 열의 박스 아래선이 맞는다 */}
      <div className="fin-card nv-fill" style={{ padding: '4px 16px' }}>
        {error ? <Empty /> : isLoading && !a ? <div className="skeleton" style={{ height: 220, margin: '12px 0' }} /> : reports.length === 0 ? <Empty text="리포트가 없습니다." /> :
          reports.map((r, i) => (
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
  );

  const goal = (
    <section className="nv-rs-col">
      <SectionTitle big={home} title="목표주가 변화가 큰 종목 리서치" live={data?.asOf ?? ''} every={30} sub={!home && data?.goal.writeDate ? `${data.goal.writeDate} 기준` : undefined}
        right={home ? <MoreLink href="/research" /> : undefined} />
      {/* 네이버 배치처럼 제목 아래 칩 줄 — 왼쪽(산업 칩)과 같은 높이에서 박스가 시작된다 */}
      <div className="nv-chips" style={{ marginBottom: 12 }}>
        {([['up', '목표주가 상향'], ['down', '목표주가 하향']] as const).map(([k, l]) => (
          <button key={k} type="button" className={`chip ${direction === k ? 'active' : ''}`} onClick={() => setDirection(k)}>{l}</button>
        ))}
      </div>
      {error ? <div className="fin-card"><Empty /></div> : (
        <div className="nv-rs-cards nv-fill">
          {(isLoading && !data ? Array.from({ length: 2 }) : sets).map((s, i) =>
            s ? <GoalCard key={`${(s as GoalSet).itemCode}-${(s as GoalSet).brokerName}`} s={s as GoalSet} today={today} px={data?.prices?.[(s as GoalSet).itemCode]} /> : <div key={i} className="skeleton" style={{ height: 320, borderRadius: 'var(--r)' }} />)}
        </div>
      )}
      {data && data.goal.sets.length === 0 && <div className="fin-card"><Empty text={`오늘 목표주가 ${direction === 'up' ? '상향' : '하향'} 리포트가 없습니다.`} /></div>}
    </section>
  );

  return (
    <div>
      <div className={home ? 'nv-rs-home' : 'nv-rs-page'}>
        {analyst}
        {goal}
      </div>
      <SourceNote>출처: 네이버페이 증권 리서치(증권사 리포트). 목표주가·투자의견은 <b>각 증권사 애널리스트의 의견</b>을 그대로 옮긴 것으로, 이 앱의 매수·매도 신호가 아닙니다.{!home && ' 리포트 원문은 제목을 누르면 네이버 리서치에서 열립니다.'}</SourceNote>
    </div>
  );
}
