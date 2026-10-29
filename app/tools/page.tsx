'use client';

/**
 * 전체 메뉴(2.0) — 모바일 하단 '더보기' 탭의 목적지. 1차 메뉴 6개(lib/menu MENU, 대시보드 제외)를 소제목까지 펼치고,
 * 그 아래 보조 도구 허브(TOOL_SECTIONS: 종목 도구·학습/매매 교본). 사이드바 '전체 도구'도 여기로.
 * 아래엔 '오늘의 경제' 요약(경제지표 4개 + 다음 발표 2건)만 — 달력·지난 발표·뉴스 전문은 각 화면에서(2026-10-26 단순화).
 * '더보기' 상단 내비 알약이 이 페이지로 연결된다(components/NavTabs). 맨 아래 '설정 · 정보'(동기화·이용가이드)는 옛 /more 에서, 데이터 백업·복원(#backup)은 옛 가상 계좌(/virtual)에서 옮김(둘 다 여기로 리디렉션).
 */
import useSWR from 'swr';
import Link from 'next/link';
import { EXTRAS, ICON, MENU, TOOL_SECTIONS, GUIDE, type MenuItem } from '@/lib/menu';
import SyncIndicator from '@/components/SyncIndicator';
import BackupPanel from '@/components/BackupPanel';
import NextReleases from '@/components/NextReleases';
import type { ReleaseCalendar } from '@/lib/inflation';
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
  const { data: relCal } = useSWR<ReleaseCalendar>('/api/nf/release_calendar.json', fetcher, { revalidateOnFocus: false });

  return (
    <div className="pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">전체 메뉴</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">모든 화면과 보조 도구를 <b className="text-[var(--text)]">이용 목적별</b>로 모았습니다.</p>

      {/* 1차 메뉴 6개(대시보드 제외) + 도구 허브 — lib/menu 단일 소스 */}
      {[
        ...MENU.filter((g) => g.key !== 'home').map((g) => ({ key: g.key, label: g.label, desc: '', items: g.items })),
        ...TOOL_SECTIONS.map((sec) => ({ key: sec.key, label: sec.label, desc: sec.desc, items: EXTRAS.filter((x) => x.section === sec.key) as MenuItem[] })),
      ].map((sec) => {
        const items = sec.items.filter((x) => !x.hidden);
        if (!items.length) return null;
        return (
          <section key={sec.key} className="mb-5">
            <div className="fin-sec"><h3 className="!text-[15px]">{sec.label}</h3><span className="text-[11px] text-[var(--text-muted)]">{sec.desc}</span></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map((x) => (
                <Link key={x.href} href={x.href} className="fin-card p-3 flex items-center gap-2.5 hover-lift">
                  <span className="w-9 h-9 rounded-xl grid place-items-center bg-[var(--accent-soft)] text-[var(--accent)] shrink-0"><ToolIcon name={x.icon} /></span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-[var(--text)] truncate">{x.label}</span>
                    {x.desc && <span className="block text-[10px] text-[var(--text-muted)] truncate">{x.desc}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* 오늘의 경제 — 요약만(달력·지난 발표·뉴스 전문은 각 화면에서) */}
      <div className="fin-sec"><h3 className="!text-[15px]">오늘의 경제</h3><Link href="/calendar" className="fin-more">캘린더</Link></div>
      <div className="fin-card p-4 mb-3">
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
      {relCal?.events?.length ? <NextReleases rc={relCal} limit={2} /> : null}

      {/* 설정 · 정보 — 옛 /more 페이지에서 옮김 */}
      <div className="fin-sec mt-5"><h3 className="!text-[15px]">설정 · 정보</h3></div>
      <div className="fin-card overflow-hidden">
        <div className="list-row">
          <span className="text-sm font-semibold">클라우드 동기화</span>
          <span className="ml-auto"><SyncIndicator /></span>
        </div>
        <BackupPanel />
        <a href={GUIDE.href} className="list-row">
          <span className="text-sm font-semibold">{GUIDE.label}</span>
          <span className="ml-auto text-[var(--text-muted)]" aria-hidden>›</span>
        </a>
      </div>
    </div>
  );
}
