/**
 * 프로모 배너 자리(레퍼런스의 초대 배너 레이아웃) — 이 앱에선 판촉 대신 '매매 규율' 리마인더.
 * 진입 신호가 아니라 손절·사이징을 먼저 정하게 하는 플래너로 보낸다(정직성 원칙과 일치).
 * 우측 그림은 직접 그린 추상 도형(막대 + 방패 체크).
 */
import Link from 'next/link';

export default function MarketBanner() {
  return (
    <Link href="/planner" className="fin-banner block">
      <div className="relative z-[1]">
        <div className="t">진입 전에<br />손절·사이징부터 정하세요</div>
        <div className="go">
          플래너로 1R 계산하기
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
      </div>
      <svg className="art" viewBox="0 0 124 100" aria-hidden>
        <circle cx="104" cy="84" r="22" fill="#fff" fillOpacity=".08" />
        <circle cx="30" cy="20" r="10" fill="#fff" fillOpacity=".08" />
        <rect x="14" y="56" width="15" height="38" rx="4.5" fill="#fff" fillOpacity=".24" />
        <rect x="35" y="42" width="15" height="52" rx="4.5" fill="#fff" fillOpacity=".38" />
        <rect x="56" y="28" width="15" height="66" rx="4.5" fill="#fff" fillOpacity=".55" />
        <path d="M97 12l19 7.5v13.5c0 11.5-8.2 19.8-19 24-10.8-4.2-19-12.5-19-24V19.5L97 12Z" fill="#fff" />
        <path d="M89.3 34l5.2 5.2 10.3-10.4" fill="none" stroke="#2f4ad8" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
