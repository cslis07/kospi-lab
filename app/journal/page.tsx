'use client';

/**
 * 매매일지 성적표 — 이 앱의 정직한 핵심.
 *
 * 진입 엣지가 없다는 걸 측정으로 확인했으므로(PROJECT_STATUS §0), 가치는
 * "엔진이 뭐라 하든 내가 실제로 얼마나 버는가"를 재는 데 있다. 코인·주식 저널을
 * 시간창별 승률·기대값·R 분포·규율(미청산 비율)로 보여준다.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useStockJournal } from '@/hooks/useStockJournal';
import { scoreboard, type Scoreboard } from '@/lib/journalStats';
import ExchangeReconcile from '@/components/ExchangeReconcile';

function pct(v: number | null) { return v == null ? '-' : `${v.toFixed(1)}%`; }
function r(v: number | null) { return v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`; }

function ScoreCard({ title, href, sb, unit }: { title: string; href: string; sb: Scoreboard; unit: string }) {
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

export default function JournalPage() {
  const coin = useCoinJournal();
  const stock = useStockJournal();

  const coinSb = useMemo(() => scoreboard(coin.entries), [coin.entries]);
  const stockSb = useMemo(() => scoreboard(stock.entries), [stock.entries]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-[var(--text)]">매매일지 성적표 <span className="text-xs font-normal text-[var(--text-muted)]">내 실제 성적 실측</span></h1>
        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
          이 앱의 룰 엔진은 예측 우위가 확인되지 않았습니다(코인 727건 49.7%·81건 41.7% / 주식 362건 54.1%로 진입필터 없는 대조군 54.8%보다 낮음).
          <strong className="text-[var(--text)]"> 믿을 것은 엔진 점수가 아니라 내 실제 성적</strong>입니다 —
          손절을 지켰는지, 승률과 기대값이 실제로 어떤지를 여기서 봅니다.
        </p>
      </div>

      {/* 거래소 대조 — 성적표의 입력을 손이 아니라 거래소가 채우게 한다(생존 편향 차단) */}
      {coin.mounted && <ExchangeReconcile entries={coin.entries} applyReconcile={coin.applyReconcile} />}

      {(coin.mounted || stock.mounted) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScoreCard title="코인선물 성적" href="/coin-analysis" sb={coinSb} unit="USDT" />
          <ScoreCard title="국내주식 성적" href="/stock-analysis" sb={stockSb} unit="원" />
        </div>
      )}

      <p className="text-[10px] text-[var(--text-muted)] mt-4 leading-relaxed">
        ※ 실현손익·승률은 <strong>결과를 입력한 청산 건</strong>만 반영합니다. 미청산(결과 미입력)은 승률 분모에서 제외됩니다.
        <br />※ <strong>기대값(R)은 계획을 기록한 매매에서만</strong> 계산됩니다 — 손절·사이징이 없으면 1R 이 얼마인지 알 수 없어 비워 둡니다.
        거래소에서 자동 수집한 매매(계획 없이 진입)는 <strong>실현손익에는 들어가고 R 에는 안 들어갑니다.</strong>
        기대값이 비어 있는데 실현손익이 마이너스라면, <strong className="text-[var(--text)]">계획 없이 친 매매가 손실을 냈다는 뜻</strong>입니다.
        데이터는 이 브라우저에만 저장되며 <Link href="/virtual" className="text-sky-400 hover:underline">가상투자·백업</Link>에서 내보낼 수 있습니다.
      </p>
    </div>
  );
}
