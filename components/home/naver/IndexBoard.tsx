'use client';

/**
 * 홈 중앙 보드 — 국내 지수(코스피/코스닥) 실시간 차트 + 시장현황.
 *  · 기간: 1일(당일 분봉, 30초 갱신) · 1개월 · 3개월 · 1년(일봉). 라인/캔들(1일 캔들은 5분봉으로 묶음).
 *  · 호버(마우스·터치 드래그): 십자선 + 툴팁(시각·가격·등락·시고저).
 *  · 차트는 컨테이너 실측 폭으로 그린다(preserveAspectRatio=none 의 글자 늘어짐 제거).
 *  · 우측: 시장현황(실시간 상승·보합·하락, 상/하한) · 52주 · 투자자 순매수 · 프로그램 매매 — 전부 /api/home/board.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent). 모바일(<1024)은 본문 접기(Fold).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Fold, { Chevron, useMediaQuery } from './Fold';

interface Pt { x: string; o: number; h: number; l: number; c: number }
interface Live { value: number; change: number; changeRate: number; live: boolean; tradedAt: string }
interface BoardResp {
  code: string; range: string; tradingDate: string | null;
  live: Live | null; prevClose: number; points: Pt[];
  week52High: number | null; week52Low: number | null;
  upDown: { up: number; upper: number; flat: number; down: number; lower: number } | null;
  investor: { date: string; foreign: number; institution: number; individual: number } | null;
  program: { date: string; total: number; arbitrage: number; nonArbitrage: number } | null;
}
interface BriefResp { providers?: { ok: boolean; brief?: { headline: string } }[] }

type Range = '1d' | '1m' | '3m' | '1y';
const RANGES: [Range, string][] = [['1d', '1일'], ['1m', '1개월'], ['3m', '3개월'], ['1y', '1년']];

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtEok = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')}`;
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

/** 1일 캔들용 5분봉 집계 */
function bucket(points: Pt[], size: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += size) {
    const g = points.slice(i, i + size);
    out.push({ x: g[0].x, o: g[0].o, h: Math.max(...g.map((p) => p.h)), l: Math.min(...g.map((p) => p.l)), c: g[g.length - 1].c });
  }
  return out;
}

function xLabel(x: string, range: Range) {
  if (range === '1d') return x;                       // HH:mm
  if (range === '1y') return `${x.slice(2, 4)}.${x.slice(5, 7)}`; // YY.MM
  return `${x.slice(5, 7)}.${x.slice(8, 10)}`;         // MM.DD
}

/* ── 인터랙티브 차트 ─────────────────────────────── */
// 높이는 CSS(.nv-board-chart: 모바일 250 · PC 310)가 정하고 여기선 실측만 — JS 폭 판별 전후로 높이가 바뀌지 않게
function Chart({ points, mode, range, prevClose }: { points: Pt[]; mode: 'line' | 'candle'; range: Range; prevClose: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { setW(Math.round(e.contentRect.width)); setH(Math.round(e.contentRect.height)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => (mode === 'candle' && range === '1d' ? bucket(points, 5) : points), [points, mode, range]);
  useEffect(() => setHover(null), [data]);

  const H = h || 250, padL = 6, padR = 66, padT = 24, padB = 34;
  const n = data.length;
  const ready = w > 0 && h > 0 && n >= 2;

  // 기준값: 1일 = 전일 종가, 그 외 = 기간 첫 종가
  const base = range === '1d' && prevClose ? prevClose : n ? data[0].c : 0;
  const hiV = n ? Math.max(...data.map((p) => p.h), range === '1d' && prevClose ? prevClose : -Infinity) : 0;
  const loV = n ? Math.min(...data.map((p) => p.l), range === '1d' && prevClose ? prevClose : Infinity) : 0;
  const padV = (hiV - loV) * 0.06 || 1;
  const max = hiV + padV, min = loV - padV, span = max - min || 1;
  const plotW = Math.max(1, w - padL - padR);
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const Y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);

  const last = n ? data[n - 1] : null;
  const lineCol = last ? colorOf(last.c - base) : 'var(--faint)';
  const hiIdx = n ? data.findIndex((p) => p.h === Math.max(...data.map((q) => q.h))) : 0;
  const loIdx = n ? data.findIndex((p) => p.l === Math.min(...data.map((q) => q.l))) : 0;
  const grid = [0.2, 0.4, 0.6, 0.8].map((t) => min + span * t);
  const ticks = n ? [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * (n - 1))) : [];
  const cw = Math.max(1.2, (plotW / Math.max(1, n)) * 0.62);

  const onMove = (e: React.PointerEvent) => {
    if (!ready) return;
    const r = wrap.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - padL) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hp = hover != null ? data[hover] : null;
  const hpPrev = hover != null ? (range === '1d' ? base : hover > 0 ? data[hover - 1].c : data[hover].o) : 0;
  const hpChg = hp ? hp.c - hpPrev : 0;

  const clampX = (x: number, anchorW: number) => Math.max(padL + anchorW / 2, Math.min(w - padR - anchorW / 2, x));

  return (
    <div ref={wrap} className="nv-board-chart" style={{ position: 'relative', width: '100%', touchAction: 'pan-y', userSelect: 'none' }}
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      {!ready ? (
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 12 }} />
      ) : (
        <svg width={w} height={H} style={{ display: 'block' }} role="img" aria-label="지수 차트">
          <defs>
            <linearGradient id="kl-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineCol} stopOpacity="0.18" />
              <stop offset="100%" stopColor={lineCol} stopOpacity="0" />
            </linearGradient>
          </defs>

          {grid.map((g, i) => (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={Y(g)} y2={Y(g)} stroke="var(--line-2)" strokeWidth={1} />
              <text x={w - padR + 8} y={Y(g) + 3.5} fontSize={10.5} fill="var(--faint)">{fmt0(g)}</text>
            </g>
          ))}

          {/* 1일: 전일 종가 기준선 */}
          {range === '1d' && prevClose > 0 && (
            <g>
              <line x1={padL} x2={w - padR} y1={Y(prevClose)} y2={Y(prevClose)} stroke="var(--faint)" strokeWidth={1} strokeDasharray="3 3" />
              <text x={padL + 2} y={Y(prevClose) - 4} fontSize={10} fill="var(--faint)">전일 {fmt(prevClose)}</text>
            </g>
          )}

          {mode === 'line' ? (
            <>
              <path d={`${data.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join(' ')} L${X(n - 1)},${H - padB} L${X(0)},${H - padB} Z`} fill="url(#kl-area)" />
              <path d={data.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join(' ')} fill="none" stroke={lineCol} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            data.map((p, i) => {
              const col = p.c >= p.o ? 'var(--warn)' : 'var(--accent)';
              const top = Math.min(Y(p.o), Y(p.c)), bh = Math.max(1, Math.abs(Y(p.c) - Y(p.o)));
              return (
                <g key={i}>
                  <line x1={X(i)} x2={X(i)} y1={Y(p.h)} y2={Y(p.l)} stroke={col} strokeWidth={1} />
                  <rect x={X(i) - cw / 2} y={top} width={cw} height={bh} fill={col} />
                </g>
              );
            })
          )}

          {/* 최고/최저 — 라벨은 차트 안쪽으로 고정(잘림·축 라벨 겹침 방지) */}
          {(() => {
            const hx = X(hiIdx), lx = X(loIdx);
            const anc = (x: number) => (x < padL + 50 ? 'start' : x > w - padR - 50 ? 'end' : 'middle');
            return (
              <g fontSize={10.5} fill="var(--muted)">
                <circle cx={hx} cy={Y(data[hiIdx].h)} r={2.5} fill="var(--warn)" />
                <text x={hx} y={Math.max(11, Y(data[hiIdx].h) - 7)} textAnchor={anc(hx)}>최고 {fmt(data[hiIdx].h)}</text>
                <circle cx={lx} cy={Y(data[loIdx].l)} r={2.5} fill="var(--accent)" />
                <text x={lx} y={Math.min(H - padB + 12, Y(data[loIdx].l) + 14)} textAnchor={anc(lx)}>최저 {fmt(data[loIdx].l)}</text>
              </g>
            );
          })()}

          {/* 현재가 태그 */}
          {last && (
            <g>
              <line x1={padL} x2={w - padR} y1={Y(last.c)} y2={Y(last.c)} stroke={lineCol} strokeWidth={1} strokeDasharray="2 3" opacity={0.55} />
              <rect x={w - padR + 2} y={Y(last.c) - 9} width={padR - 4} height={18} rx={4} fill={lineCol} />
              <text x={w - padR / 2} y={Y(last.c) + 3.8} fontSize={10.5} fontWeight={700} fill="#fff" textAnchor="middle">{fmt(last.c)}</text>
            </g>
          )}

          {ticks.map((ti, i) => (
            <text key={i} x={X(ti)} y={H - 10} fontSize={10.5} fill="var(--faint)" textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}>
              {xLabel(data[ti].x, range)}
            </text>
          ))}

          {/* 호버 십자선 */}
          {hp && hover != null && (
            <g pointerEvents="none">
              <line x1={X(hover)} x2={X(hover)} y1={padT - 6} y2={H - padB} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <line x1={padL} x2={w - padR} y1={Y(hp.c)} y2={Y(hp.c)} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" opacity={0.35} />
              <circle cx={X(hover)} cy={Y(hp.c)} r={4.5} fill={colorOf(hpChg)} stroke="var(--surface)" strokeWidth={2} />
              <rect x={clampX(X(hover), 64) - 32} y={H - padB + 4} width={64} height={18} rx={4} fill="var(--ink)" />
              <text x={clampX(X(hover), 64)} y={H - padB + 16.5} fontSize={10.5} fontWeight={700} fill="var(--bg)" textAnchor="middle">{xLabel(hp.x, range)}</text>
            </g>
          )}
        </svg>
      )}

      {/* 툴팁(HTML) */}
      {ready && hp && hover != null && (() => {
        const tipW = 168;
        const left = X(hover) + 14 + tipW > w - padR ? X(hover) - 14 - tipW : X(hover) + 14;
        const showOhlc = mode === 'candle' || range !== '1d';
        const row = (k: string, v: string, c?: string) => (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ color: 'var(--faint)' }}>{k}</span><b className="tabular-nums" style={{ fontWeight: 700, color: c ?? 'var(--ink)' }}>{v}</b>
          </div>
        );
        return (
          <div style={{
            position: 'absolute', top: padT, left: Math.max(0, left), width: tipW, pointerEvents: 'none',
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--neo)',
            padding: '8px 10px', fontSize: 11.5, lineHeight: 1.65, zIndex: 2,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 2 }}>
              {range === '1d' ? `${hp.x}` : hp.x}
            </div>
            {row(range === '1d' ? '지수' : '종가', fmt(hp.c))}
            {row(range === '1d' ? '전일대비' : '전일대비', `${hpChg >= 0 ? '+' : ''}${fmt(hpChg)} (${hpPrev ? ((hpChg / hpPrev) * 100).toFixed(2) : '0.00'}%)`, colorOf(hpChg))}
            {showOhlc && (<>
              {row('시가', fmt(hp.o))}
              {row('고가', fmt(hp.h), 'var(--warn)')}
              {row('저가', fmt(hp.l), 'var(--accent)')}
            </>)}
          </div>
        );
      })()}
    </div>
  );
}

/* ── 우측 통계 ───────────────────────────────────── */
function Stat52({ low, high, value }: { low: number; high: number; value: number }) {
  const pct = Math.max(0, Math.min(100, ((value - low) / (high - low || 1)) * 100));
  return (
    <div>
      <div className="bd-k">52주 최저 · 최고</div>
      <div style={{ position: 'relative', height: 4, borderRadius: 99, background: 'var(--surface-2)', marginTop: 10 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 99, background: 'color-mix(in srgb, var(--accent) 35%, transparent)' }} />
        <div style={{ position: 'absolute', left: `calc(${pct}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--ink)', border: '2px solid var(--surface)' }} />
      </div>
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        <span>{fmt(low)}</span><span>{fmt(high)}</span>
      </div>
    </div>
  );
}

function Trio({ title, sub, items }: { title: string; sub?: string; items: [string, number][] }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="bd-k">{title}</span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>{sub}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
        {items.map(([k, v]) => (
          <div key={k} style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 600 }}>{k}</div>
            <div className="tabular-nums" style={{ fontSize: 14.5, fontWeight: 800, color: colorOf(v), marginTop: 2, whiteSpace: 'nowrap' }}>{fmtEok(v)}억</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IndexBoard() {
  const [code, setCode] = useState<'KOSPI' | 'KOSDAQ'>('KOSPI');
  const [range, setRange] = useState<Range>('1d');
  const [mode, setMode] = useState<'line' | 'candle'>('line');
  const isMobile = useMediaQuery('(max-width: 1023px)', true);
  const [open, setOpen] = useState(true);

  const { data: b } = useSWR<BoardResp>(`/api/home/board?code=${code}&range=${range}`, fetcher, {
    refreshInterval: range === '1d' ? 30000 : 300000, revalidateOnFocus: true, keepPreviousData: true,
  });
  const { data: brief } = useSWR<BriefResp>('/api/home/briefing?tab=kr', fetcher, { revalidateOnFocus: false });
  const headline = brief?.providers?.find((p) => p.ok && p.brief)?.brief?.headline;

  const live = b?.live;
  const value = live?.value ?? 0, change = live?.change ?? 0, rate = live?.changeRate ?? 0;
  const name = code === 'KOSPI' ? '코스피' : '코스닥';
  const ud = b?.upDown;

  return (
    <div className="fin-card" style={{ padding: 20 }}>
      {/* 헤더: 지수 · AI 칩 · 기간 · 차트형태 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="seg">
          <button className={`seg-i ${code === 'KOSPI' ? 'on' : ''}`} onClick={() => setCode('KOSPI')}>코스피</button>
          <button className={`seg-i ${code === 'KOSDAQ' ? 'on' : ''}`} onClick={() => setCode('KOSDAQ')}>코스닥</button>
        </div>
        {headline ? (
          <span className="fin-chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', maxWidth: '100%', fontSize: 11.5, padding: '5px 10px' }}>
            <b style={{ fontWeight: 800, marginRight: 4 }}>AI</b>{headline}
          </span>
        ) : brief === undefined ? (
          // 요약 도착 전 칩 자리(모바일에선 한 줄을 차지해 도착 순간 아래가 밀렸다)
          <span className="fin-chip skeleton" aria-hidden style={{ width: '62%', height: 27, padding: 0 }} />
        ) : null}
      </div>

      {/* 대표 수치 — 왼쪽(값·등락·상태)은 안에서 줄바꿈, 오른쪽(링크·접기)은 같은 줄 고정 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 10px', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }} className="tabular-nums">
            {value ? fmt(value) : '—'}
          </span>
          {value > 0 && (
            <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: colorOf(change), whiteSpace: 'nowrap' }}>
              {change > 0 ? '▲' : change < 0 ? '▼' : '·'} {fmt(Math.abs(change))} ({rate >= 0 ? '+' : ''}{rate.toFixed(2)}%)
            </span>
          )}
          {live && <span className={`idx-live${live.live ? ' on' : ''}`}><i />{live.live ? '실시간' : '장마감'}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <Link href="/domestic" style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>{name} 시장 →</Link>
          <button type="button" className="nv-m-only" onClick={() => setOpen((o) => !o)} aria-label={open ? '차트 접기' : '차트 펼치기'} aria-expanded={open}
            style={{ width: 32, height: 32, placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
            <Chevron open={open} />
          </button>
        </div>
      </div>

      <Fold open={open} enabled={isMobile}>
        {/* 기간 · 차트형태 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div className="seg">
            {RANGES.map(([k, l]) => <button key={k} className={`seg-i ${range === k ? 'on' : ''}`} onClick={() => setRange(k)}>{l}</button>)}
          </div>
          <div className="seg" style={{ marginLeft: 'auto' }}>
            <button className={`seg-i ${mode === 'line' ? 'on' : ''}`} onClick={() => setMode('line')}>라인</button>
            <button className={`seg-i ${mode === 'candle' ? 'on' : ''}`} onClick={() => setMode('candle')}>캔들</button>
          </div>
        </div>

        <div className="board-grid" style={{ marginTop: 10 }}>
          <div style={{ minWidth: 0 }}>
            <Chart points={b?.points ?? []} mode={mode} range={range} prevClose={b?.prevClose ?? 0} />
            {/* 안내 줄은 데이터 전에도 자리를 잡는다(도착 순간 아래가 밀리지 않게) */}
            {range === '1d' && (
              <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 2, minHeight: 15 }}>{b?.tradingDate ? `${b.tradingDate} 분봉 · 30초마다 갱신 · 차트에 마우스(터치)를 대면 값 표시` : ' '}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 시장 현황 — 실시간 */}
            <div>
              <div className="bd-k">시장 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                {([['상승', ud?.up, ud?.upper, 'var(--warn)'], ['보합', ud?.flat, null, 'var(--faint)'], ['하락', ud?.down, ud?.lower, 'var(--accent)']] as const).map(([k, v, lim, c]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 600 }}>{k}</div>
                    <div className="tabular-nums" style={{ fontSize: 17, fontWeight: 800, color: c, marginTop: 2 }}>
                      {ud ? (v ?? 0).toLocaleString() : '—'}
                      {ud && lim != null && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>({lim})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 데이터 전엔 실제와 같은 높이(52주 58 · 투자자/프로그램 63px 실측)의 자리 — 첫 방문 CLS 0.27의 원인이었다 */}
            {!b ? (
              <>
                <div className="skeleton" style={{ height: 58, borderRadius: 10 }} />
                <div className="skeleton" style={{ height: 63, borderRadius: 10 }} />
                <div className="skeleton" style={{ height: 63, borderRadius: 10 }} />
              </>
            ) : (
              <>
                {b.week52High && b.week52Low ? <Stat52 low={b.week52Low} high={b.week52High} value={value} /> : null}
                {b.investor && (
                  <Trio title="투자자 순매수" sub={`${b.investor.date}`}
                    items={[['외국인', b.investor.foreign], ['기관', b.investor.institution], ['개인', b.investor.individual]]} />
                )}
                {b.program && (
                  <Trio title="프로그램 매매" items={[['전체', b.program.total], ['차익', b.program.arbitrage], ['비차익', b.program.nonArbitrage]]} />
                )}
              </>
            )}
          </div>
        </div>
      </Fold>

      <style jsx>{`
        .board-grid { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 22px; align-items: start; }
        @media (max-width: 900px) { .board-grid { grid-template-columns: 1fr; } }
        .board-grid :global(.bd-k) { font-size: 12.5px; color: var(--ink); font-weight: 700; }
      `}</style>
    </div>
  );
}
