'use client';

/**
 * 홈 맨 위 KPI 타일 4개(2026-10-29 대시보드형 디자인 — 참고 이미지 상단 컬러 타일).
 * 오늘 손익 · 이번 달 순손익 · 30일 수수료 · 이번 주 1시간 미만 매매 — 모두 USDT + 업비트 테더 원화.
 * 데이터 = 복기 대시보드와 같은 Bitget 청산 이력(게이트 뒤). 잠금 안 된 기기(401)·키 없음이면 타일은 숨기고 바로가기 줄만. 계산은 lib/reviewDash.
 * 추세선(스파크라인)은 빼고 숫자만(2026-10-29 사용자 요청 — 내용만 알면 됨).
 * PC(≥1024)에선 홈 상단 왼쪽 칸(.home-top)에 바로가기 한 줄 + 타일 2×2, 오른쪽 칸은 지수 레일 4열.
 */
import useSWR from 'swr';
import { useState } from 'react';
import Link from 'next/link';
import KpiTile from '@/components/KpiTile';
import QuickChips from '@/components/home/QuickChips';
import { weekRules } from '@/lib/reviewDash';
import { kstDateKey } from '@/lib/journalAnalytics';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const fetcher = async (u: string) => { const r = await fetch(u); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const fmt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v))}`;

export default function HomeKpis() {
  const { data } = useSWR<{ positions?: ClosedPosition[]; error?: string; configured?: boolean }>('/api/bitget/history?days=31', fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
  const { data: fx } = useSWR<{ price: number | null }>('/api/crypto/usdt-krw', fetcher, { refreshInterval: 60_000 });
  const [now] = useState(() => Date.now()); // 렌더 중 Date.now() 금지(react-hooks/purity)
  const ps = data?.positions;
  if (!ps || data?.error || data?.configured === false) return <QuickChips />;

  const rate = fx?.price ?? null;
  const krw = (u: number) => (rate ? `${u > 0 ? '+' : u < 0 ? '−' : ''}₩${Math.abs(Math.round(u * rate)).toLocaleString('ko-KR')}` : null);
  const today = kstDateKey(now), month = today.slice(0, 7);
  const todayPs = ps.filter((p) => kstDateKey(p.closeTs) === today);
  const monthPs = ps.filter((p) => kstDateKey(p.closeTs).startsWith(month));
  const todayNet = todayPs.reduce((a, p) => a + p.netProfit, 0);
  const monthNet = monthPs.reduce((a, p) => a + p.netProfit, 0);
  const ps30 = ps.filter((p) => p.closeTs >= now - 30 * 86_400_000); // 이번 달 1일까지 담으려 31일을 받고 수수료 타일은 30일만
  const fee = ps30.reduce((a, p) => a + p.fee, 0);
  const wk = weekRules(ps, now);

  return (
    <section aria-label="내 매매 요약" className="home-kpis flex flex-col">
      <div className="grid grid-cols-2 gap-3">
        <Link href="/review" className="block"><KpiTile label="오늘 손익" icon="growth" value={signed(todayNet)} unit="USDT" sub={krw(todayNet)} foot={`오늘 청산 ${todayPs.length}건`} /></Link>
        <Link href="/review" className="block"><KpiTile label="이번 달 순손익" icon="calendar" value={signed(monthNet)} unit="USDT" sub={krw(monthNet)} foot={`${Number(month.slice(5))}월 청산 ${monthPs.length}건`} /></Link>
        <Link href="/journal?tab=cost" className="block"><KpiTile label="30일 수수료" icon="tax" value={signed(fee)} unit="USDT" sub={krw(fee)} foot={`청산 ${ps30.length}건 · 건당 ${ps30.length ? fmt(Math.abs(fee) / ps30.length) : '0'}`} /></Link>
        <Link href="/review" className="block"><KpiTile tone="navy" label="이번 주 1시간 미만 매매" icon="futures" value={`${wk.cur.scalpN}`} unit="건" sub={`지난주 ${wk.prev.scalpN}건 · ${wk.cur.scalpN <= wk.prev.scalpN ? '줄었음' : '늘었음'}`} foot="수수료가 가장 많이 새는 구간" /></Link>
      </div>
      <QuickChips side />
    </section>
  );
}
