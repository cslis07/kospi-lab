'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { StockData, ChartPoint, InvestorTrend } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TIMEFRAMES = [
  { label: '1개월', months: 1  },
  { label: '3개월', months: 3  },
  { label: '1년',   months: 12 },
];

const BRAND: Record<string, { bg: string; color: string; label: string }> = {
  '005930': { bg: '#1428A0', color: '#fff', label: '삼성' },
  '000660': { bg: '#E2001A', color: '#fff', label: 'SK'  },
  '005380': { bg: '#002C5F', color: '#fff', label: '현대' },
  '373220': { bg: '#A50034', color: '#fff', label: 'LG'  },
  '000270': { bg: '#05141F', color: '#fff', label: '기아' },
  '005490': { bg: '#00388D', color: '#fff', label: 'PS'  },
  '035420': { bg: '#00C73C', color: '#fff', label: 'N'   },
  '035720': { bg: '#3A1D6E', color: '#FFCD00', label: 'K' },
  '051910': { bg: '#A50034', color: '#fff', label: 'LG'  },
  '068270': { bg: '#0051A2', color: '#fff', label: 'CT'  },
};

function CompanyLogo({ code, name }: { code: string; name: string }) {
  const brand    = BRAND[code];
  const initials = brand?.label ?? name.slice(0, 2);
  const bg       = brand?.bg    ?? '#374151';
  const color    = brand?.color ?? '#fff';
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 shadow-md"
      style={{ backgroundColor: bg, color }}
    >
      {initials}
    </div>
  );
}

function fmt(n: number) { return new Intl.NumberFormat('ko-KR').format(Math.round(n)); }

interface KisQuote {
  price: number;
  per: number;
  pbr: number;
  eps: number;
  high52w: number;
  low52w: number;
  error?: string;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-2.5 bg-white/3 text-center">
      <p className="text-[10px] text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-sm font-bold text-[var(--text)] tabular-nums">{value}</p>
    </div>
  );
}

function fmtInvestor(n: number) {
  return (n >= 0 ? '+' : '') + n.toLocaleString('ko-KR');
}

function getInsight(rows: InvestorTrend[]): string | null {
  if (!rows || rows.length < 2) return null;

  let fNeg = 0;
  for (const r of rows) { if (r.foreign < 0) fNeg++; else break; }
  if (fNeg >= 2) return `외국인 ${fNeg}일 연속 순매도 중`;

  let fPos = 0;
  for (const r of rows) { if (r.foreign > 0) fPos++; else break; }
  if (fPos >= 2) return `외국인 ${fPos}일 연속 순매수 중`;

  let iNeg = 0;
  for (const r of rows) { if (r.institution < 0) iNeg++; else break; }
  if (iNeg >= 2) return `기관 ${iNeg}일 연속 순매도 중`;

  let iPos = 0;
  for (const r of rows) { if (r.institution > 0) iPos++; else break; }
  if (iPos >= 2) return `기관 ${iPos}일 연속 순매수 중`;

  return null;
}

interface Props {
  code: string;   // 6-digit KRX code, e.g. "005930"
  name: string;
  market: string;
  onClose: () => void;
}

export default function StockDetailModal({ code, name, market, onClose }: Props) {
  const [tfIdx, setTfIdx] = useState(0);
  const tf = TIMEFRAMES[tfIdx];

  const { data: stock } = useSWR<StockData>(
    `/api/stock/${code}`, fetcher, { refreshInterval: 5000 }
  );
  const { data: chart } = useSWR<ChartPoint[]>(
    `/api/stock/${code}/chart?months=${tf.months}`, fetcher, { refreshInterval: 60000 }
  );
  const { data: investor } = useSWR<InvestorTrend[]>(
    `/api/stock/${code}/investor`, fetcher
  );
  const { data: kis } = useSWR<KisQuote>(
    `/api/kis/price?ticker=${code}`, fetcher, { refreshInterval: 30000 }
  );

  const chartData     = Array.isArray(chart)    ? chart    : [];
  const investorRows  = Array.isArray(investor) ? investor : [];
  const insight       = getInsight(investorRows);

  const isPos      = (stock?.change ?? 0) >= 0;
  const lineColor  = isPos ? '#ef4444' : '#3b82f6';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[500px] max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <CompanyLogo code={code} name={stock?.name ?? name} />
            <div>
              <p className="font-bold text-[var(--text)] text-base leading-tight">
                {stock?.name ?? name}
              </p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-block mt-0.5 ${
                market === 'KOSDAQ' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
              }`}>{market}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 현재가 ── */}
        <div className="px-5 pb-4">
          {stock ? (
            <>
              <p className="text-4xl font-bold tabular-nums text-[var(--text)]">
                ₩{fmt(stock.price)}
              </p>
              <p className={`text-sm font-semibold mt-1 ${isPos ? 'text-red-400' : 'text-blue-400'}`}>
                {isPos ? '▲' : '▼'} {isPos ? '+' : ''}{fmt(stock.change)}원
                {' '}({isPos ? '+' : ''}{stock.changeRate.toFixed(2)}%)
              </p>
            </>
          ) : (
            <div className="h-16 animate-pulse rounded-lg bg-white/10" />
          )}
        </div>

        {/* ── 차트 ── */}
        <div className="px-5 pb-4">
          <div className="flex gap-2 mb-3">
            {TIMEFRAMES.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTfIdx(i)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  tfIdx === i
                    ? 'bg-white/10 border-white/20 text-[var(--text)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={lineColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={lineColor} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const s = String(v);
                    return `${Number(s.slice(4, 6))}/${Number(s.slice(6, 8))}`;
                  }}
                  tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                  tickLine={false} axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `${Math.round(v / 10_000)}만`;
                    if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
                    return String(v);
                  }}
                  tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
                  tickLine={false} axisLine={false}
                  width={40}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as ChartPoint;
                    const s = String(d.date);
                    return (
                      <div className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-xs">
                        <p className="text-gray-400">
                          {s.slice(0, 4)}.{s.slice(4, 6)}.{s.slice(6, 8)}
                        </p>
                        <p className="font-bold text-white">₩{fmt(d.price)}</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={lineColor}
                  strokeWidth={1.5}
                  fill="url(#modalGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center text-[var(--text-muted)] text-xs">
              차트 로딩 중…
            </div>
          )}
        </div>

        {/* ── 시가총액 · 거래금액 ── */}
        {stock && (
          <div className="grid grid-cols-2 gap-3 px-5 pb-4">
            <div className="rounded-xl border border-[var(--border)] p-3 bg-white/3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">🏢</span>
                <span className="text-[10px] text-[var(--text-muted)]">회사 시가총액</span>
              </div>
              <p className="text-sm font-bold text-[var(--text)] tabular-nums">{stock.marketCap}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-3 bg-white/3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">🔗</span>
                <span className="text-[10px] text-[var(--text-muted)]">오늘 거래금액</span>
              </div>
              <p className="text-sm font-bold text-[var(--text)] tabular-nums">{stock.tradingValue}</p>
            </div>
          </div>
        )}

        {/* ── 투자지표 (한국투자증권 실시간) ── */}
        {kis && !kis.error && typeof kis.per === 'number' && (
          <div className="px-5 pb-4">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-3">
              투자지표{' '}
              <span className="text-[var(--text-muted)] font-normal text-xs">(한국투자증권 실시간)</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="PER" value={kis.per > 0 ? `${kis.per.toFixed(2)}배` : '—'} />
              <Metric label="PBR" value={kis.pbr > 0 ? `${kis.pbr.toFixed(2)}배` : '—'} />
              <Metric label="EPS" value={kis.eps ? `${fmt(kis.eps)}원` : '—'} />
            </div>

            {/* 52주 최고·최저 + 현재가 위치 바 */}
            {kis.high52w > 0 && kis.low52w > 0 && kis.high52w > kis.low52w && (
              <div className="mt-3 rounded-xl border border-[var(--border)] p-3 bg-white/3">
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1.5">
                  <span>52주 최저 ₩{fmt(kis.low52w)}</span>
                  <span>52주 최고 ₩{fmt(kis.high52w)}</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-gradient-to-r from-blue-500/40 via-white/10 to-red-500/40">
                  <div
                    className="absolute -top-1 w-3.5 h-3.5 rounded-full bg-[var(--text)] border-2 border-[var(--bg-card)] shadow"
                    style={{
                      left: `calc(${Math.min(100, Math.max(0,
                        ((kis.price - kis.low52w) / (kis.high52w - kis.low52w)) * 100
                      )).toFixed(1)}% - 7px)`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-[var(--text-muted)] text-center mt-1.5">
                  현재가 52주 범위의{' '}
                  <span className="font-semibold text-[var(--text)]">
                    {(((kis.price - kis.low52w) / (kis.high52w - kis.low52w)) * 100).toFixed(0)}%
                  </span>{' '}
                  지점
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 투자자 동향 ── */}
        {investorRows.length > 0 && (
          <div className="px-5 pb-4">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-3">
              투자자 동향{' '}
              <span className="text-[var(--text-muted)] font-normal text-xs">(최근 5일)</span>
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="text-left  py-2 font-medium">일자</th>
                  <th className="text-right py-2 font-medium">개인</th>
                  <th className="text-right py-2 font-medium">외국인</th>
                  <th className="text-right py-2 font-medium">기관</th>
                </tr>
              </thead>
              <tbody>
                {investorRows.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    <td className="py-2 text-[var(--text-muted)]">
                      {row.date.slice(5).replace('-', '.')}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${row.individual  >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                      {fmtInvestor(row.individual)}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${row.foreign     >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                      {fmtInvestor(row.foreign)}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${row.institution >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                      {fmtInvestor(row.institution)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {insight && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-400">
                <span>💡</span>
                <span>{insight}</span>
              </div>
            )}
          </div>
        )}

        {/* ── 푸터 ── */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">출처: Naver 증권 · KRX · 한국투자증권</span>
          <a
            href={`https://finance.naver.com/item/main.naver?code=${code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text)] hover:border-[var(--border-hover)] transition-colors"
          >
            네이버에서 보기
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
