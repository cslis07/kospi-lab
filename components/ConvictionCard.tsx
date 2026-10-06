'use client';

/**
 * 확신(신뢰도 1~5)별 성적(참고: Edgewonk 'Conviction') — 확신이 높을수록 실제로 잘됐는지 점검.
 * 자기 판단 보정용: 확신과 결과가 반대로 가면 과신/과소평가 신호. 방향 예측 아님. 계산은 lib/tradeTags(테스트 고정).
 */
import type { ConvictionStat } from '@/lib/tradeTags';

export default function ConvictionCard({ rows, fmt, sub }: { rows: ConvictionStat[]; fmt: (n: number) => string; sub?: string }) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  if (!total) return null;
  const tone = (n: number | null) => (n == null ? 'var(--text)' : n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');
  // 확신↑일수록 평균 순손익↑ 인가(단조 증가) — 표본 5건 이상 레벨만으로 거칠게 판단
  const solid = rows.filter((r) => r.count >= 5 && r.avg != null);
  let verdict: string | null = null;
  if (solid.length >= 2) {
    const asc = solid.every((r, i) => i === 0 || (r.avg as number) >= (solid[i - 1].avg as number) - 1e-9);
    const desc = solid.every((r, i) => i === 0 || (r.avg as number) <= (solid[i - 1].avg as number) + 1e-9);
    verdict = asc ? '확신이 높을수록 건당 성적도 좋았습니다 — 확신 판단이 결과와 대체로 맞았습니다.'
      : desc ? '확신이 높을수록 건당 성적은 오히려 낮았습니다 — 확신이 셀 때 과신했을 수 있습니다(추격·사이징 점검).'
      : '확신과 건당 성적이 일관되게 움직이지 않았습니다 — 확신 기준을 다시 살펴볼 여지가 있습니다.';
  }

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">확신별 성적</h2>
        <span className="text-[10px] text-[var(--text-muted)]">{sub ?? '진입 확신(1~5)을 매긴 매매만'}</span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] tabular-nums mx-1" style={{ minWidth: 300 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold py-1">확신</th>
              <th className="font-semibold">건</th>
              <th className="font-semibold">승률</th>
              <th className="font-semibold">건당</th>
              <th className="font-semibold">순손익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.level} className="border-t border-[var(--line-2)] text-right" style={{ opacity: r.count < 5 ? 0.55 : 1 }}
                title={r.count < 5 ? `표본 ${r.count}건 — 5건 미만은 참고만` : undefined}>
                <td className="text-left py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{r.emoji} {r.level} {r.label}</td>
                <td className="text-[var(--text-muted)]">{r.count}</td>
                <td className="text-[var(--text)]">{r.winRate == null ? '—' : `${Math.round(r.winRate)}%`}</td>
                <td className="font-bold" style={{ color: tone(r.avg) }}>{r.avg == null ? '—' : `${r.avg > 0 ? '+' : ''}${fmt(r.avg)}`}</td>
                <td style={{ color: tone(r.netSum) }}>{r.netSum > 0 ? '+' : ''}{fmt(r.netSum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10.5px] text-[var(--text-muted)] mt-2 leading-relaxed">
        {verdict && <><b className="text-[var(--text)]">{verdict}</b> </>}
        매매 행을 눌러 &lsquo;복기 기록&rsquo;에서 확신을 매길 수 있습니다. 흐린 줄은 5건 미만. 과거 기록이며 다음을 보장하지 않습니다.
      </p>
    </section>
  );
}
