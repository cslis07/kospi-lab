'use client';

/**
 * 상세 화면 가격 차트 카드(해외·코인 공용) — 기간 세그먼트 + 지표는 바텀시트로 숨기고 켜진 것만 범례.
 * 영역 색은 한국 관행(상승=빨강·하락=파랑). 국내 종목 상세는 BB·RSI·비교가 있는 자체 차트를 쓴다.
 */
import { useId, useMemo, useState } from 'react';
import { ComposedChart, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import BottomSheet from '@/components/ui/BottomSheet';
import { calcMA } from '@/lib/indicators';

export const TIMEFRAMES = [
  { label: '1개월', months: 1 },
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년',   months: 12 },
];
const UP = '#f04452';
const DOWN = '#3182f6';

interface Pt { date: string; price: number; volume?: number }

export default function PriceChart({
  points, isUp, tfIdx, onTf, fmt, yFmt,
}: {
  points: Pt[] | undefined;
  isUp: boolean;
  tfIdx: number;
  onTf: (i: number) => void;
  /** 툴팁 가격 표기 */
  fmt: (n: number) => string;
  /** Y축 눈금 표기 */
  yFmt: (n: number) => string;
}) {
  const gid = useId().replace(/:/g, '');
  const [sheet, setSheet] = useState(false);
  const [ma5, setMa5] = useState(false);
  const [ma20, setMa20] = useState(true);
  const [ma60, setMa60] = useState(false);
  const [vol, setVol] = useState(true);
  const INDS = [
    { key: 'ma5',  label: 'MA5',   desc: '5일 이동평균',    active: ma5,  set: setMa5,  hex: '#eab308' },
    { key: 'ma20', label: 'MA20',  desc: '20일 이동평균',   active: ma20, set: setMa20, hex: '#3b82f6' },
    { key: 'ma60', label: 'MA60',  desc: '60일 이동평균',   active: ma60, set: setMa60, hex: '#f97316' },
    { key: 'vol',  label: '거래량', desc: '거래량 보조 차트', active: vol,  set: setVol,  hex: '#0ea5e9' },
  ];
  const active = INDS.filter((i) => i.active);
  const color = isUp ? UP : DOWN;

  const data = useMemo(() => {
    const src = Array.isArray(points) ? points : [];
    const prices = src.map((p) => p.price);
    const a5 = calcMA(prices, 5), a20 = calcMA(prices, 20), a60 = calcMA(prices, 60);
    return src.map((p, i) => ({ ...p, ma5: a5[i], ma20: a20[i], ma60: a60[i] }));
  }, [points]);
  const lo = data.length ? Math.min(...data.map((d) => d.price)) * 0.995 : 0;
  const hi = data.length ? Math.max(...data.map((d) => d.price)) * 1.005 : 0;
  const tick = (v: string | number) => `${String(v).slice(4, 6)}/${String(v).slice(6, 8)}`;

  return (
    <div className="fin-card p-4 sm:p-5 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="seg" role="tablist" aria-label="차트 기간">
          {TIMEFRAMES.map((t, i) => (
            <button key={t.label} type="button" role="tab" aria-selected={tfIdx === i} onClick={() => onTf(i)}
              className={`seg-i !px-3 ${tfIdx === i ? 'on' : ''}`}>{t.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setSheet(true)} className="chip ml-auto">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
          지표{active.length ? ` ${active.length}` : ''}
        </button>
      </div>
      {active.length > 0 && (
        <button type="button" onClick={() => setSheet(true)} className="flex flex-wrap gap-1.5 mb-3" aria-label="켜진 지표 편집">
          {active.map((i) => <span key={i.key} className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-2)]" style={{ color: i.hex }}>{i.label}</span>)}
        </button>
      )}

      {data.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" tickFormatter={tick} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[lo, hi]} tickFormatter={yFmt} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={54} />
              <Tooltip content={({ active: on, payload }) => {
                if (!on || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[0];
                return (
                  <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-0.5">
                    <p className="text-gray-400">{String(d.date).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</p>
                    <p className="text-white font-semibold">{fmt(d.price)}</p>
                    {ma5 && d.ma5 != null && <p className="text-yellow-400">MA5 {fmt(d.ma5)}</p>}
                    {ma20 && d.ma20 != null && <p className="text-blue-400">MA20 {fmt(d.ma20)}</p>}
                    {ma60 && d.ma60 != null && <p className="text-orange-400">MA60 {fmt(d.ma60)}</p>}
                  </div>
                );
              }} />
              <Area type="monotone" dataKey="price" stroke={color} strokeWidth={1.6} fill={`url(#g${gid})`} dot={false} />
              {ma5 && <Line type="monotone" dataKey="ma5" stroke="#eab308" strokeWidth={1.1} dot={false} connectNulls />}
              {ma20 && <Line type="monotone" dataKey="ma20" stroke="#3b82f6" strokeWidth={1.1} dot={false} connectNulls />}
              {ma60 && <Line type="monotone" dataKey="ma60" stroke="#f97316" strokeWidth={1.1} dot={false} connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
          {vol && data.some((d) => d.volume) && (
            <ResponsiveContainer width="100%" height={56}>
              <AreaChart data={data} margin={{ top: 4, right: 5, left: 8, bottom: 0 }}>
                <XAxis dataKey="date" hide /><YAxis hide />
                <Area type="monotone" dataKey="volume" stroke="#0ea5e9" strokeWidth={0} fill="#0ea5e9" fillOpacity={0.28} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </>
      ) : points && points.length === 0 ? (
        <div className="h-60 grid place-items-center text-sm text-[var(--text-muted)]">차트 데이터를 불러오지 못했습니다</div>
      ) : (
        <div className="skeleton h-60" aria-label="차트 로딩 중" />
      )}

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="지표">
        <div className="act-list">
          {INDS.map((i) => (
            <button key={i.key} type="button" className="act-item" onClick={() => i.set((v) => !v)} aria-pressed={i.active}>
              <span className="act-ic" style={{ color: i.hex }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><path d="M3 16c3-6 6-6 9-2s6 4 9-4" /></svg>
              </span>
              <span className="act-tx"><b>{i.label}</b><small>{i.desc}</small></span>
              <span className={`tgl ${i.active ? 'on' : ''}`} aria-hidden />
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
