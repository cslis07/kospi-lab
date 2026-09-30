'use client';

/**
 * 홈 중앙 보드 — 큰 지수 차트(라인/캔들 토글, 최고/최저 마커) + 우측 시장현황·52주·투자자 수급.
 * 네이버 금융 데스크탑 홈의 코스피 차트 카드를 우리 데이터로 재구성.
 * 데이터: /api/home/kospi(120초) · /api/home/status(300초) · /api/index/{code}/investor(120초) · /api/home/briefing(헤드라인 칩).
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent). 프로그램매매는 무료 소스 없어 미표시(정직성).
 */
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Fold, { Chevron, useMediaQuery } from './Fold';

interface Candle { d: string; o: number; h: number; l: number; c: number }
interface KospiResp { code: string; candles: Candle[]; value: number; change: number; changeRate: number; week52High: number | null; week52Low: number | null; asOf: string }
interface StatusResp { available: boolean; up: number; flat: number; down: number; date: string }
interface InvestorResp { foreign: number; institution: number; individual: number; date: string; error?: string }
interface BriefResp { headline?: string }

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEok = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n).toLocaleString('ko-KR')}`;
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

/* ── 차트 ────────────────────────────────────────── */
function Chart({ candles, mode }: { candles: Candle[]; mode: 'line' | 'candle' }) {
  const W = 720, H = 300, padL = 8, padR = 60, padT = 24, padB = 22;
  if (candles.length < 2) return <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 12 }} />;

  const highs = candles.map((c) => c.h), lows = candles.map((c) => c.l);
  const max = Math.max(...highs), min = Math.min(...lows), span = max - min || 1;
  const X = (i: number) => padL + (i / (candles.length - 1)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);

  const closes = candles.map((c) => c.c);
  const lineD = closes.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const last = candles[candles.length - 1];
  const lineCol = colorOf(last.c - candles[0].c);

  // 최고/최저 봉 인덱스
  const hiIdx = highs.indexOf(max), loIdx = lows.indexOf(min);
  const cw = Math.max(1.5, ((W - padL - padR) / candles.length) * 0.6);

  // y축 그리드 3줄
  const grid = [0.25, 0.5, 0.75].map((t) => min + span * t);
  // x축 날짜 라벨 5개
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * (candles.length - 1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: 'block', height: 300 }} role="img" aria-label="코스피 차트">
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={Y(g)} y2={Y(g)} stroke="var(--line-2)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={W - padR + 6} y={Y(g) + 3} fontSize={10} fill="var(--faint)">{Math.round(g).toLocaleString()}</text>
        </g>
      ))}
      {/* 현재가 라인 */}
      <line x1={padL} x2={W - padR} y1={Y(last.c)} y2={Y(last.c)} stroke={lineCol} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      <rect x={W - padR} y={Y(last.c) - 8} width={padR} height={16} fill={lineCol} rx={3} />
      <text x={W - padR + padR / 2} y={Y(last.c) + 3} fontSize={9.5} fill="#fff" textAnchor="middle" fontWeight={700}>{fmt(last.c)}</text>

      {mode === 'line' ? (
        <>
          <defs>
            <linearGradient id="kl-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineCol} stopOpacity="0.16" />
              <stop offset="100%" stopColor={lineCol} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${lineD} L${X(candles.length - 1)},${H - padB} L${X(0)},${H - padB} Z`} fill="url(#kl-area)" />
          <path d={lineD} fill="none" stroke={lineCol} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(candles.length - 1)} cy={Y(last.c)} r={3.5} fill={lineCol} />
        </>
      ) : (
        candles.map((c, i) => {
          const col = c.c >= c.o ? 'var(--warn)' : 'var(--accent)';
          const x = X(i);
          const yO = Y(c.o), yC = Y(c.c);
          const top = Math.min(yO, yC), bh = Math.max(1, Math.abs(yC - yO));
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={Y(c.h)} y2={Y(c.l)} stroke={col} strokeWidth={1} />
              <rect x={x - cw / 2} y={top} width={cw} height={bh} fill={col} />
            </g>
          );
        })
      )}

      {/* 최고/최저 마커 */}
      <g>
        <circle cx={X(hiIdx)} cy={Y(max)} r={2.5} fill="var(--warn)" />
        <text x={X(hiIdx)} y={Y(max) - 6} fontSize={10} fill="var(--muted)" textAnchor="middle">최고 {Math.round(max).toLocaleString()}</text>
        <circle cx={X(loIdx)} cy={Y(min)} r={2.5} fill="var(--accent)" />
        <text x={X(loIdx)} y={Y(min) + 14} fontSize={10} fill="var(--muted)" textAnchor="middle">최저 {Math.round(min).toLocaleString()}</text>
      </g>

      {ticks.map((ti, i) => (
        <text key={i} x={X(ti)} y={H - 6} fontSize={9.5} fill="var(--faint)" textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}>
          {candles[ti].d.slice(5)}
        </text>
      ))}
    </svg>
  );
}

/* ── 우측 통계 ───────────────────────────────────── */
function Stat52({ low, high, value }: { low: number; high: number; value: number }) {
  const pct = Math.max(0, Math.min(100, ((value - low) / (high - low || 1)) * 100));
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>52주 최저 · 최고</div>
      <div style={{ position: 'relative', height: 4, borderRadius: 99, background: 'var(--surface-2)' }}>
        <div style={{ position: 'absolute', left: `calc(${pct}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--ink)', border: '2px solid var(--surface)' }} />
      </div>
      <div className="tabular-nums" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        <span>{low.toLocaleString()}</span><span>{high.toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function IndexBoard() {
  const [code, setCode] = useState<'KOSPI' | 'KOSDAQ'>('KOSPI');
  const [mode, setMode] = useState<'line' | 'candle'>('line');
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [open, setOpen] = useState(true);
  const { data: k } = useSWR<KospiResp>(`/api/home/kospi?code=${code}`, fetcher, { refreshInterval: 120000, revalidateOnFocus: false });
  const { data: st } = useSWR<StatusResp>('/api/home/status', fetcher, { refreshInterval: 300000, revalidateOnFocus: false });
  const { data: inv } = useSWR<InvestorResp>(`/api/index/${code}/investor`, fetcher, { refreshInterval: 120000, revalidateOnFocus: false });
  const { data: brief } = useSWR<BriefResp>('/api/home/briefing', fetcher, { revalidateOnFocus: false });

  const value = k?.value ?? 0, change = k?.change ?? 0, rate = k?.changeRate ?? 0;
  const col = colorOf(change);
  const name = code === 'KOSPI' ? '코스피' : '코스닥';

  return (
    <div className="fin-card" style={{ padding: 20 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="seg" style={{ boxShadow: 'var(--pressed)' }}>
          <button className={`seg-i ${code === 'KOSPI' ? 'on' : ''}`} onClick={() => setCode('KOSPI')}>코스피</button>
          <button className={`seg-i ${code === 'KOSDAQ' ? 'on' : ''}`} onClick={() => setCode('KOSDAQ')}>코스닥</button>
        </div>
        {brief?.headline && (
          <span className="fin-chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', maxWidth: '46ch' }}>
            <b style={{ fontWeight: 800, marginRight: 4 }}>AI</b>{brief.headline}
          </span>
        )}
        <div className="seg" style={{ marginLeft: 'auto', boxShadow: 'var(--pressed)' }}>
          <button className={`seg-i ${mode === 'line' ? 'on' : ''}`} onClick={() => setMode('line')}>라인</button>
          <button className={`seg-i ${mode === 'candle' ? 'on' : ''}`} onClick={() => setMode('candle')}>캔들</button>
        </div>
      </div>

      {/* 대표 수치 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }} className="tabular-nums">
          {value ? fmt(value) : '—'}
        </span>
        {value > 0 && (
          <span className="tabular-nums" style={{ fontSize: 15, fontWeight: 700, color: col }}>
            {change > 0 ? '▲' : change < 0 ? '▼' : '·'} {fmt(Math.abs(change))} ({rate >= 0 ? '+' : ''}{rate.toFixed(2)}%)
          </span>
        )}
        <Link href={code === 'KOSPI' ? '/domestic' : '/domestic'} style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--accent)', fontWeight: 600 }}>{name} 시장 →</Link>
        {isMobile && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? '차트 접기' : '차트 펼치기'} aria-expanded={open}
            style={{ marginLeft: 4, width: 32, height: 32, display: 'grid', placeItems: 'center', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
            <Chevron open={open} />
          </button>
        )}
      </div>

      {/* 본문 2단: 차트 + 통계 (모바일은 접힘) */}
      <Fold open={open} enabled={isMobile}>
      <div className="board-grid" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Chart candles={k?.candles ?? []} mode={mode} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingLeft: 4 }}>
          {/* 시장 현황 */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>시장 현황</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              {([['상승', st?.up, 'var(--warn)'], ['보합', st?.flat, 'var(--faint)'], ['하락', st?.down, 'var(--accent)']] as const).map(([lbl, v, c]) => (
                <div key={lbl} style={{ textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--faint)', fontWeight: 600 }}>{lbl}</div>
                  <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 800, color: c, marginTop: 2 }}>{st?.available ? (v ?? 0).toLocaleString() : '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 52주 */}
          {k?.week52High && k?.week52Low ? <Stat52 low={k.week52Low} high={k.week52High} value={value} /> : null}

          {/* 투자자 정보 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>투자자 순매수</span>
              <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>{inv?.date ?? ''} · 억원</span>
            </div>
            {inv && !inv.error ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([['외국인', inv.foreign], ['기관', inv.institution], ['개인', inv.individual]] as const).map(([lbl, v]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>{lbl}</span>
                    <span className="tabular-nums" style={{ fontSize: 14, fontWeight: 700, color: colorOf(v) }}>{fmtEok(v)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--faint)' }}>수급 데이터를 불러오지 못했습니다.</div>
            )}
          </div>
        </div>
      </div>
      </Fold>

      <style jsx>{`
        .board-grid { display: grid; grid-template-columns: 1fr 240px; gap: 20px; align-items: start; }
        @media (max-width: 900px) { .board-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
