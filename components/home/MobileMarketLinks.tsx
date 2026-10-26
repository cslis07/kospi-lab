/**
 * 모바일 홈 맨 아래 — 데스크탑에만 남긴 시장 섹션(지수 차트·뉴스·랭킹·산업·리서치·ETF·지표)으로 가는 길.
 * 2026-10-26 메뉴 2단계: 모바일 홈을 매매자 기준(상태·바로가기·복기·지수 레일·브리핑)으로 줄이고 시장 정보는 시장 탭으로.
 */
import Link from 'next/link';

const LINKS: [string, string, string][] = [
  ['/domestic', '국내 시장', '코스피·코스닥 차트·등락'],
  ['/overseas', '해외 시장', '나스닥·S&P500'],
  ['/ranking', '실시간 랭킹', '거래대금·인기·상승·하락'],
  ['/news', '뉴스', '국내·해외 시장 소식'],
];

export default function MobileMarketLinks() {
  return (
    <section className="md:hidden mt-4" aria-label="시장 정보 바로가기">
      <div className="fin-sec"><h3 className="!text-[15px]">시장 정보</h3><Link href="/domestic" className="fin-more">시장 탭</Link></div>
      <div className="grid grid-cols-2 gap-2">
        {LINKS.map(([href, label, desc]) => (
          <Link key={href} href={href} className="fin-card px-3 py-2.5 min-h-[56px] hover-lift">
            <span className="block text-[13px] font-semibold text-[var(--text)]">{label}</span>
            <span className="block text-[11px] text-[var(--text-muted)] truncate">{desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
