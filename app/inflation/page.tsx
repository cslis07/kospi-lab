'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import UnlockGate from '@/components/UnlockGate';
import InflationChartLazy from '@/components/InflationChartLazy';
import BottomSheet from '@/components/ui/BottomSheet';
import {
  compareRows, forecastRows, categorize, topDrivers, pctFrac, pct, signPp,
  sparkCompareRows, gasRanked, metrosByRent, avg,
  type Pulse, type CompareDaily, type Forecast, type Cat, type Compare, type GeoData, type StateRow, type MetroRow,
} from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const SWR_OPT = { revalidateOnFocus: false };

// 상승=빨강 하락=파랑(앱 관행). 물가는 높을수록 빨강.
const sign = (v: number | null | undefined) => (v == null ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : v < 0 ? 'text-blue-400' : 'text-[var(--text)]');

const CAT_STYLE: Record<Cat, string> = {
  식품: 'bg-amber-500/15 text-amber-400',
  주거: 'bg-violet-500/15 text-violet-400',
  연료: 'bg-sky-500/15 text-sky-400',
  기타: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
};

interface Grocery { locked?: boolean; items: { code: string; label: string; latest: { date: string; value: number }; yoy: number; stale?: boolean }[]; asof?: string }
interface Fuel { locked?: boolean; current: number; forward_2wk: number; delta_cents: number; driver_short?: string; source?: string; current_date?: string }
interface FcCurrent {
  locked?: boolean; print_month_label?: string; release_date_label?: string;
  forecast?: number; in_house_model?: number; cleveland_fed?: number; street_consensus?: number; kalshi_implied?: number; prior_print?: number;
}

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  );
}

export default function InflationPage() {
  const { data: pulse } = useSWR<Pulse>('/api/nf/pulse.json', fetcher, SWR_OPT);
  const { data: cmp } = useSWR<CompareDaily>('/api/nf/compare_daily.json', fetcher, SWR_OPT);
  const { data: fc } = useSWR<Forecast>('/api/nf/forecast.json', fetcher, SWR_OPT);
  const { data: fcc } = useSWR<FcCurrent>('/api/nf/forecastCurrent.json', fetcher, SWR_OPT);
  const { data: groc } = useSWR<Grocery>('/api/nf/grocery_basket.json', fetcher, SWR_OPT);
  const { data: fuel } = useSWR<Fuel>('/api/nf/fuel.json', fetcher, SWR_OPT);
  const { data: citems } = useSWR<Compare>('/api/nf/compare.json', fetcher, SWR_OPT);
  const { data: geo } = useSWR<GeoData>('/api/nf/geo.json', fetcher, SWR_OPT);
  const [selComp, setSelComp] = useState<string | null>(null);

  const locked = pulse?.locked || cmp?.locked;

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">실시간 물가 (나우캐스트)</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        미국 소비자물가(CPI)는 한 달에 한 번, 2주 지나 발표됩니다. <b className="text-[var(--text)]">Nowflation</b>은 매일 갱신되는 실시간 추정치(나우캐스트)로
        "공식 CPI가 지금 어디쯤인지"를 먼저 보여줍니다. <b className="text-[var(--text)]">예측·매매 신호가 아니라</b> 물가 흐름을 읽는 맥락 도구입니다.
      </p>

      {locked && <div className="mb-4"><UnlockGate /></div>}

      {!locked && pulse && (
        <>
          {/* 게이지 헤더 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">CPI 게이지(나우캐스트)</p>
                <p className={`text-2xl font-extrabold tabular-nums ${sign(pulse.gap?.gauge_yoy)}`}>{pct(pulse.gap?.gauge_yoy)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">YoY · {pulse.asof ?? pulse.gauge?.date}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">공식 CPI</p>
                <p className={`text-2xl font-extrabold tabular-nums ${sign(pulse.gap?.official_yoy)}`}>{pct(pulse.gap?.official_yoy)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{pulse.gap?.official_month} 기준 · 근원 {pct(pulse.official?.core_yoy, 1)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-muted)]">격차(게이지−공식)</p>
                <p className={`text-2xl font-extrabold tabular-nums ${sign(pulse.gap?.current_pp)}`}>{signPp(pulse.gap?.current_pp)}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">실시간이 공식보다 {pulse.gap?.current_pp != null && pulse.gap.current_pp >= 0 ? '높음' : '낮음'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-[var(--border)] text-[11px] tabular-nums">
              <span className="text-[var(--text-muted)]">전일 <b className={sign(pulse.gauge?.dod_pp)}>{signPp(pulse.gauge?.dod_pp)}</b></span>
              <span className="text-[var(--text-muted)]">전주 <b className={sign(pulse.gauge?.wow_pp)}>{signPp(pulse.gauge?.wow_pp)}</b></span>
              <span className="text-[var(--text-muted)]">전월 <b className={sign(pulse.gauge?.mom_pp)}>{signPp(pulse.gauge?.mom_pp)}</b></span>
            </div>
            {pulse.narrative?.body && (
              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                {pulse.narrative.tag && <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] mb-1">{pulse.narrative.tag}</span>}
                <p className="text-[12px] text-[var(--text)] leading-relaxed">{pulse.narrative.body}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Nowflation 모델 요약(번역 아님). 참고용.</p>
              </div>
            )}
          </div>

          {/* 공식 vs 나우캐스트 추이 */}
          <Card title="공식 CPI vs 실시간 나우캐스트">
            <InflationChartLazy kind="compare" rows={compareRows(cmp)} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
              월별 YoY(%). <span style={{ color: '#1c6cff' }}>■</span> 나우캐스트(매일 갱신·발표 전 추정) vs <span style={{ color: '#f59e0b' }}>■</span> 공식 CPI(BLS 발표치).
              {cmp?.summary?.gauge?.mae != null && <> 과거 공식 대비 평균 오차 ±{cmp.summary.gauge.mae.toFixed(2)}%p{cmp.summary.gauge.last6_mae != null ? `(최근 6회 ±${cmp.summary.gauge.last6_mae.toFixed(2)}%p)` : ''}.</>}
            </p>
          </Card>

          {/* 품목별 기여 */}
          <Card title="품목별 기여" aside={<span className="text-[10px] text-[var(--text-muted)]">막대 클릭 → 공식 대비 추이</span>}>
            <DriverBars pulse={pulse} selected={selComp} onSelect={(c) => setSelComp(c === selComp ? null : c)} />
            {selComp && citems && !citems.locked && <DrilldownPanel comp={selComp} citems={citems} onClose={() => setSelComp(null)} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              {/* 식품 바스켓 */}
              <div className="rounded-xl border border-[var(--border)] p-3">
                <p className="text-[12px] font-semibold text-amber-400 mb-2">식품 바스켓{groc?.asof ? ` · ${groc.asof}` : ''}</p>
                {groc?.items?.length ? (
                  <ul className="space-y-1">
                    {groc.items.map((it) => (
                      <li key={it.code} className="flex items-center justify-between text-[11px] tabular-nums">
                        <span className="text-[var(--text)] truncate pr-2">{it.label}</span>
                        <span className="shrink-0"><span className="text-[var(--text-muted)]">${it.latest?.value?.toFixed(2)} · </span><b className={sign(it.yoy)}>{pctFrac(it.yoy, 1)}</b></span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[11px] text-[var(--text-muted)]">불러오는 중…</p>}
              </div>
              {/* 연료 */}
              <div className="rounded-xl border border-[var(--border)] p-3">
                <p className="text-[12px] font-semibold text-sky-400 mb-2">연료(휘발유)</p>
                {fuel && !fuel.locked ? (
                  <div className="text-[12px] tabular-nums space-y-1">
                    <p><span className="text-[var(--text-muted)]">현재 펌프가 </span><b className="text-[var(--text)]">${fuel.current?.toFixed(3)}</b><span className="text-[var(--text-muted)]">/gal</span></p>
                    <p><span className="text-[var(--text-muted)]">2주 전망 </span><b className={sign(fuel.delta_cents)}>${fuel.forward_2wk?.toFixed(3)}</b> <span className={`text-[11px] ${sign(fuel.delta_cents)}`}>({fuel.delta_cents >= 0 ? '+' : ''}{fuel.delta_cents?.toFixed(1)}¢)</span></p>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">선행: {fuel.driver_short}. 출처 {fuel.source}.</p>
                  </div>
                ) : <p className="text-[11px] text-[var(--text-muted)]">불러오는 중…</p>}
              </div>
            </div>
          </Card>

          {/* 지역별 물가(미국) */}
          <Card title="지역별 물가 (미국)" aside={geo?.asof ? <span className="text-[10px] text-[var(--text-muted)]">{geo.asof}</span> : undefined}>
            {geo && !geo.locked ? <GeoSection geo={geo} /> : <p className="text-[11px] text-[var(--text-muted)]">불러오는 중…</p>}
          </Card>

          {/* 예측 */}
          <Card title="다음 CPI 예측" aside={fcc?.release_date_label ? <span className="text-[10px] text-[var(--text-muted)]">발표 {fcc.release_date_label}</span> : undefined}>
            {fcc && !fcc.locked && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {([
                  ['Nowflation', fcc.forecast],
                  ['자체 모델', fcc.in_house_model],
                  ['클리블랜드 연준', fcc.cleveland_fed],
                  ['월가 컨센서스', fcc.street_consensus],
                  ['Kalshi(시장)', fcc.kalshi_implied],
                  ['직전 발표', fcc.prior_print],
                ] as [string, number | undefined][]).map(([label, v]) => (
                  <div key={label} className="rounded-xl border border-[var(--border)] p-2.5">
                    <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
                    <p className={`text-base font-bold tabular-nums ${sign(v)}`}>{pct(v)}</p>
                  </div>
                ))}
              </div>
            )}
            {fcc?.print_month_label && <p className="text-[11px] text-[var(--text-muted)] mb-2">{fcc.print_month_label} CPI YoY 전망.</p>}
            <InflationChartLazy kind="forecast" rows={forecastRows(fc)} />
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
              <span style={{ color: '#1c6cff' }}>■</span> 실측/모델 예측(점선, 범위 음영) · <span style={{ color: '#f59e0b' }}>■</span> 공식 투영(점선).
              {fc?.disclaimer ? ` ${fc.disclaimer}` : ' 모델 추정치이며 매매 신호가 아닙니다.'}
            </p>
          </Card>

          <div className="flex gap-2 text-[11px] mb-2">
            <Link href="/macro" className="font-semibold text-[var(--accent-ink)]">경제지표(FRED) →</Link>
            <Link href="/releases" className="font-semibold text-[var(--accent-ink)]">발표 이력 →</Link>
          </div>
        </>
      )}

      {!locked && !pulse && (
        <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">불러오는 중…</p>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        출처: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> (Creative Commons Attribution 4.0, 중계). 공식 CPI는 미 노동통계국(BLS) 발표치, 나우캐스트는 실시간 추정치입니다.
        예측·투자 권유가 아니며, 지표 서프라이즈로 방향을 맞히는 우위는 이 앱의 측정에서 확인되지 않았습니다.
      </p>
    </div>
  );
}

function DriverBars({ pulse, selected, onSelect }: { pulse: Pulse; selected: string | null; onSelect: (c: string) => void }) {
  const ds = topDrivers(pulse.drivers, 10);
  if (!ds.length) return <p className="text-[11px] text-[var(--text-muted)]">불러오는 중…</p>;
  const maxAbs = Math.max(...ds.map((d) => Math.abs(d.contribution_bps)), 1);
  return (
    <ul className="space-y-1">
      {ds.map((d) => {
        const cat = categorize(d.component);
        const w = Math.round((Math.abs(d.contribution_bps) / maxAbs) * 100);
        const up = d.yoy >= 0;
        const on = selected === d.component;
        return (
          <li key={d.component}>
            <button type="button" onClick={() => onSelect(d.component)}
              className={`w-full text-left text-[11px] rounded-lg px-1.5 py-1 transition-colors ${on ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]/50'}`}>
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded ${CAT_STYLE[cat]}`}>{cat}</span>
                  <span className="text-[var(--text)] truncate">{d.label}</span>
                </span>
                <span className="shrink-0 tabular-nums"><b className={sign(d.yoy)}>{pctFrac(d.yoy, 1)}</b> <span className="text-[var(--text-muted)]">({d.contribution_bps >= 0 ? '+' : ''}{d.contribution_bps.toFixed(0)}bp)</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div className={`h-full rounded-full ${up ? 'bg-red-400/70' : 'bg-blue-400/70'}`} style={{ width: `${w}%` }} />
              </div>
            </button>
          </li>
        );
      })}
      <p className="text-[10px] text-[var(--text-muted)] pt-1">막대 길이 = CPI 기여도(절대값). 빨강=물가 상승 기여, 파랑=하락 기여. <b className="text-[var(--text)]">항목을 누르면</b> 공식(BLS) 대비 추이가 열립니다.</p>
    </ul>
  );
}

function DrilldownPanel({ comp, citems, onClose }: { comp: string; citems: Compare; onClose: () => void }) {
  const tile = citems.tiles?.find((t) => t.component === comp);
  const rows = sparkCompareRows(citems.sparks?.[comp], citems.month);
  if (!tile && !rows.length) return null;
  const spreadPp = tile ? tile.spread * 100 : null; // 분수→pp
  return (
    <div className="mt-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--surface-2)]/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[12px] font-semibold text-[var(--text)]">{tile?.label ?? comp} — 공식(BLS) 대비</p>
        <button type="button" onClick={onClose} className="text-[11px] text-[var(--text-muted)] shrink-0">닫기 ✕</button>
      </div>
      {tile && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums mb-1">
          <span><span className="text-[var(--text-muted)]">나우캐스트 </span><b className={sign(tile.yoy)}>{pctFrac(tile.yoy, 1)}</b></span>
          <span><span className="text-[var(--text-muted)]">공식 BLS </span><b className="text-[var(--text)]">{pctFrac(tile.bls_yoy, 1)}</b></span>
          {spreadPp != null && <span><span className="text-[var(--text-muted)]">격차 </span><b className={sign(spreadPp)}>{signPp(spreadPp, 2)}</b></span>}
          <span className="text-[var(--text-muted)]">비중 {pctFrac(tile.weight, 1)}</span>
        </div>
      )}
      {rows.length ? <InflationChartLazy kind="compare" rows={rows} height={180} /> : <p className="text-[11px] text-[var(--text-muted)]">이 품목은 추이 데이터가 없습니다.</p>}
      <p className="text-[10px] text-[var(--text-muted)] mt-1">12개월 YoY(%). 나우캐스트(ours)와 공식(BLS) 발표치 비교.</p>
    </div>
  );
}

function GeoSection({ geo }: { geo: GeoData }) {
  const [allOpen, setAllOpen] = useState(false);
  const gas = gasRanked(geo.states);
  const gasAvg = avg(gas.map((s) => s.gas));
  const topGas = gas.slice(0, 6);
  const rents = metrosByRent(geo.metros).slice(0, 8);
  return (
    <>
      <div className="flex justify-end mb-2">
        <button type="button" onClick={() => setAllOpen(true)} className="text-[11px] font-semibold text-[var(--accent-ink)]">
          전체 보기 (주 {geo.states?.length ?? 0}·도시 {geo.metros?.length ?? 0}) →
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 주별 휘발유·전기 */}
        <div className="rounded-xl border border-[var(--border)] p-3">
          <p className="text-[12px] font-semibold text-sky-400 mb-1.5">주별 휘발유 (높은 순)</p>
          {gasAvg != null && <p className="text-[10px] text-[var(--text-muted)] mb-1.5">전국 평균 ${gasAvg.toFixed(3)}/gal · {gas.length}개 주</p>}
          <ul className="space-y-1">
            {topGas.map((s) => (
              <li key={s.state} className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-[var(--text)] truncate pr-2">{s.name}</span>
                <span className="shrink-0"><b className="text-[var(--text)]">${s.gas?.toFixed(3)}</b>{s.elec_yoy != null && <span className="text-[var(--text-muted)]"> · 전기 <b className={sign(s.elec_yoy)}>{pctFrac(s.elec_yoy, 1)}</b></span>}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* 도시 임대료 */}
        <div className="rounded-xl border border-[var(--border)] p-3">
          <p className="text-[12px] font-semibold text-violet-400 mb-1.5">도시 임대료 (높은 순)</p>
          <ul className="space-y-1">
            {rents.map((m) => (
              <li key={m.metro} className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-[var(--text)] truncate pr-2">{m.metro}</span>
                <span className="shrink-0"><b className="text-[var(--text)]">${m.rent?.toLocaleString()}</b> <span className={sign(m.yoy)}>{pctFrac(m.yoy, 1)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <GeoAllSheet geo={geo} open={allOpen} onClose={() => setAllOpen(false)} />
    </>
  );
}

function GeoAllSheet({ geo, open, onClose }: { geo: GeoData; open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'states' | 'metros'>('states');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('gas');
  const selectTab = (t: 'states' | 'metros') => { setTab(t); setSort(t === 'states' ? 'gas' : 'rent'); setQ(''); };
  const kw = q.trim().toLowerCase();

  let states: StateRow[] = (geo.states ?? []).filter((s) => typeof s.gas === 'number' || typeof s.elec_cents === 'number');
  if (kw) states = states.filter((s) => `${s.name} ${s.state}`.toLowerCase().includes(kw));
  states = [...states].sort((x, y) =>
    sort === 'gasAsc' ? (x.gas ?? 1e9) - (y.gas ?? 1e9)
      : sort === 'elec' ? (y.elec_yoy ?? -1e9) - (x.elec_yoy ?? -1e9)
        : sort === 'name' ? x.name.localeCompare(y.name)
          : (y.gas ?? -1e9) - (x.gas ?? -1e9));

  let metros: MetroRow[] = (geo.metros ?? []).filter((m) => typeof m.rent === 'number');
  if (kw) metros = metros.filter((m) => m.metro.toLowerCase().includes(kw));
  metros = [...metros].sort((x, y) =>
    sort === 'rentAsc' ? (x.rent ?? 1e9) - (y.rent ?? 1e9)
      : sort === 'yoy' ? (y.yoy ?? -1e9) - (x.yoy ?? -1e9)
        : sort === 'name' ? x.metro.localeCompare(y.metro)
          : (y.rent ?? -1e9) - (x.rent ?? -1e9));

  const SORTS: [string, string][] = tab === 'states'
    ? [['gas', '휘발유↓'], ['gasAsc', '휘발유↑'], ['elec', '전기YoY↓'], ['name', '이름순']]
    : [['rent', '임대료↓'], ['rentAsc', '임대료↑'], ['yoy', 'YoY↓'], ['name', '이름순']];

  const seg = (on: boolean) => `px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${on ? 'border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent-ink)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`;

  return (
    <BottomSheet open={open} onClose={onClose} title="지역별 물가 — 전체">
      <div className="flex gap-1.5 mb-2">
        <button type="button" className={seg(tab === 'states')} onClick={() => selectTab('states')}>주별 휘발유·전기</button>
        <button type="button" className={seg(tab === 'metros')} onClick={() => selectTab('metros')}>도시 임대료</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'states' ? '주 이름 검색(영문)' : '도시 검색(영문)'}
        className="w-full mb-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]" />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {SORTS.map(([k, l]) => <button key={k} type="button" className={seg(sort === k)} onClick={() => setSort(k)}>{l}</button>)}
      </div>
      {tab === 'states' ? (
        <ul className="divide-y divide-[var(--border)]/60">
          {states.map((s) => (
            <li key={s.state} className="flex items-center justify-between py-1.5 text-[12px] tabular-nums">
              <span className="text-[var(--text)] truncate pr-2">{s.name}</span>
              <span className="shrink-0"><b className="text-[var(--text)]">${s.gas?.toFixed(3)}</b><span className="text-[var(--text-muted)]">/gal{s.elec_yoy != null && <> · 전기 <b className={sign(s.elec_yoy)}>{pctFrac(s.elec_yoy, 1)}</b></>}</span></span>
            </li>
          ))}
          {states.length === 0 && <li className="py-3 text-center text-[12px] text-[var(--text-muted)]">검색 결과 없음</li>}
        </ul>
      ) : (
        <ul className="divide-y divide-[var(--border)]/60">
          {metros.map((m) => (
            <li key={m.metro} className="flex items-center justify-between py-1.5 text-[12px] tabular-nums">
              <span className="text-[var(--text)] truncate pr-2">{m.metro}</span>
              <span className="shrink-0"><b className="text-[var(--text)]">${m.rent?.toLocaleString()}</b> <span className={sign(m.yoy)}>{pctFrac(m.yoy, 1)}</span></span>
            </li>
          ))}
          {metros.length === 0 && <li className="py-3 text-center text-[12px] text-[var(--text-muted)]">검색 결과 없음</li>}
        </ul>
      )}
      <p className="text-[10px] text-[var(--text-muted)] mt-2">출처 Nowflation(CC BY). 휘발유=주 평균 펌프가($/gal), 전기=YoY, 임대료=중위 월세($)·YoY.</p>
    </BottomSheet>
  );
}
