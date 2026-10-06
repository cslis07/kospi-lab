import type { Metadata } from 'next';
import { StudyNav, StudyLead, Lesson, Toc, Trap, Tip, AppLinks, KvTable, StudyFooter } from '@/components/study/StudyShell';
import { MacroChain } from '@/components/study/Diagrams';

export const metadata: Metadata = {
  title: '금리·국채·유가와 코인 — 코인 기초 공부법',
  description: '미국 국채금리·실질금리·장단기 금리, 달러인덱스, 유가와 물가, 연준, 유동성(M2·스테이블코인), 현물 ETF, 온체인, 펀딩비·미결제약정·청산, 반감기 등 코인 가격에 영향을 주는 요인.',
};

const HERE = '/study/macro';

export default function StudyMacroPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <StudyNav current={HERE} />
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">4. 금리·국채·유가와 코인</h1>
      <StudyLead>차트가 &lsquo;사람들이 어디서 사고팔았나&rsquo;라면, 거시·수급은 <b className="text-[var(--text)]">왜 돈이 들어오거나 빠지나</b>다. 비트코인은 이자도 실적도 없어서 &lsquo;돈이 얼마나 풍부한가&rsquo;에 특히 민감하다.</StudyLead>
      <Toc items={[
        { id: 'map', label: '전체 지도' }, { id: 'rates', label: '금리·국채' }, { id: 'dollar', label: '달러' },
        { id: 'combo', label: '금리·달러 조합' },
        { id: 'oil', label: '유가·물가' }, { id: 'fed', label: '연준·일정' }, { id: 'liquidity', label: '유동성' },
        { id: 'etf', label: '현물 ETF' }, { id: 'onchain', label: '온체인' }, { id: 'deriv', label: '파생·청산' },
        { id: 'other', label: '기타 요인' }, { id: 'corr', label: '상관관계 주의' },
      ]} />

      <Lesson id="map" n="4-0" title="전체 지도 — 누르는 힘과 받치는 힘">
        <MacroChain />
      </Lesson>

      <Lesson id="rates" n="4-1" title="금리와 국채 — 왜 금리가 오르면 코인이 무거워지나">
        <p><b>국채 금리(수익률)</b> = 미국 정부에 돈을 빌려주고 받는 이자율. 가격과 반대로 움직인다(국채를 많이 팔면 가격↓·금리↑). 안전한 이자가 높을수록 이자 없는 비트코인을 들고 있을 <b>기회비용</b>이 커진다.</p>
        <KvTable head={['금리', '뜻', '코인에']} rows={[
          ['2년물', '연준 기준금리 기대를 가장 빨리 반영', '금리 인상 기대 ↑ → 부담'],
          ['10년물', '경제 전체의 기준 금리. 주택담보·기업 대출의 기준', '가장 많이 보는 ‘천장’ 지표'],
          ['실질금리(10년 TIPS)', '명목금리 − 기대 인플레이션', '높을수록 부담 — 비트코인과 가장 강하게 반대로 움직인 시기가 있음'],
          ['장단기 금리차(10년−2년)', '마이너스(역전) = 경기 침체 우려', '역전 해소 국면엔 변동성 확대가 잦음'],
        ]} />
        <p>2022년 긴축기엔 비트코인과 실질금리(10년 TIPS)가 거의 정반대로 움직였다는 분석이 있다. 다만 상관관계는 시기마다 크게 바뀐다 — 맨 아래 &lsquo;상관관계 주의&rsquo; 참고.</p>
        <p><b className="text-[var(--text)]">왜 금리가 쉽게 안 내려오나 — 고점 판단이 달라졌다.</b> 예전엔 &lsquo;CPI 강함 → 연준 인상 → 금리↑&rsquo; 한 줄이었다. 지금은 두 힘이 동시에 작용한다: <b>연준·경기 요인</b>(인상 기대 하락·고용 둔화 → 금리를 아래로)과 <b>재정·수급 요인</b>(재정적자·국채 발행 확대·기간 프리미엄 → 장기금리를 위로 받침). 그래서 CPI가 낮게 나오거나 연준이 동결해도 10년물 고점이라고 단정하기 어렵다. 단기물(2년물)과 장기물(10년물)이 다르게 움직이는 <b>커브 스티프닝</b>도 함께 본다. 초점이 &lsquo;연준이 얼마나 더 올리나&rsquo;에서 &lsquo;이미 높은 금리가 경제를 얼마나 약화시키나&rsquo;로 옮겨가는 중.</p>
        <Tip>숫자 자체보다 <b>방향과 속도</b>를 본다. 10년물이 한 달에 0.5%p 넘게 빠르게 오르는 중이면 위험자산 전반이 눌리기 쉬운 환경 → 레버리지를 낮춘다.</Tip>
        <AppLinks links={[{ href: '/coins', label: '코인 › 시장환경 (미 국채 2Y·10Y·30Y)' }, { href: '/indicators', label: '시장지표 › 금리(국채)' }]}
          note="실질금리(TIPS)·장단기 금리차는 앱에 없음 — FRED(DFII10, T10Y2Y)에서 확인." />
      </Lesson>

      <Lesson id="dollar" n="4-2" title="달러인덱스(DXY)">
        <p>유로·엔·파운드 등 6개 통화 대비 달러 가치. 달러가 강하면 전 세계 돈이 달러 자산(미국 국채·예금)으로 몰리고, 달러로 가격이 매겨지는 비트코인·금은 상대적으로 비싸져 수요가 줄기 쉽다.</p>
        <p>금리가 오르면 달러도 같이 오르는 경우가 많아 <b>금리↑ + 달러↑</b>가 겹치면 가장 불리한 조합으로 본다.</p>
        <AppLinks links={[{ href: '/coins', label: '코인 › 시장환경 (달러인덱스)' }, { href: '/indicators', label: '시장지표 › 환율 (.DXY)' }]} />
      </Lesson>

      <Lesson id="combo" n="4-3" title="금리·달러·실질금리를 묶어서 — 같은 방향인지 확인">
        <p>하나만 보고 방향을 정하지 않는다. <b>10년물·실질금리·DXY가 같은 방향</b>을 가리킬 때 그 바람이 가장 뚜렷하다. 엇갈리면 &lsquo;방향 확인 필요&rsquo; 구간으로 본다.</p>
        <KvTable head={['10년물', 'DXY', '코인 환경']} rows={[
          ['상승', '상승', '맞바람 — 숏 쪽에 유리한 조합'],
          ['하락', '하락', '순풍 — 롱 쪽에 유리한 조합'],
          ['상승', '하락', '엇갈림 — 방향 확인 필요'],
          ['하락', '상승', '엇갈림 — 방향 확인 필요'],
        ]} />
        <Tip title="기억하기 쉬운 문장">
          10년물 = <b>돈의 가격</b> · DXY = <b>달러의 힘</b>.<br />
          10년물 ↓ + 실질금리 ↓ + DXY ↓ → 코인 <b>롱</b>에 우호(뒤에서 부는 바람)<br />
          10년물 ↑ + 실질금리 ↑ + DXY ↑ → 코인 <b>숏</b>에 우호(맞바람)
        </Tip>
        <p className="mt-3">상황별로 풀어 보면:</p>
        <KvTable head={['상황', '10년물', 'DXY', '해석']} rows={[
          ['물가 둔화 + 연준 완화 기대', '하락', '하락 가능', '코인 상승에 우호'],
          ['강한 고용 + 연준 매파', '상승', '상승 가능', '코인 하락 압력'],
          ['국채 공급·재정 우려', '상승/고점 유지', '강세 가능', '위험자산 부담'],
          ['경기침체 공포', '급락 가능', '변동', '초기엔 코인도 급락 가능'],
        ]} />
        <Trap>같은 하락이라도 <b>왜</b> 내리는지가 다르다. 완화 기대로 금리가 내리면 코인에 우호적이지만, 경기침체 공포로 급락하면 위험회피로 코인도 함께 빠질 수 있다. 숫자 자체보다 최근 고점·저점의 <b>방향과 속도</b>, 그리고 가격·거래량·OI·기술적 지표를 함께 본다 — 거시는 단독 매수·매도 신호가 아니다.</Trap>
        <AppLinks links={[
          { href: '/coin-analysis', label: '코인선물 분석 › 거시 배경(금리·달러) 카드' },
          { href: '/brief?market=coin', label: '모닝 브리핑(코인) › 선행 지표' },
        ]} note="실질금리(10년 TIPS)는 앱 수치엔 없음 — FRED(DFII10)에서 확인. 분석 화면의 거시 배경 카드가 10년물·DXY·실질금리를 같은 방향인지로 요약한다." />
      </Lesson>

      <Lesson id="oil" n="4-4" title="유가와 물가 — 직접이 아니라 금리를 거쳐서">
        <p>유가가 오르면 운송·생산 비용이 올라 <b>물가(인플레이션)</b>가 다시 오를 수 있다 → 연준이 금리를 내리기 어려워지거나 더 올릴 수 있다 → 금리 경로로 위험자산에 부담. 연준 연구에선 유가가 10% 지속 상승하면 미국 물가를 1년에 약 0.15%p 끌어올리는 것으로 추정한다.</p>
        <p>평소 비트코인과 유가의 직접 상관은 거의 0에 가깝지만, <b>중동 전쟁 같은 공급 충격</b> 시기엔 &lsquo;인플레 → 금리 → 유동성&rsquo; 고리로 함께 움직이며 상관이 일시적으로 크게 높아진다.</p>
        <Trap>유가만 보고 판단하지 않는다. 유가 급등이 실제로 물가 지표(CPI·PCE)와 금리 기대를 움직였는지까지 확인해야 의미가 있다.</Trap>
        <AppLinks links={[{ href: '/coins', label: '코인 › 시장환경 (Brent 유가)' }, { href: '/indicators', label: '시장지표 › 원자재 (WTI)' }]} />
      </Lesson>

      <Lesson id="fed" n="4-5" title="연준(Fed)과 경제 일정">
        <KvTable head={['일정', '무엇', '코인에']} rows={[
          ['FOMC', '연 8회 기준금리 결정 + 의장 기자회견', '발표 전후 몇 시간 변동성 최대'],
          ['CPI', '소비자물가(매월 중순)', '예상보다 높으면 금리 부담 ↑'],
          ['PCE', '연준이 가장 중시하는 물가(매월 말)', '예상보다 낮으면 인하 기대 ↑'],
          ['고용(비농업 고용)', '매월 첫 금요일', '고용이 너무 강하면 긴축 우려'],
        ]} />
        <p>시장은 숫자 자체가 아니라 <b>예상 대비</b>에 반응한다. 같은 3.4%라도 예상이 3.7%였으면 호재, 3.1%였으면 악재다. 금리 인상·인하 확률은 CME FedWatch에서 확인한다.</p>
        <Tip>큰 발표 전후 몇 시간은 롱·숏 청산이 양방향으로 터지기 쉽다. 방향을 맞히려 하기보다 <b>신규 진입을 쉬거나 사이즈를 줄인다</b>.</Tip>
        <AppLinks links={[{ href: '/calendar', label: '경제 캘린더 (FOMC·CPI)' }]} note="PCE·고용 발표일은 캘린더에 아직 없음 — 미국 BEA·BLS 일정에서 확인." />
      </Lesson>

      <Lesson id="liquidity" n="4-6" title="유동성 — 세상에 돈이 얼마나 풀렸나">
        <KvTable head={['지표', '뜻', '코인에']} rows={[
          ['글로벌 M2(통화량)', '주요국 시중 통화량 합계', '늘면 위험자산에 우호. 수 주~수개월 늦게 반영된다는 분석이 많음'],
          ['스테이블코인 시가총액', 'USDT·USDC 등 코인 시장 안의 대기 자금', '늘면 ‘살 준비가 된 돈’ 증가로 해석'],
          ['금리 인하·양적완화', '돈의 가격이 싸짐', '역사적으로 코인 강세장과 겹침'],
        ]} />
        <Trap>&lsquo;M2와 상관 80%&rsquo; 같은 주장은 특정 기간·특정 지연 값을 골라 맞춘 경우가 많다. 방향을 보는 배경 지표로만 쓴다.</Trap>
        <AppLinks links={[]} note="M2·스테이블코인 시가총액은 앱에 없음 — FRED(M2SL)·DefiLlama 스테이블코인 페이지에서 확인." />
      </Lesson>

      <Lesson id="etf" n="4-7" title="현물 비트코인 ETF 자금 흐름">
        <p>미국 현물 ETF(블랙록 IBIT, 피델리티 FBTC 등)에 돈이 들어오면 운용사가 실제 비트코인을 산다. <b>연속 순유입</b>은 하락 때 받쳐 주는 힘, <b>순유출 전환</b>은 상승 동력 약화로 읽는다.</p>
        <Trap>집계가 하루 늦고, 하루 유출로 흐름이 끝났다고 보기 어렵다. 며칠~몇 주 누적으로 본다.</Trap>
        <AppLinks links={[{ href: '/coins', label: '코인 › 현물 ETF 순유입' }]} />
      </Lesson>

      <Lesson id="onchain" n="4-8" title="온체인 — 블록체인에 찍힌 실제 이동">
        <KvTable head={['지표', '뜻']} rows={[
          ['거래소 순유출', '코인이 거래소 밖(개인 지갑·수탁)으로 → 당장 팔 물량 감소, 장기 보유 해석'],
          ['거래소 순유입', '팔려고 거래소에 넣는 물량 증가 가능성 → 단기 매도 압력 경계'],
          ['고래 이동', '큰 지갑의 대량 이동 — 거래소 입금이면 경계'],
          ['채굴자 매도', '채굴 비용 압박 시 보유분 매도'],
        ]} />
        <Trap>거래소 지갑 이동엔 내부 정리·수탁사 이전도 섞여 있다. 한 건으로 매수/매도를 단정하지 않는다.</Trap>
        <AppLinks links={[{ href: '/coin-analysis', label: '코인선물 분석 › 온체인 고래 피드' }]}
          note="거래소 전체 순유출 정확값은 유료 데이터(CryptoQuant·Glassnode)라 앱에 없음." />
      </Lesson>

      <Lesson id="deriv" n="4-9" title="파생상품 — 펀딩비·미결제약정·청산·옵션">
        <KvTable head={['지표', '뜻', '보는 법']} rows={[
          ['펀딩비', '무기한 선물에서 롱·숏이 8시간마다 주고받는 비용', '크게 양수 = 롱 과열(레버리지 롱 몰림) → 흔들기 주의'],
          ['미결제약정(OI)', '열려 있는 선물 계약 총량', '가격↑ + OI↑ = 레버리지가 상승을 끌어올림(취약)'],
          ['강제청산', '증거금 부족으로 거래소가 강제 정리', '한쪽 대량 청산 = 순간 급등락. 이미 지난 일'],
          ['옵션 풋/콜', '풋 = 하락 보험, 콜 = 상승 베팅', '풋 가격 급등 = 폭락 공포'],
        ]} />
        <Tip>상승장에서 펀딩비가 낮고 OI가 차분하면 <b>현물 매수가 끌어올리는 건강한 상승</b>으로, 펀딩비가 치솟고 OI가 급증하면 <b>레버리지가 끌어올린 취약한 상승</b>으로 본다.</Tip>
        <AppLinks links={[
          { href: '/futures', label: '선물 — 펀딩비' },
          { href: '/coin-analysis', label: '코인선물 분석 — 펀딩·미결제약정·실시간 청산' },
        ]} note="옵션 데이터는 앱에 없음 — Deribit 등에서 확인." />
      </Lesson>

      <Lesson id="other" n="4-10" title="기타 요인">
        <KvTable head={['요인', '내용']} rows={[
          ['나스닥(기술주)', '비트코인은 위험자산으로 묶여 나스닥과 같이 움직이는 시기가 많다'],
          ['반감기', '약 4년마다 채굴 보상 절반. 다만 새로 나오는 물량이 이미 전체의 1% 미만이라 효과가 예전보다 작다는 분석이 늘었다'],
          ['규제·정책', 'ETF 승인, 과세, 거래소 규제 발표 — 일정이 정해진 경우 캘린더처럼 대비'],
          ['해킹·거래소 사고', '대형 거래소 파산·해킹은 단기간 급락을 부른다(예측 불가 → 레버리지로만 대비)'],
          ['김치 프리미엄', '국내 가격 − 해외 가격. 높으면 국내 과열 신호로 해석'],
          ['공포·탐욕 지수', '변동성·거래량·SNS 등을 합친 심리 지표. 극단값일 때만 참고'],
        ]} />
        <AppLinks links={[{ href: '/coins', label: '코인 › 시장환경 (김치프리미엄·공포탐욕·다음 FOMC)' }]} />
      </Lesson>

      <Lesson id="corr" n="4-11" title="상관관계 주의 — 같이 움직인다 ≠ 원인이다">
        <p>&lsquo;달러가 오르면 비트코인이 내린다&rsquo;는 평균적으로 그런 경향일 뿐이다. 최근 30일 상관계수가 −0.4 수준인 시기도, 거의 0인 시기도, 같은 방향인 시기도 있다.</p>
        <KvTable head={['흔한 말', '실제']} rows={[
          ['금리 오르면 코인 하락', '긴축기에 강했지만, ETF 매수가 강하면 버틴다'],
          ['유가 오르면 코인 하락', '평소엔 상관 ~0. 공급 충격 때만 금리 경로로 연결'],
          ['반감기 후 무조건 상승', '표본이 4번뿐 — 통계로 믿기엔 너무 적다'],
        ]} />
        <Tip title="결론">거시 요인은 &lsquo;오를까 내릴까&rsquo;가 아니라 <b>&lsquo;지금 바람이 앞에서 부나 뒤에서 부나&rsquo;</b>를 보는 것. 맞바람이면 사이즈를 줄이고 레버리지를 낮춘다 — 그게 잃을 확률을 실제로 낮추는 유일한 방법이다.</Tip>
      </Lesson>

      <StudyFooter current={HERE} sources={[
        { href: 'https://fred.stlouisfed.org/series/DFII10', label: 'FRED — 10년 실질금리(TIPS, DFII10)' },
        { href: 'https://fred.stlouisfed.org/series/T10Y2Y', label: 'FRED — 장단기 금리차(10Y−2Y)' },
        { href: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html', label: 'CME FedWatch — 금리 인상·인하 확률' },
        { href: 'https://defillama.com/stablecoins', label: 'DefiLlama — 스테이블코인 시가총액' },
        { href: 'https://fortune.com/2022/07/12/bitcoin-price-bond-yield-crypto-inflation-correlation/', label: 'Fortune(2022) — 비트코인과 실질금리 상관' },
        { href: 'https://cryptoslate.com/does-a-weaker-dollar-drive-bitcoin-price-now/', label: 'CryptoSlate — 달러·실질금리와 비트코인 상관' },
      ]} />
    </div>
  );
}
