'use client';

/**
 * 코인 › 시장환경 — 홈 '오늘의 시장'과 같은 카드(현재값·전일 대비·1개월 추이)로 15초마다 갱신, 누르면 상세 시트.
 * 미 국채 10Y·2Y·30Y · 브렌트유 · 달러인덱스 · USDT/KRW · 공포탐욕 · 스테이블코인 시총 + 다음 FOMC.
 * 데이터: /api/coin-env/live (lib/coinEnvLive). 색은 가격 방향(상승=빨강·하락=파랑) — 유불리 판정이 아니다.
 */
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import BottomSheet from '@/components/ui/BottomSheet';
import { CardButton, type IndexCard } from '@/components/IndexCardView';
import type { LiveQuote } from '@/components/MarketIndicatorDetail';

interface EnvCard extends IndexCard { cat: string; status: string; source?: string }
interface Resp { cards: EnvCard[]; fomc: { date: string; dday: number } | null; asOf: string }

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const MarketIndicatorDetail = dynamic(() => import('@/components/MarketIndicatorDetail'), {
  ssr: false, loading: () => <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>지표 불러오는 중…</p>,
});

const DETAIL_UNIT: Record<string, string> = { B: '십억 달러' };
function toQuote(c: EnvCard): LiveQuote {
  return {
    code: c.code, name: c.name, cat: c.cat, unit: DETAIL_UNIT[c.unit ?? ''] ?? c.unit,
    price: c.value, change: c.change, changeRate: c.changeRate, status: c.status,
    dec: c.dec, source: c.source, diffUnit: c.diffUnit,
  };
}

export default function MarketEnvRail() {
  const { data } = useSWR<Resp>('/api/coin-env/live', fetcher, { refreshInterval: 15000, revalidateOnFocus: true });
  const [sel, setSel] = useState<string | null>(null);
  const cards = data?.cards ?? [];
  const selCard = sel ? cards.find((c) => c.code === sel) : undefined;
  const time = data?.asOf ? new Date(data.asOf).toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit' }) : null;
  const fomc = data?.fomc;

  return (
    <section>
      <div className="fin-sec" style={{ marginBottom: 10 }}>
        <h3>시장환경</h3>
        <span className="text-[11px] font-semibold text-[var(--faint)]">금리 · 유가 · 환율 · 심리{time ? ` · ${time} 갱신` : ''}</span>
      </div>
      <div className="idx-rail env-rail">
        {!data
          ? Array.from({ length: 9 }).map((_, i) => <div key={i} className="idx-card skeleton" style={{ height: 112 }} />)
          : cards.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--faint)', gridColumn: '1 / -1' }}>시장환경을 불러오지 못했습니다. 잠시 후 다시 시도됩니다.</p>
            : cards.map((c) => <CardButton key={c.code} c={c} onClick={() => setSel(c.code)} />)}
        {fomc && (
          <Link href="/calendar" className="idx-card-btn" aria-label="다음 FOMC — 경제 캘린더로" style={{ display: 'block', minWidth: 0, textDecoration: 'none' }}>
            <div className="idx-card">
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>다음 FOMC</div>
              <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 4 }}>
                {fomc.dday === 0 ? '오늘' : `D-${fomc.dday}`}
              </div>
              <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--faint)', marginTop: 1 }}>{fomc.date}</div>
              <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 8, lineHeight: 1.4 }}>발표 전후 변동성 확대 — 경제 캘린더에서 일정 보기</div>
            </div>
          </Link>
        )}
      </div>
      <p className="text-[10.5px] text-[var(--faint)] mt-2 leading-relaxed">
        카드를 누르면 추이 차트와 설명을 봅니다. 상승 <span style={{ color: 'var(--warn)' }}>빨강</span>·하락 <span style={{ color: 'var(--accent)' }}>파랑</span>은 값의 방향이며 매매 신호가 아닙니다.
      </p>

      <BottomSheet open={!!selCard} onClose={() => setSel(null)} title={selCard?.name ?? ''} full>
        {selCard && <MarketIndicatorDetail q={toQuote(selCard)} />}
      </BottomSheet>
    </section>
  );
}
