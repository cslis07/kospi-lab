'use client';

/** 분석 › 종목 분석 안의 시장 전환(국내주식 | 코인선물) — 두 화면을 한 메뉴 항목으로 묶는다. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/stock-analysis', label: '국내주식' },
  { href: '/coin-analysis', label: '코인선물' },
];

export default function AnalysisSwitch() {
  const pathname = usePathname();
  return (
    <div className="seg mb-4" role="tablist" aria-label="분석 대상 시장">
      {ITEMS.map((it) => {
        const on = pathname === it.href;
        return (
          <Link key={it.href} href={it.href} role="tab" aria-selected={on} className={`seg-i ${on ? 'on' : ''}`}>
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
