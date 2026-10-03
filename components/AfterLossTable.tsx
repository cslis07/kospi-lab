/**
 * 연패 직후 매매의 성적(틸트 확인, 참고: Edgewonk 'Tiltmeter'). 계산은 lib/journalAnalytics.afterLossStreaks(테스트 고정).
 * 서킷브레이커(lib/circuitBreaker)는 '지금' 연패 중이면 진입을 멈추라는 경고이고, 이 표는 과거에 연패 뒤 매매가 실제로 어땠는지를 본다.
 */
import Link from 'next/link';
import type { AfterStreakRow } from '@/lib/journalAnalytics';

const tone = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');

export default function AfterLossTable({ rows, fmt, breakerAt }: { rows: AfterStreakRow[]; fmt: (n: number) => string; breakerAt: number }) {
  if (rows.length < 2) return null;
  const base = rows.find((r) => r.prior === 0);
  const after = rows.filter((r) => r.prior > 0);
  const afterN = after.reduce((a, r) => a + r.count, 0);
  const afterSum = after.reduce((a, r) => a + r.sum, 0);
  const afterAvg = afterN ? afterSum / afterN : null;
  const sizeUp = base?.avgNotional ? after.filter((r) => r.avgNotional != null && r.avgNotional > base.avgNotional! * 1.2 && !r.thin) : [];
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">연패 직후 매매</h2>
        <span className="text-[10px] text-[var(--text-muted)]">감정 매매(틸트) 확인 · 진입 시점까지 청산된 결과 기준</span>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] tabular-nums mx-1" style={{ minWidth: 300 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold py-1">직전 상황</th><th className="font-semibold">건</th><th className="font-semibold">승률</th>
              <th className="font-semibold">건당 기대값</th><th className="font-semibold">진입 규모</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--line-2)] text-right" style={{ opacity: r.thin ? 0.55 : 1 }} title={r.thin ? `표본 ${r.count}건 — 5건 미만은 참고만` : undefined}>
                <td className="text-left py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{r.label}</td>
                <td className="text-[var(--text-muted)]">{r.count}</td>
                <td>{r.winRate == null ? '—' : `${Math.round(r.winRate)}%`}</td>
                <td className="font-bold" style={{ color: r.avg == null ? 'var(--faint)' : tone(r.avg) }}>{r.avg == null ? '—' : signed(r.avg)}</td>
                <td className="text-[var(--text-muted)]">
                  {r.avgNotional == null ? '—' : base?.avgNotional && r.prior > 0 ? `×${(r.avgNotional / base.avgNotional).toFixed(2)}` : `${Math.round(r.avgNotional).toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-[var(--text-muted)] mt-2 leading-relaxed">
        {base?.avg != null && afterAvg != null && (
          <>연패 뒤 매매 {afterN}건의 건당 기대값 <b style={{ color: tone(afterAvg) }}>{signed(afterAvg)}</b> vs 직전 이익·본전 뒤 <b style={{ color: tone(base.avg) }}>{signed(base.avg)}</b> USDT
            {afterAvg < base.avg ? ' — 깨진 뒤 매매가 더 나빴습니다.' : ' — 연패 뒤에도 크게 나빠지지 않았습니다.'} </>
        )}
        {sizeUp.length > 0 && <><b style={{ color: 'var(--warn)' }}>{sizeUp.map((r) => r.label).join(', ')}</b> 진입 규모가 평소의 1.2배 이상 — 만회하려 크게 거는 패턴일 수 있습니다. </>}
      </p>
      <p className="text-[10px] text-[var(--faint)] mt-1 leading-relaxed">
        진입 규모 = 수량 × 진입가(직전 이익·본전 뒤 평균 대비 배수). 흐린 줄은 5건 미만.{' '}
        <Link href="/coin-analysis" className="underline">서킷브레이커</Link>는 지금 {breakerAt}연패 이상이면 신규 진입을 멈추라고 경고합니다(설정값).
      </p>
    </section>
  );
}
