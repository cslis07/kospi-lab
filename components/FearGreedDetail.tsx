'use client';

/**
 * 공포·탐욕 지수 상세 — 반원 게이지 + 전일·1주·1개월·1년 전 비교 + 구간 안내. 코인 › 시장환경 카드의 상세 시트 맨 위.
 * 아래에는 MarketIndicatorDetail(히스토리 차트·일별 내역·설명)이 이어진다.
 */
import FearGreedGauge from '@/components/FearGreedGauge';
import { FNG_BANDS, fngBand, type FngCompare } from '@/lib/fearGreed';

export default function FearGreedDetail({ value, compare }: { value: number; compare: FngCompare[] }) {
  const band = fngBand(value);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-sm font-semibold text-[var(--text)]">코인 공포 &amp; 탐욕 지수</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">0 = 극단적 공포 · 100 = 극단적 탐욕 · 하루 1회 집계</p>
        <div className="grid gap-4 mt-3 md:grid-cols-[minmax(0,1fr)_240px] md:items-center">
          <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
            <FearGreedGauge value={value} full />
            <p className="text-center text-sm font-bold mt-1" style={{ color: band.color }}>{band.face} {band.label}</p>
          </div>
          {compare.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] overflow-hidden">
              {compare.map((c, i) => {
                const b = fngBand(c.value);
                return (
                  <div key={c.label} className={`flex items-center justify-between px-3 py-2.5 text-xs ${i ? 'border-t border-[var(--border)]' : ''}`}>
                    <span className="text-[var(--text-muted)]">{c.label}</span>
                    <span className="font-bold tabular-nums" style={{ color: b.color }}>{c.value} - {b.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text)] mb-3">구간 안내</h2>
        <div className="space-y-1.5">
          {FNG_BANDS.map((b, i) => {
            const on = b === band;
            return (
              <div key={b.en} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
                style={{ background: on ? 'var(--surface-2)' : 'transparent', border: on ? `1px solid ${b.color}` : '1px solid transparent' }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                <span className="font-semibold text-[var(--text)]" style={{ minWidth: 76 }}>{b.label}</span>
                <span className="text-[var(--text-muted)]">{b.en}</span>
                <span className="ml-auto tabular-nums text-[var(--text-muted)]">{i === 0 ? 0 : b.from + 1}~{b.to}</span>
                {on && <span className="font-bold" style={{ color: b.color }}>지금</span>}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)] mt-3">
          지수가 낮을수록 투자자들이 공포에 떨고 있고, 높을수록 탐욕이 큰 상태입니다. 흔히 탐욕 구간에서는 관망하고 공포 구간을 매수 기회로 보지만,
          극단 구간이 몇 주씩 이어지기도 합니다. 지수는 참고사항의 하나일 뿐 매매 신호가 아닙니다.
        </p>
      </div>
    </div>
  );
}
