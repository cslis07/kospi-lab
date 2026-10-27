'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { pct, signPp, type Pulse } from '@/lib/inflation';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** 허브(hub 모드)에서 노출할 주요 섹션 바로가기 */
const HUB_CHIPS: { href: string; label: string }[] = [
  { href: '/inflation/why', label: '오늘 왜' },
  { href: '/inflation/scoreboard', label: '예측 스코어보드' },
  { href: '/inflation/brief', label: '데일리 브리핑' },
  { href: '/inflation/quilt', label: '인플레 히트맵' },
  { href: '/inflation/fed', label: 'Fed watch' },
];

/**
 * "공식 CPI(지연) vs 실시간 나우캐스트" 대비 스트립 — /macro·/brief·홈에 삽입.
 * /api/nf 는 게이트 뒤라, 잠금 해제된 기기에서만 수치가 뜨고 그 외엔 조용히 숨는다(공개 페이지라 UnlockGate 안 띄움).
 * hub=true 면 허브 주요 섹션 바로가기 칩을 함께 노출(홈·브리핑에서 18페이지 허브 진입점 강조).
 */
export default function NowcastStrip({ className = '', hub = false }: { className?: string; hub?: boolean }) {
  const { data } = useSWR<Pulse>('/api/nf/pulse.json', fetcher, { revalidateOnFocus: false });
  const g = data?.gap;
  if (!data || data.locked || !g) return null;
  const up = (g.current_pp ?? 0) >= 0;
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 ${className}`}>
      <Link href="/inflation" className="block hover:opacity-90 transition-opacity">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">🇺🇸 미 CPI — 공식(지연) vs 실시간 나우캐스트</span>
          <span className="text-[10px] font-semibold text-[var(--accent-ink)] shrink-0">실시간 물가 →</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1 tabular-nums">
          <span className="text-[13px]"><span className="text-[11px] text-[var(--text-muted)]">나우캐스트 </span><b className="text-[var(--text)]">{pct(g.gauge_yoy)}</b></span>
          <span className="text-[13px]"><span className="text-[11px] text-[var(--text-muted)]">공식 </span><b className="text-[var(--text)]">{pct(g.official_yoy)}</b><span className="text-[10px] text-[var(--text-muted)]"> ({g.official_month} · 지연)</span></span>
          <span className={`text-[12px] font-semibold ${up ? 'text-red-400' : 'text-blue-400'}`}>격차 {signPp(g.current_pp)}</span>
        </div>
      </Link>
      {hub && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[var(--border)]">
          {HUB_CHIPS.map((c) => (
            <Link key={c.href} href={c.href}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition-colors">
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
