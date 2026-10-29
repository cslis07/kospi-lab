'use client';

/**
 * 시장지표(환율·금리·원자재) 단일 종목 상세 — 시장지표 페이지 바텀시트 + 홈 지수 레일 카드(cat 'index' = 주가지수).
 * 경제지표(MacroDetail)와 같은 결: 현재값 요약 + 히스토리 차트 + 최근 내역 표 + 설명·영향.
 * live 수치는 호출부에서 받은 네이버 시세, 히스토리는 /api/naver/indicator-history.
 */
import useSWR from 'swr';
import { fetcher } from '@/components/naver/ui';
import MacroChartLazy from '@/components/MacroChartLazy';
import { INDICATOR_INFO } from '@/lib/marketIndicatorInfo';

export interface LiveQuote {
  code: string; name: string; cat: string; unit?: string;
  price: number; change: number; changeRate: number; status: string;
}

const decOf = (cat: string, code: string) => (cat === 'bond' ? 4 : code === 'M04020000' ? 0 : 2);
function fmtNum(v: number | null | undefined, dec: number) {
  return v == null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(v: number | null) {
  return v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
// 상승=빨강 / 하락=파랑 (국내 관행)
function chgClass(v: number | null) {
  if (v == null || v === 0) return 'text-[var(--text-muted)]';
  return v > 0 ? 'text-red-400' : 'text-blue-400';
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${y.slice(2)}.${m}.${day}`;
}

export default function MarketIndicatorDetail({ q }: { q: LiveQuote }) {
  const { data } = useSWR<{ points: { date: string; value: number }[] }>(
    `/api/naver/indicator-history?code=${encodeURIComponent(q.code)}`, fetcher, { refreshInterval: 300000 });
  const points = data?.points ?? [];
  const dec = decOf(q.cat, q.code);
  const info = INDICATOR_INFO[q.code];
  const live = q.status === '실시간' || q.status.endsWith('지연');
  const isPct = q.unit === '%';

  return (
    <div className="space-y-4">
      {/* 현재값 요약 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{q.name}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              <span className={`idx-live${live ? ' on' : ''}`}><i />{q.status || '—'}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tabular-nums text-[var(--text)]">
              {q.price ? fmtNum(q.price, dec) : '—'}
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">{isPct ? '%' : q.unit}</span>
            </p>
            <p className={`text-xs font-semibold tabular-nums ${chgClass(q.changeRate)}`}>
              {q.changeRate > 0 ? '▲' : q.changeRate < 0 ? '▼' : ''} {fmtNum(Math.abs(q.change), dec)} ({fmtPct(q.changeRate)})
            </p>
          </div>
        </div>
      </div>

      {/* 차트 */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">히스토리 <span className="text-[10px] font-normal text-[var(--text-muted)]">최근 {points.length || '—'}영업일</span></h2>
        {points.length
          ? <MacroChartLazy data={points} decimals={dec} monthly={false} unit={isPct ? '%' : (q.unit ?? '')} />
          : <div className="skeleton rounded-xl" style={{ height: 240 }} aria-label="차트 로딩 중" />}
      </div>

      {/* 최근 내역 표 */}
      {points.length > 1 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3">최근 내역</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                  <th className="text-left px-3 py-2 text-[var(--text-muted)] font-medium">날짜</th>
                  <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">종가</th>
                  <th className="text-right px-3 py-2 text-[var(--text-muted)] font-medium">전일대비</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().slice(0, 12).map((p, i, arr) => {
                  const next = arr[i + 1];
                  const ch = next && next.value !== 0 ? ((p.value - next.value) / next.value) * 100 : null;
                  return (
                    <tr key={p.date} className={i % 2 === 1 ? 'bg-[var(--bg)]/30' : ''}>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{fmtDate(p.date)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--text)]">{fmtNum(p.value, dec)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${chgClass(ch)}`}>{ch == null ? '-' : fmtPct(ch)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 설명·영향 */}
      {info && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">지표 설명</p>
            <p className="text-[13px] text-[var(--text)] leading-relaxed">{info.desc}</p>
          </div>
          <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--surface-2)] p-3">
            <p className="text-[11px] font-semibold text-[var(--accent-ink)] mb-1">코인·주식에 주는 영향</p>
            <p className="text-[13px] text-[var(--text)] leading-relaxed">{info.impact}</p>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-1">
        {q.cat === 'index' ? '출처: 네이버페이 증권(지수 일봉 종가). 해외 지수는 현지 종가 기준입니다.' : '출처: 네이버페이 증권(하나은행 고시 환율·로이터 채권·선물). ‘N분 지연’ 표시는 실시간이 아닙니다.'} 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
