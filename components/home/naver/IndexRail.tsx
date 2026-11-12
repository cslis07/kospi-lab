'use client';

/**
 * 홈 상단 지수 카드 레일 — 코스피·코스닥·USD·S&P500·나스닥·다우존스 (네이버 실시간, 10초 갱신).
 * 모바일 = 가로 스크롤, 데스크탑(≥1024) = 6칸 그리드로 전부 노출(.idx-rail — globals.css).
 * 스파크: 국내 = 당일 분봉(점선 = 전일 종가), 해외·환율 = 최근 1개월. 장중이면 '● 실시간', 아니면 '장마감'.
 * 색: 상승=빨강(--warn) · 하락=파랑(--accent).
 * 카드를 누르면 시장지표 페이지와 같은 상세 시트(현재값·히스토리 차트·최근 내역·설명/영향)가 열린다(2026-10-29).
 * 2.0 '오늘의 시장'(기획서 §5.1-2): 사용자가 고른 지수 중 앞 6개만(편집에서 순서·선택), 52주 위치는 카드 hover(title)·상세로 축약.
 *   폰 2열 · 태블릿 3열 · PC 6열(globals .idx-rail).
 */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import BottomSheet from '@/components/ui/BottomSheet';
import type { LiveQuote } from '@/components/MarketIndicatorDetail';
import { useRailPref, DEFAULT_RAIL, RAIL_KEY } from '@/hooks/useRailPref';
import RailManager from '@/components/RailManager';
import { CardButton, type IndexCard } from '@/components/IndexCardView';

const STABLE = 'STABLE'; // 스테이블코인 전체 시총(lib/stablecoinCap)
const STABLE_FLAG = 'kospi-lab-rail-stable-v1'; // 이 기기 레일에 한 번 넣었는지

// 환율·시장지표(/api/naver/indicators) 응답 — 홈 레일 풀에 합쳐 레일에서도 선택·표시 가능하게
interface IndicatorQuote { code: string; name: string; cat: string; unit?: string; price: number; change: number; changeRate: number; status: string; spark: number[] }
function fromIndicator(q: IndicatorQuote): IndexCard {
  const dec = q.cat === 'bond' ? 4 : q.code === 'M04020000' ? 0 : 2;
  const live = q.status === '실시간' || q.status.endsWith('지연');
  return { code: q.code, name: q.name, value: q.price, change: q.change, changeRate: q.changeRate, live, spark: q.spark ?? [], sparkLabel: '1개월', week52High: null, week52Low: null, unit: q.unit, dec };
}
const fetcher = (u: string) => fetch(u).then((r) => r.json());
// 상세 시트는 카드를 눌러야 열리므로 지연 로딩(홈 첫 화면 번들에서 뺀다)
const MarketIndicatorDetail = dynamic(() => import('@/components/MarketIndicatorDetail'), {
  ssr: false, loading: () => <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>지표 불러오는 중…</p>,
});
// 레일 카드 → 상세 시트 입력. 시장지표 병합분은 원래 시세(지연 표기 포함) 그대로, 지수는 cat 'index', 홈의 원/달러는 시장지표 코드로.
function toQuote(c: IndexCard, ind?: IndicatorQuote): LiveQuote {
  if (ind) return ind;
  if (c.code === STABLE) return { code: c.code, name: c.name, cat: 'crypto', unit: '십억 달러', price: c.value, change: c.change, changeRate: c.changeRate, status: '일간 집계' };
  const fx = c.code === 'USDKRW';
  return { code: fx ? 'FX_USDKRW' : c.code, name: c.name, cat: fx ? 'exchange' : 'index', unit: fx ? '원' : c.unit, price: c.value, change: c.change, changeRate: c.changeRate, status: c.live ? '실시간' : '장마감' };
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
  const indByCode = new Map((indData?.items ?? []).map((q) => [q.code, q]));
  const [sel, setSel] = useState<string | null>(null); // 상세 시트에 띄울 카드 코드
  const selCard = sel ? byCode.get(sel) : undefined;
  const open = (code: string) => { setShowAll(false); setSel(code); };

  const { pref, save } = useRailPref(); // 관심종목 화면과 공유되는 단일 리스트(라이브 동기화)
  // 스테이블코인 시총 카드가 생긴 뒤 처음 한 번만 이 기기 레일에 넣는다 — 6칸이 차 있으면 6번째 자리에(밀린 지수는 목록에 남아 편집에서 되돌릴 수 있다).
  // 그 뒤로 사용자가 숨기면 다시 넣지 않는다.
  useEffect(() => {
    try {
      if (localStorage.getItem(STABLE_FLAG)) return;
      localStorage.setItem(STABLE_FLAG, '1');
      const raw = localStorage.getItem(RAIL_KEY);
      const cur: string[] = raw ? JSON.parse(raw) : DEFAULT_RAIL;
      if (!Array.isArray(cur) || cur.includes(STABLE)) return;
      const next = [...cur];
      next.splice(Math.min(next.length, 5), 0, STABLE);
      save(next);
    } catch { /* 저장 불가 환경 — 전체보기·편집에서 고를 수 있다 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false); // '전체보기' 팝업 — 전체 지수 한눈에
  const shown = pref.filter((c) => byCode.has(c)).slice(0, 6); // 홈 '오늘의 시장'은 6개까지(기획서 4~6개)

  // 팝업 열렸을 때 ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!showAll) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowAll(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [showAll]);

  // 터치 영역 36px 이상(글자는 작게 유지) — 2026-10-26 접근성 정리 전엔 높이 19px
  const topBtn: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', minHeight: 36, display: 'inline-flex', alignItems: 'center' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 8 }}>
        <h2 style={{ marginRight: 'auto', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>오늘의 시장</h2>
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
          ? Array.from({ length: DEFAULT_RAIL.length }).map((_, i) => <div key={i} className="idx-card skeleton" style={{ height: 112 }} />)
          : shown.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--faint)', gridColumn: '1 / -1' }}>표시할 지수가 없습니다. ⚙ 지수 편집에서 추가하세요.</p>
            : shown.map((code, i) => <CardButton key={code} c={byCode.get(code)!} on={i === 0} onClick={() => open(code)} />)}
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
              {cards.map((c) => <CardButton key={c.code} c={c} onClick={() => open(c.code)} />)}
            </div>
            <p style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 12, lineHeight: 1.5 }}>
              레일에 안 보이는 지수까지 전부 표시합니다. 카드를 누르면 상세를 봅니다. 레일에 넣을 지수는 <b style={{ color: 'var(--ink)' }}>⚙ 지수 편집</b>에서 고르세요. 상승 <span style={{ color: 'var(--warn)' }}>빨강</span>·하락 <span style={{ color: 'var(--accent)' }}>파랑</span>.
            </p>
          </div>
        </div>
      )}

      {/* 상세 시트 — 시장지표 페이지와 같은 화면(현재값 · 히스토리 · 최근 내역 · 설명/영향) */}
      <BottomSheet open={!!selCard} onClose={() => setSel(null)} title={selCard?.name ?? ''} full>
        {selCard && <MarketIndicatorDetail q={toQuote(selCard, indByCode.get(selCard.code))} />}
      </BottomSheet>
    </div>
  );
}
