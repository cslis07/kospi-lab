'use client';

/**
 * 업종 히트맵(참고: Finviz 맵 · 네이버 업종 지도) — 칸 크기 = 업종 시가총액의 제곱근(반도체 한 업종이 화면을 다 덮지 않게), 색 = 등락률(상승 빨강·하락 파랑, 진할수록 큼).
 * 칸을 누르면 아래에 그 업종의 상승·보합·하락 종목 수와 시총 상위 3종목(상세로 이동).
 * 데이터 /api/naver/industry?heat=1 (업종 전체 1회 호출, 가격 조회 없음). 배치 = lib/treemap(결정적 이분할).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { treemap } from '@/lib/treemap';
import { fetcher, signPct, Empty, EMPTY_SOURCE } from '@/components/naver/ui';
import type { HeatItem } from '@/lib/naverStock';

interface Resp { items: HeatItem[]; asOf?: string }

/** 등락률 → 칸 배경. 기간별 포화 기준(일간 3% · 주간 6% · 월간 12%) */
function bg(rate: number, cap: number) {
  const t = Math.min(1, Math.abs(rate) / cap);
  if (Math.abs(rate) < 0.05) return 'var(--surface-2)';
  const pct = Math.round(22 + t * 70);
  return `color-mix(in srgb, ${rate > 0 ? 'var(--up)' : 'var(--down)'} ${pct}%, var(--surface-2))`;
}

export default function IndustryHeatmap({ market, cat, period }: { market: 'kr' | 'us'; cat: 'industries' | 'themes'; period: 'daily' | 'weekly' | 'monthly' }) {
  const { data, error } = useSWR<Resp>(`/api/naver/industry?heat=1&market=${market}&cat=${cat}&period=${period}`, fetcher, { refreshInterval: 30000, keepPreviousData: true });
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cap = period === 'daily' ? 3 : period === 'weekly' ? 6 : 12;
  const tiles = useMemo(() => (size.w && data?.items?.length ? treemap(data.items, (x) => Math.sqrt(x.marketCap), size.w, size.h) : []), [data, size]);
  const sel = data?.items?.find((x) => x.code === picked) ?? null;
  const unit = market === 'kr' ? (cat === 'themes' ? '테마' : '업종') : '섹터';

  return (
    <div className="fin-card" style={{ padding: 14 }}>
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2 text-[11.5px] text-[var(--text-muted)]">
        <span>칸 크기 = 시가총액(큰 업종이 덮지 않게 제곱근 비율) · 색 = {period === 'daily' ? '오늘' : period === 'weekly' ? '이번 주' : '이번 달'} 등락률</span>
        <span className="ml-auto flex items-center gap-1 tabular-nums" aria-hidden>
          <span>−{cap}%</span>
          <span className="inline-block w-16 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, var(--down), var(--surface-2), var(--up))' }} />
          <span>+{cap}%</span>
        </span>
      </div>
      {/* 높이: 폰은 세로로 길게, PC는 가로로 넓게 */}
      <div ref={box} className="relative w-full h-[440px] sm:h-[400px] lg:h-[460px] rounded-lg overflow-hidden" role="group" aria-label={`${unit} 히트맵`}>
        {error ? <Empty /> : data && !data.items?.length ? <Empty text={EMPTY_SOURCE} /> : !data ? <div className="skeleton absolute inset-0" /> : tiles.map((t) => {
          const big = t.w > 46 && t.h > 30;
          const on = picked === t.item.code;
          return (
            <button key={t.item.code} type="button" onClick={() => setPicked(on ? null : t.item.code)}
              aria-pressed={on} aria-label={`${t.item.name} ${signPct(t.item.changeRate)}`} title={`${t.item.name} ${signPct(t.item.changeRate)}`}
              className="absolute overflow-hidden text-left transition-[filter] hover:brightness-110"
              style={{ left: t.x, top: t.y, width: t.w, height: t.h, background: bg(t.item.changeRate, cap), border: '1px solid var(--bg)', outline: on ? '2px solid var(--ink)' : 'none', outlineOffset: -2, padding: big ? '5px 6px' : 0 }}>
              {big && (
                <>
                  <span className="block truncate font-semibold text-[var(--ink)]" style={{ fontSize: t.w > 140 && t.h > 60 ? 13.5 : 11.5 }}>{t.item.name}</span>
                  <span className="block tabular-nums font-bold text-[var(--ink)]" style={{ fontSize: t.w > 140 && t.h > 60 ? 13 : 11 }}>{signPct(t.item.changeRate)}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {sel ? (
        <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3">
          <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
            <b className="text-[14px] text-[var(--ink)]">{sel.name}</b>
            <span className="tabular-nums font-bold text-[13.5px]" style={{ color: sel.changeRate > 0 ? 'var(--up)' : sel.changeRate < 0 ? 'var(--down)' : 'var(--text-muted)' }}>{signPct(sel.changeRate)}</span>
            <span className="ml-auto text-[11.5px] tabular-nums text-[var(--text-muted)]">상승 {sel.rising} · 보합 {sel.flat} · 하락 {sel.falling}</span>
          </div>
          {sel.top.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[11.5px] text-[var(--text-muted)] mr-1 self-center">시총 상위</span>
              {sel.top.map((s) => (
                <Link key={s.code} href={market === 'kr' ? `/stock/${s.code}` : `/overseas/${encodeURIComponent(s.code.replace(/\.[A-Z]{1,2}$/, ''))}`} className="btn-2nd !min-h-0 !py-1 !px-2.5 text-[12px]">{s.name}</Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] text-[var(--faint)]">칸을 누르면 상승·하락 종목 수와 시총 상위 종목이 나옵니다.</p>
      )}
    </div>
  );
}
