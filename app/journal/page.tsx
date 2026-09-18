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
import { scoreboard } from '@/lib/journalStats';
import ScoreCard from '@/components/ScoreCard';
import ExchangeReconcile from '@/components/ExchangeReconcile';
import CircuitBreakerBar from '@/components/CircuitBreakerBar';
import RetroReport from '@/components/RetroReport';
import AiCoach from '@/components/AiCoach';
import WeeklyReview from '@/components/WeeklyReview';
import TradeAutopsy from '@/components/TradeAutopsy';
import type { RetroEntry } from '@/lib/journalRetro';

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

      {/* 손실 서킷브레이커 — 오늘 더 매매하면 안 되는 상태를 산수로 알린다 */}
      <CircuitBreakerBar />

      {/* 주간 리뷰 — 이번 주 vs 지난 주, 규율 지표·최다 실수 요약(코인+주식 합산) */}
      {(coin.mounted || stock.mounted) && (
        <WeeklyReview rows={[...coin.entries, ...stock.entries]} />
      )}

      {/* 거래소 대조 — 성적표의 입력을 손이 아니라 거래소가 채우게 한다(생존 편향 차단) */}
      {coin.mounted && <ExchangeReconcile entries={coin.entries} applyReconcile={coin.applyReconcile} />}

      {/* 매매 복기 — 왜 지고 있는가(과거 서술). 코인·주식 저널 합쳐서 본다 */}
      {(coin.mounted || stock.mounted) && (
        <RetroReport entries={[...coin.entries, ...stock.entries] as unknown as RetroEntry[]} />
      )}

      {/* 매매 심화 복기 — 진입·손절 타이밍 + 이벤트 대조 + 응대(코인 매매) */}
      {coin.mounted && <TradeAutopsy />}

      {/* AI 복기 코치 — 통계를 넘겨 행동 피드백(방향 추천 아님) */}
      {(coin.mounted || stock.mounted) && (
        <AiCoach entries={[...coin.entries, ...stock.entries] as unknown as RetroEntry[]} />
      )}

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
