import Link from 'next/link';
import type { Metadata } from 'next';
import { Lesson, Tip, Trap, KvTable, Toc, AppLinks } from '@/components/study/StudyShell';

export const metadata: Metadata = {
  title: '매매 습관 교정 교본',
  description: '잦은 진입·손절 직후 재진입·손실 한도 부재가 손실을 키우는 흐름, 심리 함정 3가지와 교정, 돌파와 돌파 확인의 차이, 시간봉 역할, 모의 검증용 손실 한도와 기록 템플릿.',
};

/* 사용자 문서 「개인 코인 선물 매매 종합 분석 및 개선 가이드」(2026-10-11)에서 개인 수치(손익·입출금·포지션·사례 금액)를 빼고
   일반 원칙만 옮겼다 — 공개 페이지라 개인 기록은 넣지 않는다(내 실제 숫자는 잠금 해제한 기기의 복기 화면에서 본다).
   진입 전 7문항·손절 후 재진입 프로토콜은 /study/reentry 에 있어 여기서는 링크만 둔다. */

const HABIT_STEPS: { n: string; title: string; body: string }[] = [
  { n: '①', title: '가격 움직임 발견', body: '급등·급락이 먼저 시선을 끈다' },
  { n: '②', title: '차트 간단 확인', body: '지지·저항 돌파나 이탈을 대략 본다' },
  { n: '③', title: '진입', body: '놓칠까 봐 조건을 깊게 검토하지 못한다' },
  { n: '④', title: '손절 후 관망', body: '어느 정도 기다린 뒤 다시 기회를 찾는다' },
  { n: '⑤', title: '재진입', body: '확인된 추세보다 가격 움직임에 끌려간다' },
];

export default function HabitsPage() {
  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-12 min-w-0">
      <Link href="/study" className="text-[12px] font-semibold text-[var(--accent-ink)]">← 코인 기초 공부법</Link>
      <h1 className="text-xl font-extrabold text-[var(--text)] mt-2 mb-1">매매 습관 교정 교본</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        내 선물 매매 기록을 진단해 보니, 문제는 <b className="text-[var(--text)]">차트를 못 보는 것이 아니라 가격이 움직인 뒤 진입을 서두르고, 손절 뒤 재진입을 반복하는 구조</b>였습니다.
        그 진단에서 나온 교훈을 개인 수치 없이 정리했습니다. 우선순위는 <b className="text-[var(--text)]">① 거래 횟수 줄이기 ② 최대 손실 고정 ③ 돌파 후 재확인</b>.
      </p>

      <Link href="/study/reentry" className="fin-card p-4 block mb-4 border border-[var(--accent)]/30">
        <div className="flex items-center justify-between">
          <b className="text-[14px] text-[var(--text)]">✅ 주문 직전에는 진입·재진입 체크리스트</b>
          <span className="text-[12px] font-semibold text-[var(--accent-ink)]">열기 →</span>
        </div>
        <p className="text-[12px] text-[var(--text-muted)] mt-1.5 leading-relaxed">이 교본은 &lsquo;왜&rsquo;를 설명하고, 체크리스트는 진입 전 7문항과 손절 후 60분 타이머로 실제 주문 전에 확인합니다.</p>
      </Link>

      <Toc items={[
        { id: 'leak', label: '돈이 새는 곳' }, { id: 'cash', label: '입금 ≠ 수익' }, { id: 'flow', label: '손실을 키우는 흐름' },
        { id: 'mind', label: '심리 함정 3가지' }, { id: 'breakout', label: '돌파 확인' }, { id: 'tf', label: '시간봉 역할' },
        { id: 'rules', label: '시험 규칙' }, { id: 'log', label: '기록·검증' },
      ]} />

      <Lesson id="leak" n="H-1" title="돈이 새는 곳 — 맞히는 횟수보다 빈도와 비용">
        <p>방향을 꽤 맞혀도 <b>비용 전에는 수익, 비용 뒤에는 손실</b>이 될 수 있습니다. 원인은 <b>너무 잦은 거래 + 높은 명목금액(큰 레버리지) + 거래 비용</b>의 조합입니다. 수수료는 증거금이 아니라 명목금액에 붙으므로, 배율이 높을수록 같은 증거금에서 비용이 커집니다.</p>
        <p>보유 시간별로 나눠 보면 <b>15분·1시간 안에 끝낸 짧은 매매에서 손실이 쌓이는</b> 경우가 많습니다. 작은 가격 변동만 노리는 반복 진입은 비용을 넘기 어렵습니다.</p>
        <Trap>오래 보유한 매매가 수익이었다고 &lsquo;오래 버티면 수익&rsquo;은 아닙니다. 잘 되는 매매를 오래 들고 간 <b>선택 효과</b>일 수 있습니다. 결론은 &lsquo;짧은 매매를 줄인다&rsquo;까지만.</Trap>
        <AppLinks links={[{ href: '/review', label: '복기 대시보드 — 비용 분석' }, { href: '/journal?tab=cost', label: '비용 누수' }]} note="내 실제 보유시간별 손익·수수료는 잠금 해제한 기기의 복기 화면에서 봅니다." />
      </Lesson>

      <Lesson id="cash" n="H-2" title="입금·출금은 수익과 다르다">
        <p>계좌 잔고가 늘었다고 번 것이 아닙니다. <b>입금 − 출금 수령액 − 출금 수수료 = 순입금</b>은 밖에서 넣은 돈이지 투자수익이 아닙니다. 같은 기간 매매 순손익은 따로 봐야 합니다.</p>
        <Tip>인출한 수익을 다시 거래에 넣는지 따로 기록합니다. 같은 금액이 나갔다 들어오면 &lsquo;재입금&rsquo;인지 표시해 두어야 나중에 누적 성과를 헷갈리지 않습니다.</Tip>
      </Lesson>

      <Lesson id="flow" n="H-3" title="손실을 키우는 흐름 — 습관 5단계">
        <ol className="grid grid-cols-1 sm:grid-cols-5 gap-1.5">
          {HABIT_STEPS.map((s) => (
            <li key={s.n} className="rounded-lg border border-[var(--border)] px-2.5 py-2">
              <p className="text-[12.5px] font-bold text-[var(--text)]">{s.n} {s.title}</p>
              <p className="text-[11.5px] leading-snug mt-0.5">{s.body}</p>
            </li>
          ))}
        </ol>
        <p>이 흐름에서 자주 나오는 두 장면이 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>빠른 손절 → 몇 분 뒤 연속 재진입</b> — 같은 코인·다른 코인을 번갈아 들어가 작은 손절이 이어지고, 마지막 재진입이 가장 크게 집니다.</li>
          <li><b>큰 익절 직후 방향 전환</b> — 이익을 확정한 뒤 반대 방향으로 짧게 들어갔다 나오기를 반복해, 가격 움직임보다 비용까지 더한 실제 손실이 더 큽니다.</li>
        </ul>
        <KvTable head={['원인 가설', '모습']} rows={[
          ['진입을 서두름', '가격이 움직인 뒤 돌파 여부만 빠르게 살핀다'],
          ['손절 직후 재진입', '기다리긴 했지만 새로운 가격 구조 없이 다시 들어간다'],
          ['손실 한도 없음', '큰 포지션과 잦은 주문으로 작은 변동도 비용·손실이 커진다'],
        ]} />
        <Trap>매매 내역만으로 당시 감정이나 주문 이유를 확정할 수는 없습니다. 위는 스스로 설명한 습관과 체결 패턴을 맞춰 본 가설입니다.</Trap>
      </Lesson>

      <Lesson id="mind" n="H-4" title="심리 함정 3가지와 교정 — FOMO보다 정확하게">
        <KvTable head={['함정', '머릿속 말', '교정']} rows={[
          ['매도 후 급등 걱정', '“지금 정리하면 위로 갈 것 같다”', '기회를 놓친 것은 손실이 아니다. 계획에 없는 추격 금지'],
          ['손절 후 반등 관찰', '“조금 기다렸으니 다시 들어가도 될까”', '시간이 지난 것 말고 새 지지·저항 구조가 있어야 한다'],
          ['수익 직후 추가 거래', '“방향을 또 맞힐 수 있다”', '큰 익절한 날은 신규 진입을 멈추는 규칙을 시험'],
        ]} />
        <Tip title="좋은 손절과 나쁜 손절">나쁜 손절은 <b>기준 없이 커진 손실</b>이고, 좋은 손절은 <b>미리 정한 위험 안에서 실행한 손절</b>입니다. 손절 뒤 가격이 반등했다는 사실만으로 잘못된 손절이 되지는 않습니다.</Tip>
      </Lesson>

      <Lesson id="breakout" n="H-5" title="&lsquo;돌파했다&rsquo;와 &lsquo;돌파를 확인했다&rsquo;의 차이">
        <p>지지·저항은 선 하나가 아니라 <b>여러 번 반응한 가격 구간</b>입니다. 비슷한 저점에서 여러 번 멈추거나 반등하면 지지, 비슷한 고점에서 여러 번 막히면 저항 — 매번 정확히 같은 가격일 필요는 없고, 꼬리 하나가 아니라 반복된 반응을 봅니다.</p>
        <KvTable head={['단계', '무엇을 보나']} rows={[
          ['가짜 돌파', '꼬리만 저항 위로 올라갔다가 종가가 다시 아래로 돌아옴 — 아직 아무것도 아님'],
          ['1단계 확인', '15분봉 종가가 저항 위(또는 지지 아래)에서 마감'],
          ['2단계 확인', '되돌림에서 뚫은 저항이 지지로(깨진 지지가 저항으로) 바뀌는 것을 확인'],
        ]} />
        <Trap>지지와 저항 사이 <b>좁은 구간 한가운데</b>에서는 롱·숏 모두 추격 진입이 불리합니다. 어느 쪽으로든 구간을 벗어나 확인될 때까지 기다립니다.</Trap>
        <AppLinks links={[{ href: '/study/chart#sr', label: '차트 기초 — 지지와 저항' }, { href: '/study/execution', label: '실전 체계 — 재테스트' }]} />
      </Lesson>

      <Lesson id="tf" n="H-6" title="시간봉마다 맡은 역할">
        <KvTable head={['시간봉', '주로 확인할 것']} rows={[
          ['4시간봉', '큰 추세인지, 횡보인지'],
          ['1시간봉', '주요 지지·저항과 가격 구조'],
          ['15분봉', '종가 돌파, 재지지·재저항'],
          ['5분봉', '진입 보조만 — 단독 신호로 쓰지 않음'],
        ]} />
        <Trap>거래소 차트의 자동 &lsquo;지지/저항&rsquo; 표시는 시간봉과 계산 시점마다 바뀝니다. 숫자 하나만 보고 들어가지 말고 종가·되돌림·거래량·상위 시간봉 방향을 함께 봅니다. 캡처해 둔 가격도 그 순간 값일 뿐, 나중의 진입선이 아닙니다.</Trap>
      </Lesson>

      <Lesson id="rules" n="H-7" title="새로 시험할 규칙 — 모의 먼저">
        <p>아래는 실거래 권유가 아니라 <b>모의거래나 아주 작은 금액으로 먼저 검증할</b> 시험 기준입니다. 금액은 계좌 크기에 맞게 바꿉니다.</p>
        <KvTable head={['항목', '시험 기준']} rows={[
          ['1회 최대 손실', '약 10 USDT 이하(비용 포함)'],
          ['하루 최대 손실', '20 USDT · 연속 2회 손절이면 그날 중지(앱 기본 차단은 3회 — 코인 분석 서킷브레이커에서 2로 바꿔 시험)'],
          ['일주일 최대 손실', '50 USDT 이내'],
          ['거래 빈도', '하루 1~2회 · 큰 익절 후 그날 신규 매매 중단'],
          ['레버리지', '모의거래 우선 · 실거래면 3~5배 이하 검토'],
          ['손익비', '수수료·미끄러짐 반영 후 목표 1:2 이상'],
        ]} />
        <p className="rounded-lg border border-[var(--border)] px-3 py-2 text-[12.5px]"><b>수량 = (최대 허용 손실 − 예상 비용) ÷ |진입가 − 손절가|</b><br />BTC·ETH를 같은 자금으로 동시에 잡으면 두 포지션을 합친 위험으로 계산합니다.</p>
        <Tip>전부 정리한 상태라면 바로 다시 들어갈 이유가 없습니다. 규칙을 먼저 모의로 검증합니다.</Tip>
        <AppLinks links={[{ href: '/simulate', label: '리스크 계산 — 비용 차감 수량' }, { href: '/coin-analysis', label: '코인 분석 — 손실 한도(서킷브레이커) 설정' }]} note="설정한 한도는 홈 리스크 센터의 오늘·7일 게이지와 냉각 배너에 반영됩니다." />
      </Lesson>

      <Lesson id="log" n="H-8" title="기록 템플릿과 20건 검증">
        <p>매매마다 아래 여섯 칸을 채웁니다(모의 또는 아주 작은 금액으로 20건).</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {['일시 / 자산 / 방향', '4H 추세 / 1H 지지·저항', '15분봉 종가 / 되돌림 근거', '진입가 / 손절가 / 목표가', '수량 / 총비용 / 최대 손실', '계획 준수? / 실패 원인'].map((t) => (
            <li key={t} className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-[12.5px] font-semibold text-[var(--text)]">{t}</li>
          ))}
        </ul>
        <p>20건을 모은 뒤 <b>① 수수료 포함 순손익 ② 평균 이익·손실 ③ 돌파 실패 거래 ④ 손절 후 재진입 빈도 ⑤ 계획 준수율</b>을 비교합니다. 판단은 <b>승률보다 순손익과 규칙 준수율</b>로.</p>
        <AppLinks links={[{ href: '/journal', label: '매매일지 — 복기·태그' }, { href: '/paper', label: '선행 테스트 — 규칙 사전 기록' }]} />
      </Lesson>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4">
        한 줄 원칙: “가격이 움직여서 들어가는 것이 아니라, 조건이 확인되어도 손익비가 맞을 때만 들어간다.”
        개인 매매 진단에서 나온 교훈을 일반 원칙으로 정리한 학습 자료이며, 투자 권유나 수익 보장이 아닙니다.
      </p>
    </div>
  );
}
