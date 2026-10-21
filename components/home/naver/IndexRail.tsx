'use client';

/**
 * 홈 상단 지수 카드 레일 — 코스피·코스닥·USD·S&P500·나스닥·다우존스 (네이버 실시간, 10초 갱신).
 * 모바일 = 가로 스크롤, 데스크탑(≥1024) = 6칸 그리드로 전부 노출(.idx-rail — globals.css).
 * 스파크: 국내 = 당일 분봉(점선 = 전일 종가), 해외·환율 = 최근 1개월. 장중이면 '● 실시간', 아니면 '장마감'.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent).
 */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRailPref, DEFAULT_RAIL } from '@/hooks/useRailPref';
import RailManager from '@/components/RailManager';

interface IndexCard {
  code: string; name: string; value: number; change: number; changeRate: number;
  live: boolean; spark: number[]; sparkLabel: string;
  week52High?: number | null; week52Low?: number | null;
  unit?: string; dec?: number; // 시장지표 병합분 표기용(금리 % · 국내금 원 등)
}

// 환율·시장지표(/api/naver/indicators) 응답 — 홈 레일 풀에 합쳐 레일에서도 선택·표시 가능하게
interface IndicatorQuote { code: string; name: string; cat: string; unit?: string; price: number; change: number; changeRate: number; status: string; spark: number[] }
function fromIndicator(q: IndicatorQuote): IndexCard {
  const dec = q.cat === 'bond' ? 4 : q.code === 'M04020000' ? 0 : 2;
  const live = q.status === '실시간' || q.status.endsWith('지연');
  return { code: q.code, name: q.name, value: q.price, change: q.change, changeRate: q.changeRate, live, spark: q.spark ?? [], sparkLabel: '1개월', week52High: null, week52Low: null, unit: q.unit, dec };
}
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colorOf = (c: number) => (c > 0 ? 'var(--warn)' : c < 0 ? 'var(--accent)' : 'var(--faint)');

/** 폭 100% 반응형 스파크 — viewBox 늘림 + non-scaling-stroke 로 선 두께 유지 */
function Spark({ points, change, base }: { points: number[]; change: number; base?: number }) {
  const W = 100, H = 30;
  if (!points || points.length < 2) return <div style={{ height: H }} aria-hidden />;
  const lo = Math.min(...points, base ?? Infinity), hi = Math.max(...points, base ?? -Infinity);
  const span = hi - lo || 1;
  const X = (i: number) => (i / (points.length - 1)) * W;
  const Y = (v: number) => 2 + (1 - (v - lo) / span) * (H - 4);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
  const col = colorOf(change);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden style={{ display: 'block' }}>
      {base != null && base >= lo && base <= hi && (
        <line x1={0} x2={W} y1={Y(base)} y2={Y(base)} stroke="var(--faint)" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" opacity={0.7} />
      )}
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={col} opacity={0.1} />
      <path d={d} fill="none" stroke={col} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ c, on }: { c: IndexCard; on?: boolean }) {
  const col = colorOf(c.change);
  const arrow = c.change > 0 ? '▲' : c.change < 0 ? '▼' : '·';
  const isKr = c.sparkLabel === '오늘';
  const d = c.dec ?? 2; // 금리=4자리·국내금=정수 등 시장지표 소수자리
  const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (
    <div className={`idx-card${on ? ' on' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
        <span className={`idx-live${c.live ? ' on' : ''}`} style={{ marginLeft: 'auto' }}>
          <i />{c.live ? '실시간' : '장마감'}
        </span>
      </div>
      <div className="tabular-nums" style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em', marginTop: 4 }}>
        {f(c.value)}{c.unit === '%' ? <span style={{ fontSize: 12, marginLeft: 1 }}>%</span> : null}
      </div>
      <div className="tabular-nums" style={{ fontSize: 11.5, fontWeight: 700, color: col, marginTop: 1, whiteSpace: 'nowrap' }}>
        {arrow} {f(Math.abs(c.change))} ({c.changeRate >= 0 ? '+' : ''}{c.changeRate.toFixed(2)}%)
      </div>
      <div style={{ marginTop: 6 }}>
        <Spark points={c.spark} change={c.change} base={isKr ? c.value - c.change : undefined} />
      </div>
      <Pos52 low={c.week52Low} high={c.week52High} value={c.value} />
    </div>
  );
}

/** 52주 범위 내 현재가 위치 — 레일 카드용 미니 바 */
function Pos52({ low, high, value }: { low?: number | null; high?: number | null; value: number }) {
  if (low == null || high == null || high <= low) return <div style={{ height: 16 }} aria-hidden />;
  const pct = Math.round(Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100)));
  return (
    <div style={{ marginTop: 6 }} title={`52주 범위 중 ${pct}% (${fmt(low)}~${fmt(high)})`}>
      <div style={{ position: 'relative', height: 3, borderRadius: 99, background: 'var(--surface-2)' }}>
        <div style={{ position: 'absolute', left: `calc(${pct}% - 3px)`, top: -1.5, width: 6, height: 6, borderRadius: '50%', background: 'var(--ink)', border: '1.5px solid var(--surface)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--faint)', marginTop: 2 }}>
        <span>52주</span><span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

export default function IndexRail() {
  const { data } = useSWR<{ cards: IndexCard[] }>('/api/home/indices', fetcher, { refreshInterval: 10000, revalidateOnFocus: true });
  // 환율·시장지표도 레일 풀에 합친다(사용자가 WTI·금·국채금리·EUR·JPY 등도 상단 레일에 올릴 수 있게)
  const { data: indData } = useSWR<{ items: IndicatorQuote[] }>('/api/naver/indicators', fetcher, { refreshInterval: 30000 });
  const homeCards = data?.cards ?? [];
  const homeNames = new Set(homeCards.map((c) => c.name));
  const marketCards = (indData?.items ?? []).filter((q) => !homeNames.has(q.name)).map(fromIndicator); // 미국 USD 중복 제외
  const cards = [...homeCards, ...marketCards];
  const byCode = new Map(cards.map((c) => [c.code, c]));
  const poolCodes = cards.map((c) => c.code);
  const nameOf = (code: string) => byCode.get(code)?.name ?? code;

  const { pref, save } = useRailPref(); // 관심종목 화면과 공유되는 단일 리스트(라이브 동기화)
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false); // '전체보기' 팝업 — 전체 지수 한눈에
  const shown = pref.filter((c) => byCode.has(c));

  // 팝업 열렸을 때 ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!showAll) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAll(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [showAll]);

  const topBtn: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 6 }}>
        {cards.length > 0 && (
          <button type="button" onClick={() => setShowAll(true)} style={topBtn}>▦ 전체보기</button>
        )}
        <button type="button" onClick={() => setEditing((e) => !e)} style={topBtn}>
          {editing ? '완료' : '⚙ 지수 편집'}
        </button>
      </div>
      {editing && (
        <div style={{ marginBottom: 10 }}>
          <RailManager pref={pref} poolCodes={poolCodes} nameOf={nameOf} save={save} />
        </div>
      )}
      <div className="idx-rail">
        {cards.length === 0
          ? Array.from({ length: DEFAULT_RAIL.length }).map((_, i) => <div key={i} className="idx-card skeleton" style={{ height: 128 }} />)
          : shown.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--faint)', gridColumn: '1 / -1' }}>표시할 지수가 없습니다. ⚙ 지수 편집에서 추가하세요.</p>
            : shown.map((code, i) => <Card key={code} c={byCode.get(code)!} on={i === 0} />)}
      </div>

      {showAll && (
        <div role="dialog" aria-modal="true" aria-label="전체 지수" onClick={() => setShowAll(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 12px', overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 820, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>전체 지수{' '}
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--faint)' }}>{cards.length}개 · 실시간</span>
              </span>
              <button type="button" onClick={() => setShowAll(false)} aria-label="닫기"
                style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, lineHeight: 1, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {cards.map((c) => <Card key={c.code} c={c} />)}
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 12, lineHeight: 1.5 }}>
              레일에 안 보이는 지수까지 전부 표시합니다. 레일에 넣을 지수는 <b style={{ color: 'var(--ink)' }}>⚙ 지수 편집</b>에서 고르세요. 상승 <span style={{ color: 'var(--warn)' }}>빨강</span>·하락 <span style={{ color: 'var(--accent)' }}>파랑</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
