'use client';

/**
 * 홈 '내 복기 한 줄' — 매매일지에 확신·태그를 남긴 사용자에게만, 확신 보정 종합을 한 줄로 보여준다.
 * 개인 데이터(기기 localStorage 태그 + Bitget 청산 내역)라 클라이언트에서만 계산한다.
 *   - 태그가 하나도 없으면 조회조차 안 함(비로그인·일반 방문자는 아무것도 안 보임)
 *   - 잠금(쿠키) 안 풀렸으면 history 401 → 숨김
 * 방향 예측 아님 — /journal 확신 보정 카드로 바로가기.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTradeTags } from '@/hooks/useTradeTags';
import { convictionCoaching } from '@/lib/tradeTags';
import type { TradePosition } from '@/lib/tradeReport';

interface HistoryResp { positions?: TradePosition[] }

export default function MyReviewLine() {
  const { tags } = useTradeTags();
  const [positions, setPositions] = useState<TradePosition[] | null>(null);
  const hasTags = useMemo(
    () => Object.values(tags).some((t) => !!t && (t.conviction != null || (t.setups?.length ?? 0) > 0 || (t.mistakes?.length ?? 0) > 0)),
    [tags],
  );

  useEffect(() => {
    if (!hasTags) return; // 태그 없으면 개인 데이터 조회하지 않음
    let alive = true;
    fetch('/api/bitget/history?days=60')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: HistoryResp | null) => { if (alive && Array.isArray(j?.positions)) setPositions(j!.positions!); })
      .catch(() => { /* 잠금·권한·네트워크 — 조용히 숨김 */ });
    return () => { alive = false; };
  }, [hasTags]);

  if (!hasTags || !positions || positions.length === 0) return null;
  const c = convictionCoaching(positions, tags);
  if (c.verdict === 'insufficient') return null;

  const emoji = c.verdict === 'calibrated' ? '🎯' : c.verdict === 'overconfident' ? '⚠️' : '🤔';
  const style = c.verdict === 'calibrated' ? 'border-emerald-500/40 bg-emerald-500/5'
    : c.verdict === 'overconfident' ? 'border-amber-500/40 bg-amber-500/5'
    : 'border-[var(--border)] bg-[var(--surface-2)]';

  return (
    <Link href="/journal#sec-conviction" className={`block rounded-xl border p-3 mb-3 ${style} hover:brightness-110 transition`}>
      <p className="text-[11px] leading-relaxed">
        <b className="text-[var(--text)]">{emoji} 내 복기</b>
        <span className="text-[var(--text-muted)]"> — {c.text}</span>
        <span className="text-[var(--accent)] font-semibold"> 자세히 ›</span>
      </p>
    </Link>
  );
}
