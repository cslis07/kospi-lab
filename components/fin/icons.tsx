/**
 * 핀테크 카드용 라인 아이콘 — 직접 그린 원본(viewBox 24, stroke=currentColor).
 * 메뉴 아이콘(lib/menu ICON)과 같은 굵기·라운드 규칙을 따른다.
 */
export const FIN_ICON: Record<string, string> = {
  percent:  'M19 5L5 19M7.5 4.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M16.5 14.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  drop:     'M12 3.5c3.3 4.1 5.6 7.3 5.6 10.1a5.6 5.6 0 0 1-11.2 0c0-2.8 2.3-6 5.6-10.1ZM9.4 14.2a2.7 2.7 0 0 0 2.6 2.6',
  dollar:   'M12 3v18M16.5 7.6c-.8-1.3-2.4-2.1-4.5-2.1-2.6 0-4.5 1.3-4.5 3.2 0 4.6 9.5 2.4 9.5 7 0 1.9-2 3.3-4.8 3.3-2.3 0-4-.9-4.8-2.3',
  won:      'M4 6l3 12 3.2-9h3.6L17 18l3-12M3 10.5h18M3 13.5h18',
  flag:     'M5 21V4M5 4h11.5l-2.2 4 2.2 4H5',
  gauge:    'M4 16.5a8 8 0 1 1 16 0M12 16.5l3.8-4.8M7 16.5h.01M17 16.5h.01',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6ZM4 9.5h16M8 3v4M16 3v4M8 13.5h3',
  star:     'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  chevron:  'M9 5l7 7-7 7',
  arrow:    'M5 12h14M13 6l6 6-6 6',
};

export function FinIcon({ name, className = 'w-5 h-5' }: { name: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={FIN_ICON[name] ?? FIN_ICON.percent} />
    </svg>
  );
}
