'use client';

/**
 * 홈 '다음 발표' 한 줄(KL-010) — 오늘 위험 다음으로 볼 것: 다음 미국 주요 발표 시각(한국 시간)과 거래 보류 권장 구간.
 * 공개 /api/intel/context(CDN 5분, 코인 화면과 같은 주소라 캐시 공유) · 보류 구간은 위험관리 설정(발표 전·후 분).
 * 방향 신호 아님 — 발표 전후엔 변동이 커서 신규 진입을 쉬라는 일정 알림. 데이터가 없으면 아무것도 안 그린다.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useRiskSettings } from '@/hooks/useRiskControl';
import { nextReleaseWindow, fmtKstShort, fmtKstHm, type ReleaseLike } from '@/lib/nextRelease';

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));
/** 지난번에 이 줄이 보였는지 — 레이아웃 첫 스크립트가 읽어 html.kl-nr 로 자리를 미리 잡는다(화면 밀림 방지, MyStatusLine 과 같은 방식) */
const SLOT_KEY = 'kl-nr';

export default function NextReleaseLine() {
  const { data } = useSWR<{ releases?: ReleaseLike[] } | null>('/api/intel/context', fetcher, { refreshInterval: 300_000, revalidateOnFocus: false, shouldRetryOnError: false });
  const { settings } = useRiskSettings();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const w = useMemo(() => nextReleaseWindow(data?.releases, now, settings.eventPreMin, settings.eventPostMin), [data, now, settings.eventPreMin, settings.eventPostMin]);
  const show = !!w && w.minutesUntil <= 72 * 60;
  useEffect(() => { if (data === undefined) return; try { if (show) localStorage.setItem(SLOT_KEY, '1'); else localStorage.removeItem(SLOT_KEY); } catch { /* 무시 */ } }, [data, show]);
  return <div className="nr-slot mb-3">{show && w ? <Line w={w} /> : null}</div>;
}

function Line({ w }: { w: NonNullable<ReturnType<typeof nextReleaseWindow>> }) {
  const until = w.minutesUntil <= 0 ? '발표됨' : w.minutesUntil < 60 ? `${w.minutesUntil}분 후` : `${Math.round(w.minutesUntil / 60)}시간 후`;
  return (
    <Link href="/calendar"
      className={`block rounded-2xl border px-3.5 py-2.5 text-[12.5px] leading-snug ${w.active ? 'border-[var(--amber)] bg-[var(--amber-soft)]' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
      <span className="font-semibold text-[var(--text)]">📅 {w.active ? '지금 발표 보류 구간' : '다음 미국 발표'}</span>
      <span className="text-[var(--text-muted)]"> · {w.title} {fmtKstShort(w.atMs)}({until})</span>
      <span className="block text-[11.5px] text-[var(--text-muted)] mt-0.5">
        신규 진입 쉬기 권장 {fmtKstHm(w.fromMs)}~{fmtKstHm(w.toMs)} · 한국 시간 · 방향 신호 아님
      </span>
    </Link>
  );
}
