'use client';

/**
 * 자산 › 성과 — 매매일지에 기록된 청산 결과만으로 계산한 실제 성적(승률·기대값·실현손익·주간 추이).
 * 예측·신호가 아니다. 기록·복기·거래소 대조는 관리 › 매매일지에서 한다.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useStockJournal } from '@/hooks/useStockJournal';
import { scoreboard } from '@/lib/journalStats';
import ScoreCard from '@/components/ScoreCard';
import WeeklyReview from '@/components/WeeklyReview';
import { ICON } from '@/lib/menu';

function LinkRow({ href, icon, title, sub }: { href: string; icon: string; title: string; sub: string }) {
  return (
    <Link href={href} className="fin-card fin-row">
      <span className="fin-badge tint-blue">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[icon]} /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="nm">{title}</div>
        <div className="sb truncate">{sub}</div>
      </div>
      <svg className="w-4 h-4 text-[var(--faint)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
    </Link>
  );
}

export default function PerformancePage() {
  const coin = useCoinJournal();
  const stock = useStockJournal();
  const coinSb = useMemo(() => scoreboard(coin.entries), [coin.entries]);
  const stockSb = useMemo(() => scoreboard(stock.entries), [stock.entries]);
  const ready = coin.mounted || stock.mounted;

  return (
    <div className="space-y-4 pb-6">
      <p className="text-xs leading-relaxed text-[var(--text-muted)] px-1">
        성과는 <strong className="text-[var(--text)]">매매일지에 입력한 청산 결과</strong>만으로 계산합니다. 엔진 점수가 아니라 내 실제 성적이며,
        기대값(R)은 손절·사이징을 계획해 둔 매매에서만 환산됩니다.
      </p>

      {ready ? <WeeklyReview rows={[...coin.entries, ...stock.entries]} /> : <div className="skeleton h-40" />}

      {ready && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScoreCard title="코인선물 성적" href="/coin-analysis" sb={coinSb} unit="USDT" />
          <ScoreCard title="국내주식 성적" href="/stock-analysis" sb={stockSb} unit="원" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        <LinkRow href="/journal" icon="journal" title="매매일지" sub="기록·결과 입력·거래소 대조·복기" />
        <LinkRow href="/bitget" icon="bitget" title="계좌" sub="거래소 잔고·포지션·청산" />
      </div>
    </div>
  );
}
