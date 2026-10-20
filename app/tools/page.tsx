'use client';

/**
 * 더보기 도구 대시보드 — 흩어진 보조 도구를 한 화면에.
 * 경제지표 요약 + 최신 뉴스(홈 위젯 재사용) + 도구 전체 그리드(EXTRAS). 상세는 각 전체보기/카드로 드릴다운.
 * '더보기' 상단 내비 알약이 이 페이지로 연결된다(components/NavTabs).
 */
import useSWR from 'swr';
import Link from 'next/link';
import { EXTRAS, ICON } from '@/lib/menu';
import HomeNews from '@/components/home/naver/HomeNews';
import type { MacroIndicator } from '@/lib/macroData';

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function ToolIcon({ name }: { name: string }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICON[name]} />
    </svg>
  );
}

const chgCls = (v: number | null | undefined) => (v == null || v === 0 ? 'text-[var(--text-muted)]' : v > 0 ? 'text-red-400' : 'text-blue-400');
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);
const MACRO_KEY: [string, string][] = [['cpi', '미 CPI'], ['dxy', '달러지수'], ['wti', '국제유가'], ['usdkrw', '원/달러']];

export default function ToolsPage() {
  const { data: macro } = useSWR<MacroIndicator[]>('/api/macro/indicators', fetcher, { refreshInterval: 300000 });
  const mi = (id: string) => (macro ?? []).find((x) => x.id === id);

  return (
    <div className="pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">더보기 도구</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">자주 쓰는 보조 도구를 한 화면에 모았습니다. 요약을 보고 <b className="text-[var(--text)]">전체보기</b>로 들어가세요.</p>

      {/* 경제지표 요약 */}
      <div className="fin-sec"><h3 className="!text-[15px]">경제지표</h3><Link href="/macro" className="fin-more">전체보기</Link></div>
      <div className="fin-card p-4 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MACRO_KEY.map(([id, label]) => {
            const it = mi(id);
            return (
              <div key={id}>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{label}</p>
                <p className="text-base font-bold tabular-nums text-[var(--text)] mt-0.5">
                  {it?.latest ? it.latest.value.toLocaleString('en-US', { minimumFractionDigits: it.decimals, maximumFractionDigits: it.decimals }) : '—'}
                </p>
                <p className={`text-[11px] font-semibold tabular-nums ${chgCls(it?.changePct)}`}>{it?.changePct == null ? '—' : `${it.changePct > 0 ? '▲' : it.changePct < 0 ? '▼' : ''} ${fmtPct(it.changePct)}`}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 최신 뉴스 — 홈 위젯 재사용 */}
      <div className="fin-sec"><h3 className="!text-[15px]">최신 뉴스</h3><Link href="/news" className="fin-more">전체보기</Link></div>
      <div className="mb-5"><HomeNews /></div>

      {/* 도구 전체 */}
      <div className="fin-sec"><h3 className="!text-[15px]">도구 전체</h3></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {EXTRAS.filter((t) => !t.hidden).map((t) => (
          <Link key={t.href} href={t.href} className="fin-card p-3 flex items-center gap-2.5 hover-lift">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--accent-soft)] text-[var(--accent)] shrink-0"><ToolIcon name={t.icon} /></span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[var(--text)] truncate">{t.label}</span>
              {t.desc && <span className="block text-[10px] text-[var(--text-muted)] truncate">{t.desc}</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
