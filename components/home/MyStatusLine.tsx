'use client';

/**
 * 홈 맨 위 '지금 내 상태' 한 줄 — 앱을 열자마자 위험한 상태인지 보이게(2026-10-26 메뉴 단순화).
 * 가드 마지막 확인(5분 크론) · 열린 포지션과 손절 주문 여부 · 냉각 타이머. 잠금 해제 안 된 기기는 401 → 아무것도 안 보임.
 */
import Link from 'next/link';
import useSWR from 'swr';
import type { MyStatus } from '@/lib/guard';

const fetcher = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const STALE = 15 * 60_000;
const ago = (ms: number) => (ms < 60_000 ? '방금' : ms < 3_600_000 ? `${Math.round(ms / 60_000)}분 전` : `${Math.round(ms / 3_600_000)}시간 전`);
const base = (s: string) => s.replace('USDT', '');

export default function MyStatusLine() {
  const { data } = useSWR<MyStatus & { configured?: boolean; asOf?: number }>('/api/bitget/status', fetcher, { refreshInterval: 60_000, shouldRetryOnError: false });
  if (!data?.configured || !data.positions) return null;
  // 렌더 중 Date.now() 대신 응답 수신 시점 기준(SWR 갱신마다 다시 계산)
  const now = data.asOf ?? data.heartbeatAt ?? 0;
  const hbAge = data.heartbeatAt != null ? Math.max(0, now - data.heartbeatAt) : null;
  const stale = hbAge == null || hbAge > STALE;
  const noSl = data.positions.filter((p) => p.slSet === false);
  // 냉각(서킷브레이커·손실 직후)은 상단 전역 배너(CooldownBanner)가 이미 크게 보여 줘서 여기선 중복 표시하지 않는다
  const bad = stale || noSl.length > 0;
  return (
    <Link href={data.positions.length ? '/coin-analysis' : '/journal'}
      className={`block rounded-2xl border px-3.5 py-2.5 mb-3 text-[12.5px] leading-snug ${bad ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
      <span className="text-[var(--text)] font-semibold">{bad ? '⚠️ ' : '🛡 '}지금 내 상태</span>
      <span className="text-[var(--text-muted)]"> · 가드 {hbAge == null ? '기록 없음' : `${ago(hbAge)} 확인`}{stale ? '(멈춤?)' : ''}</span>
      <span className="block mt-0.5 text-[var(--text)]">
        {data.positions.length
          ? data.positions.map((p) => `${base(p.symbol)} ${p.side === 'long' ? '롱' : '숏'} ${p.pnlPct == null ? '' : `${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(2)}% `}${p.slSet === false ? '손절 ✗' : p.slSet ? '손절 ✓' : ''}`).join(' · ')
          : '열린 포지션 없음'}
      </span>
    </Link>
  );
}
