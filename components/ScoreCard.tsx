/**
 * 성적 카드 — 승률·기대값(R)·실현손익, 시간창별 표, R 분포, 규율 신호.
 * 관리 › 매매일지와 자산 › 성과가 함께 쓴다(매매일지에서 추출).
 */
import Link from 'next/link';
import type { Scoreboard } from '@/lib/journalStats';

function pct(v: number | null) { return v == null ? '-' : `${v.toFixed(1)}%`; }
function r(v: number | null) { return v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`; }

export default function ScoreCard({ title, href, sb, unit }: { title: string; href: string; sb: Scoreboard; unit: string }) {
  const maxBucket = Math.max(1, ...sb.rBuckets.map((b) => b.count));
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
        <Link href={href} className="text-[10px] text-sky-400 hover:underline">기록하러 가기 →</Link>
        <span className="flex-1" />
        <span className="text-[10px] text-[var(--text-muted)]">총 {sb.total}건 · 미청산 {sb.open}</span>
      </div>

      {sb.total === 0 ? (
        <p className="text-xs text-[var(--text-muted)] py-6 text-center">
          아직 기록이 없습니다. {title.replace(' 성적', '')} 화면의 <strong>매매일지 기록</strong>으로 판정을 저장하고 결과를 입력하면 여기 성적이 쌓입니다.
        </p>
      ) : (
        <>
          {/* 핵심 3지표 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl bg-white/[0.03] p-2.5 text-center">
              <p className="text-[10px] text-[var(--text-muted)]">승률 <span className="opacity-60">(승/패)</span></p>
              <p className={`text-lg font-bold tabular-nums ${sb.winRate != null && sb.winRate >= 50 ? 'text-emerald-400' : 'text-[var(--text)]'}`}>{pct(sb.winRate)}</p>
              <p className="text-[9px] text-[var(--text-muted)]">{sb.wins}승 {sb.losses}패{sb.evens ? ` ${sb.evens}본전` : ''}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-2.5 text-center">
              <p className="text-[10px] text-[var(--text-muted)]">기대값</p>
              <p className={`text-lg font-bold tabular-nums ${sb.avgR == null ? 'text-[var(--text-muted)]' : sb.avgR >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r(sb.avgR)}</p>
              {/* R 은 계획(손절·사이징)이 있어야 환산된다. 없는 걸 0 으로 채우면 잃은 계좌가 본전으로 보인다 */}
              <p className="text-[9px] text-[var(--text-muted)] mt-0.5 leading-tight">
                {sb.rCount > 0 ? `R 기록 ${sb.rCount}건 기준` : 'R 환산 불가 — 계획(손절·사이징) 기록 없음'}
                {sb.noRCount > 0 && sb.rCount > 0 ? ` · 제외 ${sb.noRCount}건` : ''}
              </p>
              <p className="text-[9px] text-[var(--text-muted)]">청산 {sb.closed}건</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-2.5 text-center">
              <p className="text-[10px] text-[var(--text-muted)]">실현손익</p>
              <p className={`text-lg font-bold tabular-nums ${sb.realizedUsdt != null && sb.realizedUsdt >= 0 ? 'text-emerald-400' : sb.realizedUsdt != null ? 'text-red-400' : 'text-[var(--text-muted)]'}`}>
                {sb.realizedUsdt != null ? `${sb.realizedUsdt >= 0 ? '+' : ''}${Math.round(sb.realizedUsdt).toLocaleString()}` : '-'}
              </p>
              <p className="text-[9px] text-[var(--text-muted)]">{sb.realizedCount ? `${unit} · ${sb.realizedCount}건 입력` : '입력 없음'}</p>
            </div>
          </div>

          {/* 손익비·Profit Factor (R 기록 매매 기준) — 승률·기대값은 위 카드에 이미 있으므로 여기선 빼고 */}
          {sb.edge.n > 0 && (
            <div className="rounded-xl bg-white/[0.03] px-3 py-2 mb-3 text-[11px] text-[var(--text-muted)] tabular-nums leading-relaxed">
              <span>손익비 <b className="text-[var(--text)]">{sb.edge.payoff != null ? sb.edge.payoff.toFixed(2) : '—'}</b></span>
              {sb.edge.avgWin != null && sb.edge.avgLoss != null && (
                <span className="opacity-80"> (평균 익절 {r(sb.edge.avgWin)} / 손절 −{sb.edge.avgLoss.toFixed(2)}R)</span>
              )}
              <span> · PF <b className={sb.edge.profitFactor != null && sb.edge.profitFactor >= 1 ? 'text-emerald-400' : 'text-[var(--text)]'}>
                {sb.edge.profitFactor != null ? sb.edge.profitFactor.toFixed(2) : sb.edge.wins ? '손실 없음' : '—'}
              </b></span>
              {sb.edge.breakevenWinRate != null && <span> · 손익분기 승률 {sb.edge.breakevenWinRate.toFixed(0)}%</span>}
            </div>
          )}

          {/* 시간창별 */}
          <div className="mb-3">
            <table className="w-full text-[11px]">
              <thead><tr className="text-[var(--text-muted)] text-left">
                <th className="font-normal py-0.5">기간</th><th className="font-normal text-right">청산</th>
                <th className="font-normal text-right">승률</th><th className="font-normal text-right">기대값</th>
              </tr></thead>
              <tbody>
                {sb.windows.map((w) => (
                  <tr key={w.label} className="border-t border-[var(--border)]/50 tabular-nums">
                    <td className="py-1 text-[var(--text)]">{w.label}</td>
                    <td className="text-right text-[var(--text-muted)]">{w.closed}</td>
                    <td className={`text-right ${w.winRate != null && w.winRate >= 50 ? 'text-emerald-400' : 'text-[var(--text)]'}`}>{pct(w.winRate)}</td>
                    <td className={`text-right ${w.avgR != null && w.avgR >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r(w.avgR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* R 분포 */}
          <div className="mb-2">
            <p className="text-[10px] text-[var(--text-muted)] mb-1">실현 R 분포</p>
            <div className="space-y-1">
              {sb.rBuckets.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)] w-16 shrink-0 tabular-nums">{b.label}</span>
                  <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden">
                    <div className={`h-full ${b.label.includes('−') || b.label.startsWith('≤') ? 'bg-red-400/70' : 'bg-emerald-400/70'}`}
                      style={{ width: `${(b.count / maxBucket) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] w-6 text-right tabular-nums">{b.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 연속 승/패 스트릭 */}
          {(sb.streak.maxWin > 0 || sb.streak.maxLoss > 0) && (
            <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)] mt-2 tabular-nums">
              <span>최대 연승 <b className="text-emerald-400">{sb.streak.maxWin}</b></span>
              <span>최대 연패 <b className="text-red-400">{sb.streak.maxLoss}</b></span>
              {sb.streak.current !== 0 && (
                <span className="ml-auto">현재{' '}
                  <b className={sb.streak.current > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {sb.streak.current > 0 ? `${sb.streak.current}연승` : `${-sb.streak.current}연패`}
                  </b>
                </span>
              )}
            </div>
          )}

          {/* 규율 신호 */}
          {sb.openRatio > 0.3 && (
            <p className="text-[10px] text-amber-400 mt-2">
              ⚠ 미청산 {Math.round(sb.openRatio * 100)}% — 기록만 하고 결과를 안 채운 건이 많습니다. 성적 실측이 흐려집니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
