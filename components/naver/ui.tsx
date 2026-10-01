'use client';

/**
 * 네이버 증권 기능 메뉴(산업 트렌드·리서치·시장지표·테마 ETF·실시간 랭킹) 공용 UI 조각.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent) 한국 관행. 토큰만 사용(라이트/다크 자동).
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

export const colorOf = (v: number) => (v > 0 ? 'var(--warn)' : v < 0 ? 'var(--accent)' : 'var(--faint)');
export const arrowOf = (v: number) => (v > 0 ? '▲' : v < 0 ? '▼' : '');
export const signPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

/** 원 단위 큰 수 → 조/억 (네이버 표기). 먼저 최소 단위로 반올림한 뒤 나눠야 '10000억'·'10천만' 같은 자리올림 누락이 없다 */
export function fmtKrw(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) { const t = Math.round(a / 1e8), jo = Math.floor(t / 1e4), eok = t % 1e4; return `${jo.toLocaleString()}조${eok ? ` ${eok.toLocaleString()}억` : ''}`; }
  if (a >= 1e8) return `${Math.round(a / 1e8).toLocaleString()}억`;
  if (a >= 1e4) return `${Math.round(a / 1e4).toLocaleString()}만`;
  return a.toLocaleString();
}
/** 달러 큰 수 → $억/천만 (네이버 표기: '$232억 5천만') */
export function fmtUsdBig(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e8) { const t = Math.round(a / 1e7), eok = Math.floor(t / 10), man = t % 10; return `$${eok.toLocaleString()}억${man ? ` ${man}천만` : ''}`; }
  if (a >= 1e4) return `$${Math.round(a / 1e4).toLocaleString()}만`;
  return `$${a.toLocaleString()}`;
}
/** 달러 가격 — 천 단위 쉼표 + 소수 2자리 */
export const fmtUsd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtCount = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()}만` : v.toLocaleString());

export function Change({ change, rate, currency, small }: { change?: number; rate: number; currency?: 'KRW' | 'USD'; small?: boolean }) {
  const c = colorOf(rate);
  const amt = change == null ? '' : currency === 'USD' ? Math.abs(change).toFixed(2) : Math.abs(change).toLocaleString();
  return (
    <span className="tabular-nums" style={{ color: c, fontSize: small ? 11.5 : 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {arrowOf(rate)}{amt ? `${amt}(` : ''}{signPct(rate)}{amt ? ')' : ''}
    </span>
  );
}

/** 종목 뱃지 — 로고 있으면 로고, 없으면 이름 첫 글자 원형 */
export function Badge({ name, logo, size = 34 }: { name: string; logo?: string; size?: number }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'var(--surface-2)', objectFit: 'cover' }} />;
  }
  const hue = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.36, fontWeight: 800, color: '#fff', background: `hsl(${hue} 45% 45%)` }}>
      {(name || '?').trim().charAt(0)}
    </span>
  );
}

/** 선택 칩 묶음(기존 .seg 토큰 재사용) */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" style={{ maxWidth: '100%', overflowX: 'auto' }}>
      {options.map(([k, l]) => <button key={k} className={`seg-i ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

/** 폭 100% 미니 라인 */
export function MiniLine({ points, rate, height = 34 }: { points: number[]; rate: number; height?: number }) {
  if (!points || points.length < 2) return <div style={{ height }} aria-hidden />;
  const W = 100, H = height, lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1;
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * W).toFixed(2)},${(2 + (1 - (v - lo) / span) * (H - 4)).toFixed(2)}`).join(' ');
  const col = colorOf(rate);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden style={{ display: 'block' }}>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={col} opacity={0.1} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** 섹션 제목. big = 홈(PC) 섹션용(네이버 증권 홈처럼 큰 부제목 + 넉넉한 아래 간격). live = 응답 asOf → 실시간 배지 */
export function SectionTitle({ title, sub, right, big, live, every }: { title: string; sub?: string; right?: React.ReactNode; big?: boolean; live?: string; every?: number }) {
  return (
    <div className="nv-head" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: big ? 14 : 12 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: big ? 22 : 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h2>
      {live !== undefined && <LiveStamp asOf={live} every={every} />}
      {sub && <span style={{ fontSize: 12, color: 'var(--faint)' }}>{sub}</span>}
      {right && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{right}</div>}
    </div>
  );
}

/** 홈 섹션 → 전체 메뉴 페이지로 */
export function MoreLink({ href, label = '전체보기' }: { href: string; label?: string }) {
  return (
    <Link href={href} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap', textDecoration: 'none', padding: '6px 4px' }}>
      {label} →
    </Link>
  );
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, color: 'var(--faint)', marginTop: 12, lineHeight: 1.6 }}>{children}</p>;
}

/** 요청은 성공했는데 0건 — 비공식 API 구조 변경 가능성을 숨기지 않고 알린다(빈 박스·무한 스켈레톤 금지) */
export const EMPTY_SOURCE = '네이버 증권에서 받은 데이터가 없습니다. 원본 구조가 바뀌었을 수 있어요 — 잠시 후 다시 시도됩니다.';

export function Empty({ text = '데이터를 불러오지 못했습니다. 잠시 후 다시 시도됩니다.' }: { text?: string }) {
  return <div style={{ padding: '28px 8px', textAlign: 'center', fontSize: 13, color: 'var(--faint)' }}>{text}</div>;
}

export function StockLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>{children}</div>;
  // 종목 행 링크는 미리 불러오지 않음 — 목록마다 수십 건의 서버 렌더(동적 상세 페이지) 요청이 생긴다
  return <Link prefetch={false} href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, textDecoration: 'none', color: 'inherit' }}>{children}</Link>;
}

/* ────────────────── 실시간 표시 ────────────────── */

/** 한국 정규장(평일 09:00~15:30 KST) 여부 — 공휴일은 모름(배지에 '장중'이 떠도 값은 네이버 그대로) */
export function krMarketOpen(now = Date.now()): boolean {
  const k = new Date(now + 9 * 3600_000);
  const wd = k.getUTCDay(), m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return wd >= 1 && wd <= 5 && m >= 540 && m <= 930;
}

/** ● 실시간 · 15:02:31 — 마지막 응답 시각. 장 밖이면 회색 점 + '장마감'(값은 계속 갱신) */
export function LiveStamp({ asOf, every }: { asOf?: string; every?: number }) {
  // 장중 여부는 마운트 후 계산(정적 HTML은 빌드 시각 기준이라 그대로 쓰면 하이드레이션 불일치)
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(krMarketOpen()); }, [asOf]);
  // KST HH:MM:SS (toLocaleTimeString 'ko-KR' 은 '9시 20분 18초'로 길어진다)
  const t = asOf ? new Date(new Date(asOf).getTime() + 9 * 3600_000).toISOString().slice(11, 19) : '';
  return (
    <span className={`idx-live${open ? ' on' : ''}`} title={every ? `${every}초마다 자동 갱신` : undefined} style={{ fontSize: 11.5 }}>
      <i />{open ? '실시간' : '장마감'}{t && <span className="tabular-nums" style={{ marginLeft: 4, fontWeight: 500, color: 'var(--faint)' }}>{t}</span>}
    </span>
  );
}

/** 값이 바뀌면 잠깐 반짝임(오르면 빨강·내리면 파랑, 네이버 시세판처럼). 첫 표시엔 반짝이지 않는다 */
export function Flash({ value, children }: { value: number; children: React.ReactNode }) {
  const prev = useRef(value);
  const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (prev.current === value) return;
    const d = value > prev.current ? 'up' : 'down';
    prev.current = value;
    setDir(d);
    const t = setTimeout(() => setDir(''), 900);
    return () => clearTimeout(t);
  }, [value]);
  return <span className={dir ? `nv-flash nv-flash-${dir}` : 'nv-flash'}>{children}</span>;
}
