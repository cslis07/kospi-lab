'use client';

/**
 * 셋업 × 확신 교차(참고: Edgewonk) — "어떤 셋업에서 확신이 잘 맞았나".
 * 셋업별로 확신 높음(4~5)/낮음(1~3) 건당 성적을 비교해 과신/과소평가를 가린다.
 * 색 = 한국 관행(이익 빨강·손실 파랑). 방향 예측 아님 — 자기 확신 보정용. 계산은 lib/tradeTags(테스트 고정).
 */
import type { SetupConvictionStat } from '@/lib/tradeTags';

export default function SetupConvictionCard({ rows, fmt, sub, kind = 'setup' }: {
  rows: SetupConvictionStat[]; fmt: (n: number) => string; sub?: string;
  /** setup = 어떤 셋업에서 확신이 맞았나(calibration) · mistake = 어떤 실수가 어떤 확신대에서 나왔나(과신) */
  kind?: 'setup' | 'mistake';
}) {
  if (!rows.length) return null;
  const tone = (n: number | null) => (n == null ? 'var(--text)' : n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--text)');
  const signed = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmt(n)}`);
  const isMistake = kind === 'mistake';
  const hasCalib = !isMistake && rows.some((r) => r.calibration);
  // 실수 탭: 평균 확신이 높을수록 '과신 중 저지른 실수'라 눈에 띄게(평균 4+ 경고색)
  const convTone = (c: number) => (isMistake && c >= 4 ? 'var(--accent-ink)' : 'var(--text)');

  return (
    <section className="fin-card p-4 mb-3">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-[var(--text)]">{isMistake ? '실수 × 확신' : '셋업 × 확신'}</h2>
        <span className="text-[10px] text-[var(--text-muted)]">{sub ?? (isMistake
          ? '실수와 확신(1~5)을 둘 다 매긴 매매만 — 어떤 실수가 어떤 확신대에서 나왔나'
          : '셋업과 확신(1~5)을 둘 다 매긴 매매만 — 어떤 셋업에서 확신이 맞았나')}</span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] tabular-nums mx-1" style={{ minWidth: 380 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold py-1">{isMistake ? '실수' : '셋업'}</th>
              <th className="font-semibold">건</th>
              <th className="font-semibold">평균확신</th>
              <th className="font-semibold">{isMistake ? '확신↑/↓ 건' : '건당(확신↑/↓)'}</th>
              <th className="font-semibold">순손익</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--line-2)] text-right" style={{ opacity: r.count < 5 ? 0.6 : 1 }}
                title={r.count < 5 ? `표본 ${r.count}건 — 5건 미만은 참고만` : undefined}>
                <td className="text-left py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{r.emoji} {r.label}</td>
                <td className="text-[var(--text-muted)]">{r.count}</td>
                <td style={{ color: convTone(r.avgConviction) }}>{r.avgConviction.toFixed(1)}{isMistake && r.avgConviction >= 4 ? ' ⚠️' : ''}</td>
                <td className="whitespace-nowrap">
                  {isMistake ? (
                    <><span className="text-[var(--text)]">{r.high.count}</span><span className="text-[var(--faint)]"> / </span><span className="text-[var(--text-muted)]">{r.low.count}</span></>
                  ) : (
                    <>
                      <span style={{ color: tone(r.high.avg) }}>{r.high.count ? signed(r.high.avg) : '—'}</span>
                      <span className="text-[var(--faint)]"> / </span>
                      <span style={{ color: tone(r.low.avg) }}>{r.low.count ? signed(r.low.avg) : '—'}</span>
                      {r.calibration && (
                        <span className="ml-1" title={r.calibration === 'good' ? '확신 높을 때 건당 성적이 더 좋았음(확신이 맞음)' : '확신 높을 때 오히려 건당 성적이 낮았음(과신 가능)'}>
                          {r.calibration === 'good' ? '✅' : '⚠️'}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td style={{ color: tone(r.netSum) }}>{signed(r.netSum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10.5px] text-[var(--text-muted)] mt-2 leading-relaxed">
        {isMistake ? (
          <>&lsquo;확신↑/↓ 건&rsquo;은 그 실수가 <b>확신 4~5</b>에서 / <b>확신 1~3</b>에서 나온 건수.
            <b className="text-[var(--text)]"> 평균 확신이 높은 실수(⚠️)는 확신이 셀 때(과신) 저지른 실수</b>라 더 위험합니다. </>
        ) : (
          <>&lsquo;건당(확신↑/↓)&rsquo;은 그 셋업에서 <b>확신 4~5</b> 매매와 <b>확신 1~3</b> 매매의 건당 순손익.
            {hasCalib && <> <b className="text-[var(--text)]">✅</b>=확신 높을 때가 더 좋았음(확신이 맞음), <b className="text-[var(--text)]">⚠️</b>=확신 높을 때 오히려 나빴음(과신 점검, 양쪽 3건+일 때만 표기).</>} </>
        )}
        흐린 줄은 5건 미만. 과거 기록이며 다음을 보장하지 않습니다.
      </p>
    </section>
  );
}
