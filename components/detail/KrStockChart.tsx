'use client';

/**
 * 국내 종목 상세 가격 차트(가격·MA·BB·거래량·RSI·비교). Recharts가 무거워(압축 ~120KB, 실행 ~0.5초)
 * 상세 페이지에서 next/dynamic 으로 지연 로딩한다 — 페이지 첫 표시를 차트 라이브러리가 막지 않게.
 */
import {
  ComposedChart, AreaChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';

const UP = '#ff4433';
const DOWN = '#1c6cff';
function fmt(n: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(n)); }

export interface KrChartPoint {
  date: string; price: number; volume?: number;
  ma5: number | null; ma20: number | null; ma60: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null;
  rsi: number | null; compareRet: number | null; mainRet: number;
}

export default function KrStockChart({
  enhancedData, rsiData, stock, isPos, chartMin, chartMax, compareTicker, compareName,
  showMA5, showMA20, showMA60, showBB, showVol, showRSI,
}: {
  enhancedData: KrChartPoint[];
  rsiData: KrChartPoint[];
  stock: { name: string };
  isPos: boolean;
  chartMin: number;
  chartMax: number;
  compareTicker: string;
  compareName: string;
  showMA5: boolean; showMA20: boolean; showMA60: boolean; showBB: boolean; showVol: boolean; showRSI: boolean;
}) {
  return (
    <>
            <ResponsiveContainer width="100%" height={compareTicker ? 220 : 240}>
              {compareTicker ? (
                // 비교 모드: 수익률 정규화 차트
                <ComposedChart data={enhancedData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="date" tickFormatter={(v) => `${String(v).slice(4,6)}/${String(v).slice(6,8)}`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `${v.toFixed(1)}%`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-1">
                        {payload.map((p, i) => (
                          <p key={i} style={{ color: p.color }}>{p.name}: {Number(p.value).toFixed(2)}%</p>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="mainRet" name={stock.name} stroke={isPos ? UP : DOWN}
                    strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="compareRet" name={compareName || compareTicker} stroke="#ff8833"
                    strokeWidth={1.5} dot={false} connectNulls />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                </ComposedChart>
              ) : (
                // 일반 모드: OHLC + 지표
                <ComposedChart data={enhancedData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={isPos ? UP : DOWN} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={isPos ? UP : DOWN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="date" tickFormatter={(v) => `${String(v).slice(4,6)}/${String(v).slice(6,8)}`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis domain={[chartMin, chartMax]} tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={42} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as typeof enhancedData[0];
                    return (
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs space-y-0.5">
                        <p className="text-gray-400">{String(d.date).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</p>
                        <p className="text-white font-semibold">₩{fmt(d.price)}</p>
                        {showMA5  && d.ma5  && <p className="text-yellow-400">MA5: ₩{fmt(d.ma5)}</p>}
                        {showMA20 && d.ma20 && <p className="text-blue-400">MA20: ₩{fmt(d.ma20)}</p>}
                        {showMA60 && d.ma60 && <p className="text-orange-400">MA60: ₩{fmt(d.ma60)}</p>}
                      </div>
                    );
                  }} />
                  <Area type="monotone" dataKey="price" stroke={isPos ? UP : DOWN}
                    strokeWidth={1.5} fill="url(#stockGrad)" dot={false} />
                  {showBB && <>
                    <Line type="monotone" dataKey="bbUpper"  stroke="#9019e6" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="bbMiddle" stroke="#9019e6" strokeWidth={1} dot={false} opacity={0.5} />
                    <Line type="monotone" dataKey="bbLower"  stroke="#9019e6" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                  </>}
                  {showMA5  && <Line type="monotone" dataKey="ma5"  stroke="#facc15" strokeWidth={1.2} dot={false} />}
                  {showMA20 && <Line type="monotone" dataKey="ma20" stroke="#00acfe" strokeWidth={1.2} dot={false} />}
                  {showMA60 && <Line type="monotone" dataKey="ma60" stroke="#ff8833" strokeWidth={1.2} dot={false} />}
                </ComposedChart>
              )}
            </ResponsiveContainer>

            {/* 거래량 차트 */}
            {showVol && !compareTicker && (
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart data={enhancedData} margin={{ top: 4, right: 5, left: 10, bottom: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Area type="monotone" dataKey="volume" stroke="#00acfe" fill="#00acfe" fillOpacity={0.3} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {/* RSI 차트 */}
            {showRSI && !compareTicker && rsiData.length > 0 && (
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <p className="text-[10px] text-[var(--text-muted)] mb-1">RSI (14)</p>
                <ResponsiveContainer width="100%" height={80}>
                  <ComposedChart data={rsiData} margin={{ top: 0, right: 5, left: 10, bottom: 0 }}>
                    <YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={24} />
                    <XAxis dataKey="date" hide />
                    <ReferenceLine y={70} stroke="#ff4433" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <ReferenceLine y={30} stroke="#00cc4b" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-gray-900 border border-white/10 rounded-lg px-2 py-1 text-xs">
                          <p className="text-emerald-400">RSI: {Number(payload[0].value).toFixed(1)}</p>
                        </div>
                      );
                    }} />
                    <Line type="monotone" dataKey="rsi" stroke="#34d399" strokeWidth={1.2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
    </>
  );
}
