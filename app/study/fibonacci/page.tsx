import type { Metadata } from 'next';
import { StudyNav, StudyLead, Lesson, Toc, Trap, Tip, KvTable, StudyFooter } from '@/components/study/StudyShell';
import { FibRetracementFigure, FibExtensionFigure, PatternFigures } from '@/components/study/Diagrams';
import { fibRetracement, fibExtension } from '@/lib/studyData';

export const metadata: Metadata = {
  title: '피보나치와 차트 패턴 — 코인 기초 공부법',
  description: '피보나치 되돌림 긋는 법과 23.6·38.2·50·61.8·78.6% 레벨, 골든 포켓, 1.272·1.618 확장 목표, 이중 천장·헤드앤숄더·삼각 수렴.',
};

const HERE = '/study/fibonacci';

export default function StudyFibonacciPage() {
  const lv = fibRetracement(100, 160);
  const ex = fibExtension(100, 160, 122.92);
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <StudyNav current={HERE} />
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">3. 피보나치와 차트 패턴</h1>
      <StudyLead>피보나치·패턴은 &lsquo;많은 사람이 같은 자리를 본다&rsquo;는 점에서 쓸모가 있다. 수학적 법칙이 아니라 <b className="text-[var(--text)]">주문이 몰리기 쉬운 후보 자리</b>를 미리 표시해 두는 도구다.</StudyLead>
      <Toc items={[
        { id: 'what', label: '피보나치란' }, { id: 'retrace', label: '되돌림' }, { id: 'draw', label: '긋는 법' },
        { id: 'pocket', label: '골든 포켓' }, { id: 'extend', label: '확장(목표)' }, { id: 'patterns', label: '차트 패턴' }, { id: 'plan', label: '매매 계획에 쓰기' },
      ]} />

      <Lesson id="what" n="3-1" title="피보나치 비율은 어디서 왔나">
        <p>피보나치 수열 1, 1, 2, 3, 5, 8, 13, 21, 34, 55…(앞 두 수의 합)에서 이웃한 수의 비율이 <b>1.618(황금비)</b>에 가까워진다. 그 역수가 <b>0.618</b>, 두 칸 떨어진 비율이 0.382, 세 칸이 0.236.</p>
        <KvTable head={['비율', '나오는 곳']} rows={[
          ['0.618 / 1.618', '이웃 수의 비율(예: 34÷55, 55÷34)'],
          ['0.382', '두 칸 떨어진 수의 비율(34÷89)'],
          ['0.236', '세 칸 떨어진 수의 비율(34÷144)'],
          ['0.5', '피보나치 비율은 아님 — 관행적으로 함께 씀(다우 이론의 절반 되돌림)'],
          ['0.786', '0.618의 제곱근'],
          ['1.272', '1.618의 제곱근'],
        ]} />
        <Trap>&lsquo;자연의 황금비라서 시장도 따른다&rsquo;는 설명은 근거가 약하다. 작동한다면 이유는 단순하다 — 많은 트레이더가 같은 도구로 같은 선을 긋고 거기에 주문을 걸기 때문(자기실현적).</Trap>
      </Lesson>

      <Lesson id="retrace" n="3-2" title="피보나치 되돌림 — 오른 만큼에서 얼마나 되돌리나">
        <FibRetracementFigure />
        <KvTable head={['레벨', '예시 가격', '자주 쓰는 해석']} rows={lv.map((l) => [
          `${(l.ratio * 100).toFixed(1).replace('.0', '')}%`,
          l.price.toFixed(1),
          l.ratio === 0 ? '스윙 고점(되돌림 시작)'
            : l.ratio === 0.236 ? '얕은 되돌림 — 아주 강한 추세'
            : l.ratio === 0.382 ? '건강한 되돌림 — 강한 추세의 첫 지지 후보'
            : l.ratio === 0.5 ? '절반 되돌림 — 관행적 중간 지점'
            : l.ratio === 0.618 ? '깊은 되돌림 — 가장 많이 보는 지지 후보'
            : l.ratio === 0.786 ? '아주 깊음 — 여기까지 오면 추세 약화 의심'
            : '스윙 저점 — 깨지면 상승 구간 자체가 무효',
        ])} />
      </Lesson>

      <Lesson id="draw" n="3-3" title="긋는 법 — 가장 많이 틀리는 부분">
        <ol className="list-decimal pl-5 space-y-1">
          <li><b>뚜렷한 한 번의 움직임(스윙)</b>을 고른다. 지금 보는 시간 단위에서 누가 봐도 큰 상승 또는 하락.</li>
          <li>상승 구간: <b>스윙 저점 → 스윙 고점</b> 순서로 클릭. 하락 구간: 스윙 고점 → 스윙 저점.</li>
          <li>꼬리 끝(최저가·최고가)에 맞출지 몸통(종가)에 맞출지 <b>하나로 정해 계속 같은 방식</b>으로.</li>
          <li>새 고점이 나오면 다시 긋는다(이전 선은 지운다).</li>
        </ol>
        <Trap>스윙을 어디로 잡느냐에 따라 레벨이 완전히 달라진다. 원하는 결론(&lsquo;여기가 지지면 좋겠다&rsquo;)에 맞춰 시작점을 바꾸면 도구가 아니라 핑계가 된다. 처음 정한 스윙을 기록해 두자.</Trap>
      </Lesson>

      <Lesson id="pocket" n="3-4" title="골든 포켓(61.8~65%)">
        <p>0.618과 0.65 사이의 좁은 띠. 코인 트레이더들 사이에서 널리 쓰이는 이름으로, <b>깊은 되돌림에서 사는 힘이 나올 마지막 후보 구간</b>으로 많이 본다. 위 되돌림 그림의 노란 띠가 그것(예시: {(160 - 0.65 * 60).toFixed(1)} ~ {(160 - 0.618 * 60).toFixed(1)}).</p>
        <Tip>골든 포켓 단독보다 <b>다른 근거가 겹칠 때</b>(이전 저항이 지지로 바뀐 가격, 60일선, 거래량 증가) 의미가 커진다. 그래도 진입 근거가 아니라 &lsquo;여기서 반등 확인 시 고려, 78.6% 아래 마감이면 손절&rsquo; 같은 계획 틀로 쓴다.</Tip>
      </Lesson>

      <Lesson id="extend" n="3-5" title="피보나치 확장 — 익절 목표를 나눠 정하기">
        <FibExtensionFigure />
        <KvTable head={['확장', '계산(A=100, B=160, C≈122.9)', '목표']} rows={ex.map((l) => [
          String(l.ratio), `122.9 + ${l.ratio} × 60`, `${l.price.toFixed(1)}`,
        ])} />
        <p>2.0·2.618 같은 더 먼 확장도 있지만 1.272·1.618이 가장 많이 쓰인다. <b>돌파가 확인된 추세에서만</b> 의미가 있다.</p>
        <Tip>목표를 한 곳에 몰지 말고 1.272에서 일부, 1.618에서 일부 익절 → 나머지는 손절을 본전으로 올려 추세에 맡긴다(분할 익절).</Tip>
      </Lesson>

      <Lesson id="patterns" n="3-6" title="차트 패턴 3가지">
        <PatternFigures />
        <KvTable head={['패턴', '모양', '완성 조건', '흔한 실패']} rows={[
          ['이중 천장/바닥', 'M / W', '두 고점 사이 저점(넥라인) 종가 이탈', '세 번째 고점을 만들며 돌파'],
          ['헤드앤숄더', '어깨-머리-어깨', '넥라인 종가 이탈', '오른쪽 어깨에서 다시 상승'],
          ['삼각 수렴', '고점·저점이 좁아짐', '한쪽 선을 거래량과 함께 돌파', '돌파 직후 되돌아오는 가짜 돌파'],
        ]} />
      </Lesson>

      <Lesson id="plan" n="3-7" title="매매 계획에 쓰는 법 (예시)">
        <KvTable head={['계획 항목', '예시(상승 구간 100→160)']} rows={[
          ['관찰 구간', '61.8~65% 골든 포켓(121.0~122.9)'],
          ['들어가는 조건', '구간에서 아랫꼬리 + 거래량 증가 같은 반등 확인 후'],
          ['손절', '78.6%(112.8) 아래 종가 — 여기 깨지면 이 시나리오는 틀림'],
          ['익절', '1.272 확장(199) 일부, 1.618(220) 일부'],
          ['사이즈', '진입가~손절까지 거리 × 수량 = 계좌의 1% 이내'],
        ]} />
        <Tip title="핵심">피보나치가 하는 일은 &lsquo;맞히기&rsquo;가 아니라 <b>손절 거리와 목표 거리를 미리 숫자로</b> 만드는 것. 손절 거리가 정해져야 사이즈가 나온다.</Tip>
      </Lesson>

      <StudyFooter current={HERE} sources={[
        { href: 'https://www.investopedia.com/terms/f/fibonacciretracement.asp', label: 'Investopedia — Fibonacci Retracement' },
        { href: 'https://www.investopedia.com/terms/f/fibonacciextensions.asp', label: 'Investopedia — Fibonacci Extensions' },
        { href: 'https://www.investopedia.com/terms/h/head-shoulders.asp', label: 'Investopedia — Head and Shoulders' },
      ]} />
    </div>
  );
}
