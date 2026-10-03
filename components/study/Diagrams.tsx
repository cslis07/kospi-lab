/**
 * 공부법 그림 모음 — 데이터는 lib/studyData(가상·고정 시드), 지표는 실제 공식. 성질은 tests/study.test.ts 가 고정.
 */
import type { ReactNode } from 'react';
import Figure, { UP, DOWN } from './Figure';
import {
  dsTrend, dsMovingAverage, dsVolume, dsCycle, dsBollinger, dsDivergence, dsFibonacci, dsPatterns,
  fibRetracement, fibExtension, GOLDEN_POCKET, crossings, argMax, argMin,
} from '@/lib/studyData';

const VIOLET = 'var(--violet)';
const AMBER = 'var(--amber)';
const OK = 'var(--ok)';
const INK = 'var(--ink-2)';
const FAINT = 'var(--faint)';

/* ───────── 캔들 구조(직접 그림) ───────── */
export function CandleAnatomy() {
  const lab = (x: number, y: number, t: string, anchor: 'start' | 'end' = 'start') =>
    <text x={x} y={y} fontSize={10} fill={INK} textAnchor={anchor}>{t}</text>;
  const tick = (x1: number, x2: number, y: number) => <line x1={x1} x2={x2} y1={y} y2={y} stroke={FAINT} strokeWidth={0.8} strokeDasharray="2 2" />;
  return (
    <figure className="my-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2">
        <svg viewBox="0 0 360 190" width="100%" role="img" aria-label="양봉과 음봉의 시가·종가·고가·저가와 몸통·꼬리 구조" style={{ display: 'block' }}>
          {/* 양봉 */}
          <text x={95} y={16} fontSize={11} fontWeight={800} textAnchor="middle" fill={UP}>양봉 (상승)</text>
          <line x1={95} x2={95} y1={28} y2={172} stroke={UP} strokeWidth={2} />
          <rect x={80} y={52} width={30} height={84} fill={UP} rx={2} />
          {tick(112, 132, 28)}{lab(135, 31, '고가')}
          {tick(112, 132, 52)}{lab(135, 55, '종가 (끝)')}
          {tick(112, 132, 136)}{lab(135, 139, '시가 (시작)')}
          {tick(112, 132, 172)}{lab(135, 175, '저가')}
          {lab(76, 40, '윗꼬리', 'end')}{lab(76, 97, '몸통', 'end')}{lab(76, 158, '아랫꼬리', 'end')}
          {/* 음봉 */}
          <text x={265} y={16} fontSize={11} fontWeight={800} textAnchor="middle" fill={DOWN}>음봉 (하락)</text>
          <line x1={265} x2={265} y1={36} y2={176} stroke={DOWN} strokeWidth={2} />
          <rect x={250} y={60} width={30} height={78} fill={DOWN} rx={2} />
          {tick(282, 302, 36)}{lab(305, 39, '고가')}
          {tick(282, 302, 60)}{lab(305, 63, '시가')}
          {tick(282, 302, 138)}{lab(305, 141, '종가')}
          {tick(282, 302, 176)}{lab(305, 179, '저가')}
        </svg>
      </div>
      <figcaption className="text-[11.5px] leading-relaxed text-[var(--text-muted)] mt-1.5 px-0.5">
        캔들 하나 = 정해진 시간(1분·1시간·1일…) 동안의 시작·끝·최고·최저. 한국은 <b style={{ color: UP }}>오르면 빨강</b>·<b style={{ color: DOWN }}>내리면 파랑</b>(해외 앱은 반대로 초록·빨강).
      </figcaption>
    </figure>
  );
}

/* ───────── 추세·지지/저항 ───────── */
export function TrendSR() {
  const { candles, level } = dsTrend();
  return (
    <Figure label="저항선이 두 번 막은 뒤 돌파되고, 되돌림에서 같은 가격이 지지로 바뀌는 차트"
      panels={[{ height: 170, els: [
        { kind: 'hline', y: level, color: AMBER, dash: '4 3', label: '저항→지지' },
        { kind: 'candles', data: candles },
        { kind: 'mark', x: 25, y: candles[25].h, label: '막힘', color: DOWN, dir: 'down' },
        { kind: 'mark', x: 39, y: candles[39].h, label: '막힘', color: DOWN, dir: 'down' },
        { kind: 'mark', x: 47, y: candles[47].h + 1, label: '돌파', color: UP, dir: 'down' },
        { kind: 'mark', x: 58, y: candles[58].l, label: '지지', color: UP, dir: 'up' },
        { kind: 'seg', x1: 0, y1: 99, x2: 58, y2: 117.2, color: OK, dash: '3 3', width: 1.1 },
      ] }]}
      caption={<>저점이 계속 높아지면(초록 점선 = 추세선) 상승 추세. 두 번 막힌 가격(118)은 <b>저항</b>, 뚫고 올라간 뒤 되돌아와 받쳐 주면 <b>지지</b>로 역할이 바뀐다.</>} />
  );
}

/* ───────── 이동평균·골든/데드크로스 ───────── */
export function MovingAverages() {
  const { candles, ma20, ma60, crosses, from } = dsMovingAverage();
  const vis = crosses.filter((c) => c.i > from);
  return (
    <Figure label="20일선과 60일선의 데드크로스와 골든크로스" from={from}
      panels={[{ height: 170, els: [
        { kind: 'candles', data: candles },
        { kind: 'line', data: ma20, color: AMBER, width: 1.6 },
        { kind: 'line', data: ma60, color: VIOLET, width: 1.6 },
        ...vis.map((c) => c.kind === 'golden'
          ? { kind: 'mark' as const, x: c.i, y: (ma20[c.i] ?? 0) - 2, label: '골든크로스', color: UP, dir: 'up' as const }
          : { kind: 'mark' as const, x: c.i, y: (ma20[c.i] ?? 0) + 2, label: '데드크로스', color: DOWN, dir: 'down' as const }),
      ] }]}
      caption={<><b style={{ color: AMBER }}>20일선</b>(단기 평균)이 <b style={{ color: VIOLET }}>60일선</b>(중기 평균)을 위로 뚫으면 골든크로스, 아래로 뚫으면 데드크로스. 평균이라 <b>항상 늦게</b> 나온다 — 바닥·천장을 알려 주지 않는다.</>} />
  );
}

/* ───────── 거래량 ───────── */
export function VolumeConfirm() {
  const { candles, vol, top, bottom, fakeAt, breakAt } = dsVolume();
  return (
    <Figure label="거래량 없이 박스 상단을 넘은 가짜 돌파와 거래량이 크게 실린 진짜 돌파"
      panels={[
        { height: 140, els: [
          { kind: 'zone', y1: bottom, y2: top, color: FAINT, label: '박스권' },
          { kind: 'hline', y: top, color: AMBER, dash: '4 3', label: '박스 상단' },
          { kind: 'candles', data: candles },
          { kind: 'mark', x: fakeAt, y: candles[fakeAt].h, label: '가짜 돌파', color: DOWN, dir: 'down' },
          { kind: 'mark', x: breakAt + 1, y: candles[breakAt + 1].h + 0.5, label: '진짜 돌파', color: UP, dir: 'down' },
        ] },
        { height: 52, title: '거래량', els: [
          { kind: 'bars', data: vol, color: (_v, i) => (i === fakeAt ? DOWN : i >= breakAt && i <= breakAt + 2 ? UP : 'var(--line)') },
        ] },
      ]}
      caption={<>같은 &lsquo;돌파&rsquo;라도 <b>거래량이 함께 터져야</b> 믿을 만하다. 거래량 없이 살짝 넘은 돌파는 다시 박스 안으로 돌아오기 쉽다(가짜 돌파·속임수).</>} />
  );
}

/* ───────── RSI ───────── */
export function RsiFigure() {
  const { candles, rsi, from } = dsCycle();
  const hi = argMax(rsi, from, 60), lo = argMin(rsi, from, 80);
  return (
    <Figure label="가격과 RSI 14, 70 과매수와 30 과매도 기준선" from={from}
      panels={[
        { height: 120, els: [{ kind: 'candles', data: candles }] },
        { height: 78, title: 'RSI(14)', titlePos: 'bottom', domain: [0, 100], ticks: [30, 70], els: [
          { kind: 'zone', y1: 70, y2: 100, color: UP },
          { kind: 'zone', y1: 0, y2: 30, color: DOWN },
          { kind: 'line', data: rsi, color: VIOLET, width: 1.5 },
          { kind: 'dot', x: hi, y: rsi[hi] ?? 0, label: '과매수', color: UP, pos: 'right' },
          { kind: 'dot', x: lo, y: rsi[lo] ?? 0, label: '과매도', color: DOWN, pos: 'right' },
        ] },
      ]}
      caption={<>RSI는 최근 14개 봉의 <b>상승폭 평균 ÷ (상승+하락폭 평균)</b>을 0~100으로 바꾼 값. 70 위는 &lsquo;짧은 기간에 많이 올랐다&rsquo;, 30 아래는 &lsquo;많이 내렸다&rsquo;는 뜻이지 <b>곧 꺾인다는 뜻이 아니다</b>.</>} />
  );
}

/* ───────── MACD ───────── */
export function MacdFigure() {
  const { candles, macd, from } = dsCycle();
  const m = macd.map((x) => x.macd), s = macd.map((x) => x.signal), h = macd.map((x) => x.hist);
  const cx = crossings(m, s).filter((c) => c.i > 30);
  return (
    <Figure label="가격과 MACD 선, 시그널 선, 히스토그램, 교차 지점" from={from}
      panels={[
        { height: 115, els: [{ kind: 'candles', data: candles }] },
        { height: 88, title: 'MACD(12,26,9)', titlePos: 'bottom', els: [
          { kind: 'hline', y: 0, color: FAINT, dash: '2 2', label: '0' },
          { kind: 'bars', data: h, color: (v) => (v >= 0 ? 'color-mix(in srgb, var(--warn) 55%, transparent)' : 'color-mix(in srgb, var(--accent) 55%, transparent)') },
          { kind: 'line', data: m, color: AMBER, width: 1.5 },
          { kind: 'line', data: s, color: VIOLET, width: 1.3 },
          ...cx.map((c) => ({ kind: 'dot' as const, x: c.i, y: m[c.i] ?? 0, color: c.kind === 'golden' ? UP : DOWN, label: c.kind === 'golden' ? '↑교차' : '↓교차', pos: c.kind === 'golden' ? 'below' as const : 'above' as const })),
        ] },
      ]}
      caption={<><b style={{ color: AMBER }}>MACD선</b> = 12일 지수평균 − 26일 지수평균(단기가 장기보다 얼마나 위에 있나). <b style={{ color: VIOLET }}>시그널선</b> = MACD의 9일 평균. 막대(히스토그램) = 둘의 차이 — 막대가 줄어들면 힘이 빠지는 중.</>} />
  );
}

/* ───────── 볼린저 밴드 ───────── */
export function BollingerFigure() {
  const { candles, bb, from, squeeze } = dsBollinger();
  return (
    <Figure label="볼린저 밴드 스퀴즈 후 상방 확장과 상단 밴드 타기" from={from}
      panels={[{ height: 170, els: [
        { kind: 'vzone', x1: squeeze[0], x2: squeeze[1], color: AMBER, label: '스퀴즈' },
        { kind: 'line', data: bb.map((b) => b.upper), color: VIOLET, width: 1.1 },
        { kind: 'line', data: bb.map((b) => b.middle), color: FAINT, width: 1, dash: '3 3' },
        { kind: 'line', data: bb.map((b) => b.lower), color: VIOLET, width: 1.1 },
        { kind: 'candles', data: candles },
        { kind: 'mark', x: 72, y: candles[72].l, label: '밴드 타기', color: UP, dir: 'up' },
      ] }]}
      caption={<>가운데 = 20일 평균, 위·아래 = 평균 ± 표준편차 2배. 폭이 좁아지면(<b style={{ color: AMBER }}>스퀴즈</b>) 변동성이 눌려 있다는 뜻 — 곧 크게 움직이기 쉽지만 <b>방향은 알려 주지 않는다</b>. 강한 추세에선 상단에 붙어 계속 오른다(상단 = 무조건 매도 아님).</>} />
  );
}

/* ───────── 다이버전스 ───────── */
export function DivergenceFigure() {
  const { candles, closes, rsi, p1, p2, from } = dsDivergence();
  return (
    <Figure label="가격은 고점을 높이는데 RSI 고점은 낮아지는 하락 다이버전스" from={from}
      panels={[
        { height: 120, els: [
          { kind: 'candles', data: candles },
          { kind: 'seg', x1: p1, y1: closes[p1] + 1.2, x2: p2, y2: closes[p2] + 1.2, color: UP, width: 1.6, label: '고점↑' },
        ] },
        { height: 78, title: 'RSI(14)', domain: [0, 100], ticks: [30, 70], els: [
          { kind: 'line', data: rsi, color: VIOLET, width: 1.5 },
          { kind: 'seg', x1: p1, y1: rsi[p1] ?? 0, x2: p2, y2: rsi[p2] ?? 0, color: DOWN, width: 1.6, label: '고점↓' },
        ] },
      ]}
      caption={<>가격은 더 높이 갔는데 RSI는 덜 올라간다 = <b>오르는 힘이 약해지는 중</b>(하락 다이버전스). 반대(가격 저점↓·RSI 저점↑)는 상승 다이버전스. 경고일 뿐 타이밍이 아니다 — 다이버전스가 몇 번 겹친 채 계속 오르기도 한다.</>} />
  );
}

/* ───────── 피보나치 되돌림 ───────── */
export function FibRetracementFigure() {
  const { candles, low, high, ia, ib, ic } = dsFibonacci();
  const lv = fibRetracement(low, high);
  const gp = GOLDEN_POCKET.map((r) => high - r * (high - low));
  const col = (r: number) => (r === 0.618 ? AMBER : r === 0 || r === 1 ? INK : FAINT);
  return (
    <Figure label="저점 100에서 고점 160까지 피보나치 되돌림 레벨과 골든 포켓, 61.8% 부근 반등" to={64} padRight={74}
      panels={[{ height: 220, els: [
        { kind: 'zone', y1: gp[0], y2: gp[1], color: AMBER, label: '' },
        ...lv.map((l) => ({ kind: 'hline' as const, y: l.price, color: col(l.ratio), dash: l.ratio === 0 || l.ratio === 1 ? undefined : '3 3', width: l.ratio === 0.618 ? 1.4 : 0.9, label: `${(l.ratio * 100).toFixed(1).replace('.0', '')}% ${l.price.toFixed(1)}` })),
        { kind: 'candles', data: candles },
        { kind: 'seg', x1: ia, y1: low, x2: ib, y2: high, color: OK, width: 1.2, dash: '5 3' },
        { kind: 'dot', x: ia, y: low, label: '① 스윙 저점', color: OK, pos: 'below' },
        { kind: 'dot', x: ib, y: high, label: '② 스윙 고점', color: OK, pos: 'above' },
        { kind: 'mark', x: ic, y: candles[ic].l, label: '61.8% 반등', color: UP, dir: 'up' },
      ] }]}
      caption={<>상승 구간이면 <b>① 스윙 저점 → ② 스윙 고점</b> 순서로 긋는다. 레벨 가격 = 고점 − 비율 × (고점 − 저점). 예: 61.8% = 160 − 0.618 × 60 = <b>122.9</b>. 노란 띠는 <b style={{ color: AMBER }}>골든 포켓(61.8~65%)</b> — 깊은 되돌림의 마지막 지지 후보로 많이 본다.</>} />
  );
}

/* ───────── 피보나치 확장 ───────── */
export function FibExtensionFigure() {
  const { candles, low, high, c, ia, ib, ic } = dsFibonacci();
  const ex = fibExtension(low, high, c);
  return (
    <Figure label="A 저점, B 고점, C 되돌림 저점으로 그린 피보나치 확장 1, 1.272, 1.618 목표 구간"
      panels={[{ height: 220, els: [
        ...ex.map((l) => ({ kind: 'hline' as const, y: l.price, color: l.ratio === 1.272 ? UP : l.ratio === 1.618 ? AMBER : FAINT, dash: '3 3', width: l.ratio === 1 ? 0.9 : 1.3, label: `${l.ratio} ${l.price.toFixed(0)}` })),
        { kind: 'candles', data: candles },
        { kind: 'seg', x1: ia, y1: low, x2: ib, y2: high, color: OK, width: 1.2, dash: '5 3' },
        { kind: 'seg', x1: ib, y1: high, x2: ic, y2: c, color: OK, width: 1.2, dash: '5 3' },
        { kind: 'dot', x: ia, y: low, label: 'A', color: OK, pos: 'below' },
        { kind: 'dot', x: ib, y: high, label: 'B', color: OK, pos: 'above' },
        { kind: 'dot', x: ic, y: c, label: 'C', color: OK, pos: 'below' },
      ] }]}
      caption={<>A→B 상승폭(60)을 C에서 다시 위로 붙인다. 목표 = C + 비율 × (B − A): <b>1.272 → 199</b>, <b style={{ color: AMBER }}>1.618 → 220</b>. 진입 근거가 아니라 <b>이미 추세가 확인된 뒤 익절을 나눠 걸 위치</b>를 정하는 도구다.</>} />
  );
}

/* ───────── 차트 패턴 3종 ───────── */
type MiniEl = { kind: 'hline'; y: number; color: string; label: string } | { kind: 'seg'; x1: number; y1: number; x2: number; y2: number; color: string } | { kind: 'dot'; x: number; y: number; label: string; color: string };
function Mini({ data, title, els, label, caption }: { data: number[]; title: string; els: MiniEl[]; label: string; caption?: ReactNode }) {
  const lo = Math.min(...data), hi = Math.max(...data), r = hi - lo;
  return (
    <Figure label={label} padRight={52} caption={caption} panels={[{ height: 100, title, domain: [lo - r * 0.08, hi + r * 0.24], els: [
      { kind: 'line', data, color: INK, width: 1.4 },
      ...els.map((e) => (e.kind === 'dot' ? { ...e, pos: 'above' as const } : { ...e, dash: '4 3', width: 1.2 })),
    ] }]} />
  );
}
export function PatternFigures() {
  const { doubleTop, headShoulders, triangle } = dsPatterns();
  return (
    <div>
      <Mini data={doubleTop} title="이중 천장(M자)" label="같은 높이 고점 두 번 후 넥라인 이탈"
        els={[{ kind: 'hline', y: 120.5, color: DOWN, label: '고점' }, { kind: 'hline', y: 110, color: AMBER, label: '넥라인' },
          { kind: 'dot', x: 12, y: doubleTop[12], label: '1차 고점', color: DOWN }, { kind: 'dot', x: 30, y: doubleTop[30], label: '2차 고점', color: DOWN }]} />
      <Mini data={headShoulders} title="헤드앤숄더" label="왼쪽 어깨, 머리, 오른쪽 어깨 후 넥라인 이탈"
        els={[{ kind: 'hline', y: 108.2, color: AMBER, label: '넥라인' },
          { kind: 'dot', x: 8, y: headShoulders[8], label: '왼어깨', color: DOWN }, { kind: 'dot', x: 22, y: headShoulders[22], label: '머리', color: DOWN },
          { kind: 'dot', x: 38, y: headShoulders[38], label: '오른어깨', color: DOWN }]} />
      <Mini data={triangle} title="상승 삼각형(수렴)" label="고점은 같고 저점이 높아지며 수렴한 뒤 위로 돌파"
        caption={<>파란 선 = 같은 높이에서 계속 막히는 저항, 빨간 점선 = 점점 높아지는 저점. 좁아지다가 저항을 뚫으면 완성.</>}
        els={[{ kind: 'hline', y: 120.3, color: DOWN, label: '저항' }, { kind: 'seg', x1: 2, y1: 100.5, x2: 36, y2: 113, color: UP }]} />
      <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)] px-0.5">
        패턴은 <b>넥라인·저항선을 실제로 뚫은 뒤</b>에야 완성된다. 만들어지는 중에 미리 걸면 절반은 다른 모양으로 끝난다. 이름보다 &lsquo;어디서 틀렸다고 인정할지(손절선)&rsquo;를 먼저 정한다.
      </p>
    </div>
  );
}

/* ───────── 거시 연결도 ───────── */
export function MacroChain() {
  const box = (x: number, y: number, w: number, t: string, sub: string, color: string) => (
    <g>
      <rect x={x} y={y} width={w} height={40} rx={8} fill="var(--bg-card)" stroke={color} strokeWidth={1.3} />
      <text x={x + w / 2} y={y + 17} fontSize={10.5} fontWeight={800} textAnchor="middle" fill={color}>{t}</text>
      <text x={x + w / 2} y={y + 31} fontSize={8.5} textAnchor="middle" fill="var(--text-muted)">{sub}</text>
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, color = FAINT) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.3} markerEnd="url(#arr)" />
    </g>
  );
  return (
    <figure className="my-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2">
        <svg viewBox="0 0 360 300" width="100%" role="img" aria-label="유가와 물가, 연준, 금리, 달러가 비트코인에 영향을 주는 경로와 유동성·ETF 자금 경로" style={{ display: 'block' }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--faint)" />
            </marker>
          </defs>
          <text x={8} y={14} fontSize={9.5} fontWeight={700} fill={DOWN}>누르는 경로 (긴축)</text>
          {box(8, 22, 100, '유가 ↑', '전쟁·감산', AMBER)}
          {arrow(108, 42, 128, 42)}
          {box(130, 22, 100, '물가 ↑', 'CPI·PCE', AMBER)}
          {arrow(230, 42, 250, 42)}
          {box(252, 22, 100, '연준 긴축', '금리 인상·동결', DOWN)}
          {arrow(302, 62, 302, 84)}
          {box(252, 86, 100, '금리 ↑', '국채·실질금리', DOWN)}
          {arrow(252, 106, 232, 106)}
          {box(130, 86, 100, '달러 ↑', 'DXY 강세', DOWN)}
          {arrow(130, 106, 110, 106)}
          {box(8, 86, 100, '위험자산 ↓', '기회비용 ↑', DOWN)}

          <text x={8} y={160} fontSize={9.5} fontWeight={700} fill={UP}>받치는 경로 (유동성·수요)</text>
          {box(8, 168, 100, '유동성 ↑', 'M2·금리 인하', UP)}
          {box(130, 168, 100, '스테이블코인 ↑', '대기 매수 자금', UP)}
          {box(252, 168, 100, 'ETF 순유입', '현물 매수', UP)}
          {arrow(58, 208, 160, 246, UP)}
          {arrow(180, 208, 180, 244, UP)}
          {arrow(302, 208, 200, 246, UP)}
          <rect x={110} y={248} width={140} height={40} rx={10} fill="color-mix(in srgb, var(--accent) 12%, var(--bg-card))" stroke="var(--accent)" strokeWidth={1.4} />
          <text x={180} y={266} fontSize={11.5} fontWeight={800} textAnchor="middle" fill="var(--ink)">비트코인 가격</text>
          <text x={180} y={280} fontSize={8.5} textAnchor="middle" fill="var(--text-muted)">두 힘의 줄다리기</text>
          {/* 위험자산 ↓ → 비트코인: 받치는 경로 상자를 피해 왼쪽 가장자리로 돌아간다 */}
          <path d="M8,118 H3 V268 H108" fill="none" stroke={DOWN} strokeWidth={1.3} markerEnd="url(#arr)" />
        </svg>
      </div>
      <figcaption className="text-[11.5px] leading-relaxed text-[var(--text-muted)] mt-1.5 px-0.5">
        뉴스의 &lsquo;유가·금리·달러&rsquo;는 대부분 <b>위 경로 하나</b>로 이어진다. 비트코인은 이 누르는 힘과 아래 받치는 힘(돈이 들어오나)의 줄다리기로 움직인다. 어느 쪽이 이길지는 아무도 미리 모른다.
      </figcaption>
    </figure>
  );
}
