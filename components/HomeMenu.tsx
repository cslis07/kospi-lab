import Link from 'next/link';

// 모바일 홈 런처 — 아이콘 타일 그리드 (아이쑥쑥·약보듬 앱의 홈메뉴 방식)
// NavTabs 의 그룹 구조와 동일한 라우트를 한눈에 탭할 수 있게 편다.
type Tile = { href: string; icon: string; label: string; external?: boolean };
type Group = { label: string; tint: keyof typeof TINT; items: Tile[] };

// 토스 소프트 틴트(globals.css .tint-*) — 라이트·다크 토큰 자동 대응.
const TINT = {
  sky:     'tint-a', // 파랑 (시장)
  emerald: 'tint-b', // 초록 (내 자산)
  violet:  'tint-c', // 보라 (분석)
  amber:   'tint-d', // 앰버 (설계)
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
      <span className={`ic ${tint}`}>{t.icon}</span>
      <span className="tx">{t.label}</span>
    </>
  );
  return t.external
    ? <a href={t.href} className="home-tile">{inner}</a>
    : <Link href={t.href} className="home-tile">{inner}</Link>;
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
            <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-2.5 uppercase tracking-wide">{g.label}</p>
            <div className="home-grid">
              {g.items.map((t) => <TileLink key={t.href} t={t} tint={TINT[g.tint]} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
