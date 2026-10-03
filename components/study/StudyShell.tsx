/**
 * 코인 기초 공부법 공통 레이아웃 — 과정 이동 탭·제목·소단원·팁/함정 상자·앱 링크·참고 자료. 서버 컴포넌트.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const COURSES = [
  { href: '/study',            n: 0, label: '개요',        title: '코인 기초 공부법',        desc: '왜 예측 대신 공부인가 · 10분 루틴' },
  { href: '/study/chart',      n: 1, label: '차트 기초',   title: '차트 보는 법',            desc: '캔들·추세·지지/저항·이동평균·거래량' },
  { href: '/study/indicators', n: 2, label: '보조지표',    title: '보조지표 — RSI·MACD·볼린저', desc: '과매수/과매도·교차·스퀴즈·다이버전스' },
  { href: '/study/fibonacci',  n: 3, label: '피보나치·패턴', title: '피보나치와 차트 패턴',   desc: '되돌림·골든 포켓·확장·이중천장·헤드앤숄더' },
  { href: '/study/macro',      n: 4, label: '거시·수급',   title: '금리·국채·유가와 코인',     desc: '금리·달러·유가·유동성·ETF·온체인·파생' },
] as const;

export function StudyNav({ current }: { current: string }) {
  return (
    <nav aria-label="공부법 과정" className="-mx-1 mb-4 overflow-x-auto">
      <div className="flex gap-1.5 px-1 w-max">
        {COURSES.map((c) => {
          const on = c.href === current;
          return (
            <Link key={c.href} href={c.href} aria-current={on ? 'page' : undefined}
              className="shrink-0 px-3 py-1.5 rounded-full border text-[12px] font-semibold whitespace-nowrap"
              style={on ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              {c.n > 0 ? `${c.n}. ` : ''}{c.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** 제목 아래 안내문 — h1 은 각 페이지가 직접 둔다(tests/headings 가 page.tsx 의 h1 을 확인) */
export function StudyLead({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">{children}</p>;
}

/** 소단원 — 목차 앵커용 id */
export function Lesson({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="fin-card p-4 mb-4 scroll-mt-20">
      <h2 className="text-[15px] font-bold text-[var(--text)] flex items-start gap-2 mb-2">
        <span className="shrink-0 min-w-6 h-6 px-1 grid place-items-center rounded-lg text-xs font-extrabold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>{n}</span>
        {title}
      </h2>
      <div className="text-[13px] leading-relaxed text-[var(--text-muted)] space-y-2 [&_b]:text-[var(--text)]">{children}</div>
    </section>
  );
}

export function Toc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] px-3.5 py-2.5">
      <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1">이 페이지에서</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((it) => <a key={it.id} href={`#${it.id}`} className="text-[12.5px] text-[var(--accent-ink)] font-semibold">{it.label}</a>)}
      </div>
    </div>
  );
}

export function Trap({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed rounded-lg px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--ink-2)' }}>
      <b style={{ color: 'var(--warn)' }}>함정</b> · {children}
    </p>
  );
}

export function Tip({ children, title = '이렇게 쓴다' }: { children: ReactNode; title?: string }) {
  return (
    <p className="text-[12px] leading-relaxed rounded-lg px-3 py-2" style={{ background: 'var(--ok-soft)', color: 'var(--ink-2)' }}>
      <b style={{ color: 'var(--ok)' }}>{title}</b> · {children}
    </p>
  );
}

export function AppLinks({ links, note }: { links: { href: string; label: string }[]; note?: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1">앱에서 보는 곳</p>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <Link key={l.href + l.label} href={l.href}
              className="inline-flex items-center px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--accent-ink)] font-semibold">
              {l.label} →
            </Link>
          ))}
        </div>
      )}
      {note && <p className="text-[11px] text-[var(--faint)] mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

/** 표 — 첫 열 굵게 */
export function KvTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[12px] mx-1">
        <thead><tr className="text-left text-[var(--text-muted)]">{head.map((h) => <th key={h} className="font-semibold py-1 pr-2 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[var(--line-2)] align-top">
              {r.map((c, j) => <td key={j} className={`py-1.5 pr-2 ${j === 0 ? 'font-bold text-[var(--text)] whitespace-nowrap' : 'text-[var(--text-muted)]'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 다음 과정 + 참고 자료 + 면책 */
export function StudyFooter({ current, sources }: { current: string; sources?: { href: string; label: string }[] }) {
  const i = COURSES.findIndex((c) => c.href === current);
  const next = COURSES[i + 1];
  return (
    <>
      {next && (
        <Link href={next.href} className="fin-card fin-row mb-4 block">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-[var(--text-muted)]">다음 과정</div>
            <div className="nm">{next.n}. {next.title}</div>
            <div className="sb truncate">{next.desc}</div>
          </div>
          <span aria-hidden className="text-[var(--faint)]">→</span>
        </Link>
      )}
      {sources && sources.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1">더 읽을거리(외부)</p>
          <ul className="space-y-0.5">
            {sources.map((s) => (
              <li key={s.href}><a href={s.href} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[var(--accent-ink)] break-all">{s.label} ↗</a></li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4">
        일반적인 기술적·거시 분석 개념을 이 앱의 화면에 연결해 정리한 학습 자료입니다. 그림은 설명용 가상 데이터이며 실제 시세가 아닙니다.
        어떤 지표·패턴도 단독으로 방향을 보장하지 않으며(이 앱의 자체 측정에서도 예측 우위가 확인되지 않음), 모든 내용은 참고용이고 투자 권유가 아닙니다.
      </p>
    </>
  );
}
