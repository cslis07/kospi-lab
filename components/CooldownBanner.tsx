'use client';

/**
 * 냉각 타이머 배너 — 손실 청산 직후 30분, 서킷브레이커 차단 시 오늘 자정까지 "다음 진입 가능까지 N분"을 띄운다.
 * 거래소 주문을 막을 수는 없다(리마인더). 잠금 해제 안 된 기기는 /api/bitget/cooldown 이 401 → 아무것도 안 보임.
 * 판정은 서버(lib/guard.cooldownState)가 Bitget 실현손익으로 — 손으로 적은 일지와 무관.
 */
import { useEffect, useState } from 'react';
import useSWR from 'swr';

interface Cooldown { until: number; kind: 'loss' | 'breaker'; reason: string }
const fetcher = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

function left(ms: number) {
  const m = Math.ceil(ms / 60_000);
  return m >= 90 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

export default function CooldownBanner() {
  const { data } = useSWR<{ cooldown: Cooldown | null }>('/api/bitget/cooldown', fetcher, { refreshInterval: 60_000, shouldRetryOnError: false, revalidateOnFocus: true });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const c = data?.cooldown;
  if (!c || c.until <= now) return null;
  const breaker = c.kind === 'breaker';
  return (
    <div role="status" className={`mb-3 rounded-2xl border px-4 py-2.5 text-[13px] leading-snug ${breaker ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'border-[var(--warn)]/40 bg-[var(--warn-soft)]'}`}>
      <b className="text-[var(--text)]">{breaker ? '🛑 오늘은 신규 진입 멈춤' : '⏳ 냉각 중'}</b>
      <span className="text-[var(--text)]"> · 다음 진입 가능까지 <b className="tabular-nums">{left(c.until - now)}</b></span>
      <span className="block text-[11.5px] text-[var(--text-muted)] mt-0.5">{c.reason} · 거래소 주문을 막지는 않아요 — 스스로 지키는 규칙</span>
    </div>
  );
}
