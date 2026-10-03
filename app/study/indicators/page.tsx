import type { Metadata } from 'next';
import { StudyNav, StudyLead, Lesson, Toc, Trap, Tip, AppLinks, KvTable, StudyFooter } from '@/components/study/StudyShell';
import { RsiFigure, MacdFigure, BollingerFigure, DivergenceFigure } from '@/components/study/Diagrams';

export const metadata: Metadata = {
  title: '보조지표 RSI·MACD·볼린저 — 코인 기초 공부법',
  description: 'RSI 과매수·과매도, MACD 교차와 히스토그램, 볼린저 밴드 스퀴즈와 밴드 타기, 다이버전스. 계산 방법과 함정.',
};

const HERE = '/study/indicators';

export default function StudyIndicatorsPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <StudyNav current={HERE} />
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">2. 보조지표 — RSI·MACD·볼린저</h1>
      <StudyLead>보조지표는 <b className="text-[var(--text)]">가격을 다른 방식으로 다시 계산한 것</b>이다. 새로운 정보를 더하지 않고, 이미 지나간 가격을 요약할 뿐이다. 그래서 &lsquo;신호&rsquo;가 아니라 <b className="text-[var(--text)]">지금 상태를 숫자로 보여 주는 계기판</b>으로 쓴다.</StudyLead>
      <Toc items={[
        { id: 'rsi', label: 'RSI' }, { id: 'macd', label: 'MACD' }, { id: 'bb', label: '볼린저' },
        { id: 'div', label: '다이버전스' }, { id: 'combo', label: '조합 원칙' },
      ]} />

      <Lesson id="rsi" n="2-1" title="RSI — 얼마나 한쪽으로 몰려 올랐나/내렸나">
        <RsiFigure />
        <p><b>계산</b>: 최근 14개 봉의 평균 상승폭(AU)과 평균 하락폭(AD)으로 RS = AU ÷ AD, <b>RSI = 100 − 100 ÷ (1 + RS)</b>. 오르기만 했으면 100, 내리기만 했으면 0에 가깝다.</p>
        <KvTable head={['RSI', '뜻', '흔한 오해']} rows={[
          ['70 이상', '과매수 — 짧은 기간 많이 오름', '‘곧 떨어진다’ ✗ — 강한 상승장에선 70 위에서 오래 머문다'],
          ['30 이하', '과매도 — 짧은 기간 많이 내림', '‘바닥이다’ ✗ — 폭락장에선 20 아래로 계속 간다'],
          ['50 위/아래', '최근 상승 우세/하락 우세', '추세 판단 보조로는 50선이 더 쓸모 있음'],
        ]} />
        <Tip>상승 추세(1. 차트 기초)일 땐 RSI 70 돌파를 &lsquo;힘이 세다&rsquo;로, 40~50까지 내려왔다 다시 오르는 걸 눌림목으로 본다. 횡보장에서만 70/30 역매매가 비교적 통한다.</Tip>
        <Trap>코인은 변동성이 커서 70/30을 자주 뚫는다. 일부는 80/20을 기준으로 쓴다. 숫자 하나로 반대 방향에 거는 순간 추세에 깔린다.</Trap>
      </Lesson>

      <Lesson id="macd" n="2-2" title="MACD — 단기 평균과 장기 평균의 거리">
        <MacdFigure />
        <KvTable head={['요소', '계산(기본 12·26·9)', '보는 법']} rows={[
          ['MACD선', '12일 EMA − 26일 EMA', '0 위 = 단기가 장기보다 위(상승 쪽)'],
          ['시그널선', 'MACD의 9일 EMA', 'MACD가 위로 뚫으면 상승 교차'],
          ['히스토그램', 'MACD − 시그널', '막대가 줄어듦 = 추세 힘 약화'],
        ]} />
        <p>EMA(지수이동평균)는 최근 가격에 가중치를 더 준 평균이라 단순평균보다 빨리 반응한다. 그래도 평균의 평균이라 <b>가격보다 늦다</b>.</p>
        <Tip>0선 위에서의 상승 교차(이미 상승 중인 흐름이 다시 힘을 받음)가 0선 아래 교차보다 신뢰를 더 받는다. 교차보다 <b>히스토그램이 줄어드는 것</b>을 &lsquo;힘이 빠진다&rsquo;는 조기 경고로 많이 본다.</Tip>
        <Trap>교차 시점엔 이미 가격이 꽤 움직인 뒤다. 횡보장에선 교차가 수시로 나와 손실만 쌓인다(이동평균과 같은 약점).</Trap>
      </Lesson>

      <Lesson id="bb" n="2-3" title="볼린저 밴드 — 변동성의 폭">
        <BollingerFigure />
        <p><b>계산</b>: 가운데 = 20일 단순평균, 위 = 평균 + 2×표준편차, 아래 = 평균 − 2×표준편차. 통계적으로 가격의 약 95%가 밴드 안에 있다는 가정이지만 코인은 꼬리가 길어 자주 벗어난다.</p>
        <KvTable head={['모양', '뜻']} rows={[
          ['폭이 몇 달 중 가장 좁음(스퀴즈)', '변동성 압축 — 큰 움직임 준비. 방향은 모름'],
          ['상단에 붙어 계속 오름(밴드 타기)', '강한 상승 추세 — 상단 터치 = 매도 신호 아님'],
          ['박스권에서 상·하단 왕복', '이때만 상단 매도·하단 매수가 비교적 통함'],
        ]} />
        <Tip>스퀴즈가 보이면 방향을 미리 맞히려 하지 말고, 어느 쪽으로 터지든 대비해 레버리지를 낮추고 돌파 방향을 확인한다.</Tip>
      </Lesson>

      <Lesson id="div" n="2-4" title="다이버전스 — 가격과 지표가 엇갈릴 때">
        <DivergenceFigure />
        <KvTable head={['종류', '가격', '지표(RSI·MACD)', '뜻']} rows={[
          ['하락 다이버전스', '고점 ↑', '고점 ↓', '오르는 힘 약화 — 롱 경계'],
          ['상승 다이버전스', '저점 ↓', '저점 ↑', '내리는 힘 약화 — 숏 경계'],
        ]} />
        <Trap>다이버전스는 &lsquo;힘이 약해진다&rsquo;는 경고지 &lsquo;지금 꺾인다&rsquo;는 신호가 아니다. 강한 추세에선 다이버전스가 두세 번 겹쳐도 계속 간다. 추세선·직전 저점 이탈 같은 가격 확인이 나온 뒤에 의미가 생긴다.</Trap>
      </Lesson>

      <Lesson id="combo" n="2-5" title="지표 조합 원칙">
        <p>RSI·MACD·스토캐스틱은 모두 &lsquo;최근에 얼마나 올랐나&rsquo;를 다르게 계산한 <b>같은 계열(모멘텀)</b>이다. 셋이 동시에 &lsquo;과매수&rsquo;여도 근거가 셋인 게 아니라 하나다.</p>
        <KvTable head={['역할', '대표 도구', '하나씩만']} rows={[
          ['추세(방향)', '이동평균·추세선', '✓'],
          ['모멘텀(힘)', 'RSI 또는 MACD', '✓'],
          ['변동성(폭)', '볼린저·ATR', '✓'],
          ['참여(돈)', '거래량', '✓'],
        ]} />
        <Tip>서로 다른 역할에서 하나씩 고른다. 지표를 늘릴수록 &lsquo;맞는 신호&rsquo;만 골라 보게 되어(확증 편향) 판단이 오히려 나빠진다.</Tip>
        <AppLinks links={[
          { href: '/crypto/BTCUSDT', label: '비트코인 차트 — MA·거래량' },
          { href: '/stock/005930', label: '국내 종목 차트 — BB·RSI 켜기' },
        ]} note="코인 상세 차트는 이동평균·거래량, 국내 종목 상세 차트는 볼린저·RSI까지 켤 수 있습니다." />
      </Lesson>

      <StudyFooter current={HERE} sources={[
        { href: 'https://www.investopedia.com/terms/r/rsi.asp', label: 'Investopedia — RSI' },
        { href: 'https://www.investopedia.com/terms/m/macd.asp', label: 'Investopedia — MACD' },
        { href: 'https://www.investopedia.com/terms/b/bollingerbands.asp', label: 'Investopedia — Bollinger Bands' },
      ]} />
    </div>
  );
}
