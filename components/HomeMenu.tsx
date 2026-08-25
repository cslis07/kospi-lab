import Link from 'next/link';

// 모바일 홈 런처 — 아이콘 타일 그리드 (아이쑥쑥·약보듬 앱의 홈메뉴 방식)
// NavTabs 의 그룹 구조와 동일한 라우트를 한눈에 탭할 수 있게 편다.
type Tile = { href: string; icon: string; label: string; external?: boolean };
type Group = { label: string; tint: keyof typeof TINT; items: Tile[] };

// Tailwind 는 정적 문자열만 스캔하므로 색 조합을 리터럴로 고정해 둔다(동적 `bg-${c}` 금지).
const TINT = {
  sky:     'bg-sky-500/15 border-sky-500/25',
  emerald: 'bg-emerald-500/15 border-emerald-500/25',
  violet:  'bg-violet-500/15 border-violet-500/25',
  amber:   'bg-amber-500/15 border-amber-500/25',
} as const;

const GROUPS: Group[] = [
  {
    label: '시장', tint: 'sky', items: [
      { href: '/domestic',                icon: '🇰🇷', label: '국내주식' },
      { href: '/overseas',                icon: '🌐', label: '해외주식' },
      { href: '/my-stocks?market=crypto', icon: '₿',  label: '코인' },
      { href: '/futures',                 icon: '⚡', label: '선물' },
    ],
  },
  {
    label: '내 자산', tint: 'emerald', items: [
      { href: '/portfolio', icon: '💰', label: '통합자산' },
      { href: '/my-stocks', icon: '⭐', label: '내 주식' },
      { href: '/bitget',    icon: '🪙', label: '비트겟' },
      { href: '/risk',      icon: '🛡', label: '통합리스크' },
      { href: '/virtual',   icon: '🧪', label: '가상투자' },
    ],
  },
  {
    label: '분석', tint: 'violet', items: [
      { href: '/stock-analysis', icon: '🔬', label: '국내분석' },
      { href: '/coin-analysis',  icon: '📡', label: '코인분석' },
      { href: '/journal',        icon: '📓', label: '매매일지' },
      { href: '/growth',         icon: '🌱', label: '성장주' },
      { href: '/screener',       icon: '🔍', label: '스크리너' },
      { href: '/krx',            icon: '🏅', label: 'KRX시장' },
      { href: '/news',           icon: '📰', label: '뉴스' },
      { href: '/dart',           icon: '📋', label: '공시' },
      { href: '/report',         icon: '📊', label: '리포트' },
      { href: '/calendar',       icon: '📅', label: '캘린더' },
    ],
  },
  {
    label: '설계', tint: 'amber', items: [
      { href: '/invest',    icon: '🧭', label: '투자설계' },
      { href: '/tax',       icon: '💸', label: '세제혜택' },
      { href: '/simulate',  icon: '📈', label: '시뮬레이션' },
      { href: '/brokerage', icon: '🏦', label: '증권사' },
      { href: '/guide.html', icon: '📖', label: '이용가이드', external: true },
    ],
  },
];

function TileLink({ t, tint }: { t: Tile; tint: string }) {
  const inner = (
    <>
      <span className={`w-14 h-14 rounded-2xl grid place-items-center text-2xl border ${tint}`}>{t.icon}</span>
      <span className="text-[11px] font-semibold text-[var(--text)] text-center leading-tight">{t.label}</span>
    </>
  );
  const cls = 'flex flex-col items-center gap-1.5 active:scale-95 transition-transform';
  return t.external
    ? <a href={t.href} className={cls}>{inner}</a>
    : <Link href={t.href} className={cls}>{inner}</Link>;
}

export default function HomeMenu() {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-bold text-[var(--text)]">전체 메뉴</h2>
        <span className="text-[11px] text-[var(--text-muted)]">아이콘을 눌러 바로 이동</span>
      </div>
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">{g.label}</p>
            <div className="grid grid-cols-4 gap-y-4 gap-x-2">
              {g.items.map((t) => <TileLink key={t.href} t={t} tint={TINT[g.tint]} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
