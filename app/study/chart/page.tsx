import type { Metadata } from 'next';
import { StudyNav, StudyLead, Lesson, Toc, Trap, Tip, AppLinks, KvTable, StudyFooter } from '@/components/study/StudyShell';
import { CandleAnatomy, TrendSR, MovingAverages, VolumeConfirm } from '@/components/study/Diagrams';

export const metadata: Metadata = {
  title: '차트 보는 법 — 코인 기초 공부법',
  description: '캔들 읽기, 시간 단위, 추세와 고점·저점, 지지와 저항, 이동평균과 골든·데드크로스, 거래량으로 돌파 확인하기.',
};

const HERE = '/study/chart';

export default function StudyChartPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <StudyNav current={HERE} />
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">1. 차트 보는 법</h1>
      <StudyLead>차트는 미래를 보여 주지 않는다. 대신 <b className="text-[var(--text)]">지금까지 사람들이 어디서 사고팔았는지</b>를 보여 준다. 그걸 읽어서 &lsquo;어디서 틀렸다고 인정할지(손절)&rsquo;를 정하는 게 목표다.</StudyLead>
      <Toc items={[
        { id: 'candle', label: '캔들' }, { id: 'timeframe', label: '시간 단위' }, { id: 'trend', label: '추세' },
        { id: 'sr', label: '지지·저항' }, { id: 'ma', label: '이동평균' }, { id: 'volume', label: '거래량' }, { id: 'apply', label: '정리' },
      ]} />

      <Lesson id="candle" n="1-1" title="캔들(봉) 하나 읽기">
        <CandleAnatomy />
        <p><b>몸통</b>은 시가와 종가 사이 — 그 시간 동안 결국 얼마나 올랐나/내렸나. <b>꼬리</b>는 잠깐 갔다가 되밀린 가격 — 거기서 반대편 힘이 나왔다는 흔적이다.</p>
        <KvTable head={['모양', '읽는 법']} rows={[
          ['긴 양봉', '그 시간 내내 사는 힘이 셌다'],
          ['긴 아랫꼬리', '크게 밀렸다가 사는 힘이 받쳐 되돌렸다(바닥권이면 의미 ↑)'],
          ['긴 윗꼬리', '올랐다가 파는 힘에 밀려 내려왔다(고점권이면 경계)'],
          ['도지(몸통 거의 없음)', '사는 힘과 파는 힘이 비김 — 방향 고민 중'],
        ]} />
        <Trap>캔들 하나로 결론 내지 않는다. 같은 망치형 캔들도 하락 추세 한가운데면 그냥 쉬어 가는 봉일 때가 많다. 위치(어느 가격대에서 나왔나)와 거래량을 같이 본다.</Trap>
      </Lesson>

      <Lesson id="timeframe" n="1-2" title="시간 단위(타임프레임)">
        <p>같은 코인도 1분봉·1시간봉·4시간봉·일봉·주봉에서 완전히 다른 그림이 나온다. <b>큰 시간 단위가 방향(숲), 작은 단위가 타이밍(나무)</b>.</p>
        <KvTable head={['시간 단위', '주로 보는 사람', '특징']} rows={[
          ['1~15분', '초단타(스캘핑)', '잡음이 많고 수수료·슬리피지 부담 큼'],
          ['1~4시간', '단타·스윙', '하루 몇 번 확인. 코인 선물에서 많이 씀'],
          ['일봉', '스윙·중기', '추세·지지/저항이 가장 믿을 만함'],
          ['주봉', '장기', '큰 사이클. 큰 지지/저항 확인용'],
        ]} />
        <Tip>먼저 일봉으로 추세를 보고(위·아래·옆), 그 다음 4시간봉에서 들어갈 자리를 찾는다. 작은 봉의 신호가 큰 봉의 추세와 반대면 사이즈를 줄인다.</Tip>
        <Trap>코인은 24시간 쉬지 않고 열려 있어 &lsquo;일봉 마감&rsquo; 기준이 거래소마다 다르다(보통 UTC 0시 = 한국 오전 9시).</Trap>
      </Lesson>

      <Lesson id="trend" n="1-3" title="추세 — 고점과 저점의 순서">
        <p>상승 추세 = <b>고점도 저점도 계속 높아진다</b>. 하락 추세 = 고점도 저점도 낮아진다. 둘 다 아니면 횡보(박스권). 저점끼리 이은 선이 상승 추세선이다.</p>
        <TrendSR />
        <Tip title="추세가 깨졌다는 신호">상승 추세에서 직전 저점을 종가로 깨고 내려가면 &lsquo;저점이 높아진다&rsquo;는 전제가 무너진 것. 롱 포지션의 손절 기준으로 가장 많이 쓴다.</Tip>
      </Lesson>

      <Lesson id="sr" n="1-4" title="지지와 저항">
        <p><b>지지</b> = 여러 번 사는 힘이 나와 받쳐 준 가격. <b>저항</b> = 여러 번 파는 힘에 막힌 가격. 사람들이 그 가격을 기억하고 주문을 걸어 두기 때문에 생긴다(만 단위 같은 <b>딱 떨어지는 숫자</b>도 잘 작동한다).</p>
        <p>위 그림처럼 저항이 뚫리면 그 가격이 다음엔 지지가 되는 <b>역할 전환</b>이 흔하다. 돌파 직후 추격하기보다 되돌림에서 그 선이 지켜지는지 보는 사람이 많은 이유다.</p>
        <Trap>지지/저항은 &lsquo;선&rsquo;이 아니라 &lsquo;구간&rsquo;이다. 정확히 그 가격에서 멈추지 않고 살짝 뚫었다가 돌아오는 경우(꼬리)가 많다. 손절을 선 바로 아래 딱 붙이면 쉽게 털린다.</Trap>
      </Lesson>

      <Lesson id="ma" n="1-5" title="이동평균선 — 평균 가격의 흐름">
        <p>20일 이동평균 = 최근 20개 봉 종가의 평균. 많이 쓰는 기간: <b>5·20(단기) · 60(중기) · 120·200(장기)</b>. 가격이 평균선 위면 최근 산 사람들이 평균적으로 이익, 아래면 손실 상태다.</p>
        <MovingAverages />
        <KvTable head={['보이는 것', '뜻']} rows={[
          ['가격 > 20일선 > 60일선', '정배열 — 상승 추세 유지 중'],
          ['가격 < 20일선 < 60일선', '역배열 — 하락 추세 유지 중'],
          ['선들이 얽혀 있음', '횡보 — 교차 신호가 자주 틀림'],
        ]} />
        <Trap>횡보장에선 골든·데드크로스가 계속 번갈아 나와 따라 하면 계속 잃는다. 이동평균은 &lsquo;추세가 있을 때 그 추세를 확인&rsquo;하는 도구다.</Trap>
        <AppLinks links={[{ href: '/crypto/BTCUSDT', label: '비트코인 차트 — MA5·20·60 켜기' }]} />
      </Lesson>

      <Lesson id="volume" n="1-6" title="거래량 — 움직임에 돈이 실렸나">
        <p>가격은 &lsquo;무엇이&rsquo; 일어났는지, 거래량은 &lsquo;얼마나 많은 사람이&rsquo; 동의했는지를 보여 준다.</p>
        <VolumeConfirm />
        <KvTable head={['가격', '거래량', '읽는 법']} rows={[
          ['상승', '증가', '건강한 상승 — 참여자가 늘어남'],
          ['상승', '감소', '힘 빠지는 상승 — 추격 주의'],
          ['하락', '급증', '투매(패닉) — 바닥 근처일 수도, 더 떨어질 수도'],
          ['횡보', '감소 지속', '에너지 축적 — 곧 한쪽으로 크게 움직이기 쉬움'],
        ]} />
        <Trap>코인 거래량은 거래소마다 다르고 일부 거래소는 부풀려진 거래량도 있다. 큰 거래소(바이낸스·코인베이스·업비트) 기준으로 본다.</Trap>
        <AppLinks links={[{ href: '/crypto/BTCUSDT', label: '비트코인 차트 — 거래량 보조 차트' }]} />
      </Lesson>

      <Lesson id="apply" n="1-7" title="정리 — 차트로 할 수 있는 것과 없는 것">
        <KvTable head={['할 수 있음', '할 수 없음']} rows={[
          ['지금이 상승·하락·횡보 중 무엇인지', '내일 오를지 내릴지'],
          ['틀렸을 때 나올 자리(손절선) 정하기', '정확한 바닥·천장 맞히기'],
          ['손절까지 거리로 사이즈 계산', '확률 높은 ‘필승 패턴’'],
        ]} />
      </Lesson>

      <StudyFooter current={HERE} sources={[
        { href: 'https://www.investopedia.com/trading/candlestick-charting-what-is-it/', label: 'Investopedia — 캔들스틱 차트' },
        { href: 'https://www.investopedia.com/trading/support-and-resistance-basics/', label: 'Investopedia — 지지와 저항 기초' },
      ]} />
    </div>
  );
}
