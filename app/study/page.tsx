import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '코인 기초 공부법',
  description: '시황 기사를 읽고 앱에서 직접 확인하는 법 — 금리·유가·달러·ETF 자금·청산·가격대. 방향 예측이 아니라 "오늘 위험이 큰 날인가"를 판단하는 공부.',
};

/* 시황 기사에 자주 나오는 요인 — 원리 · 비트코인에 어떻게 · 앱에서 보는 곳 · 함정 */
interface Factor {
  title: string;
  why: string;
  btc: string;
  where: { href: string; label: string }[];
  whereNote?: string;
  trap: string;
}

const FACTORS: Factor[] = [
  {
    title: '미국 국채금리 (특히 10년물)',
    why: '국채는 안전하게 이자를 준다. 금리가 오르면 "아무것도 안 하고 받는 이자"가 커진다.',
    btc: '비트코인은 이자가 없다. 금리가 오를수록 비트코인을 들고 있는 기회비용이 커져 위험자산 매수 유인이 줄어든다. 금리 급등 구간은 상승의 "천장" 역할을 하기 쉽다.',
    where: [{ href: '/coins', label: '코인 › 시장환경 (미 국채 2Y·10Y·30Y)' }, { href: '/indicators', label: '시장지표 › 금리(국채)' }],
    trap: '금리가 오른다고 비트코인이 반드시 내리지는 않는다. 같은 주에 현물 매수가 강하면 버틴다. 금리는 "위로 가기 어려운 환경"을 말할 뿐 방향을 정하지 않는다.',
  },
  {
    title: '국제유가 (브렌트·WTI)',
    why: '유가는 물건값·운송비에 바로 들어가 물가(인플레이션)를 밀어 올린다.',
    btc: '유가 상승 → 물가 재상승 우려 → 연준이 금리를 더 올리거나 오래 높게 유지할 가능성 ↑ → 금리 경로를 거쳐 위험자산에 부담. 중동 같은 지정학 이슈가 보통 여기로 연결된다.',
    where: [{ href: '/coins', label: '코인 › 시장환경 (Brent 유가)' }, { href: '/indicators', label: '시장지표 › 원자재' }],
    trap: '유가는 직접 원인이 아니라 "금리로 가는 경로"다. 유가만 보고 판단하지 말고 금리·물가 지표와 함께 본다.',
  },
  {
    title: '달러인덱스 (DXY)',
    why: '주요 통화 대비 달러 가치. 달러가 강하면 세계 자금이 달러 자산으로 몰린다.',
    btc: '달러 강세는 달러로 매겨진 위험자산(비트코인·금·나스닥)에 대체로 부담. 금리 상승과 같이 오는 경우가 많다.',
    where: [{ href: '/coins', label: '코인 › 시장환경 (달러인덱스)' }, { href: '/indicators', label: '시장지표 › 환율 (.DXY)' }],
    trap: '상관관계는 기간마다 바뀐다. "달러 오르면 코인 하락"을 공식처럼 쓰면 안 된다.',
  },
  {
    title: '물가 지표·연준 일정 (CPI·PCE·FOMC)',
    why: '물가가 예상보다 높으면 금리 인상 가능성 ↑, 낮으면 ↓. 시장은 "예상 대비"에 반응한다.',
    btc: '발표 직후 몇 시간은 롱·숏이 한꺼번에 청산되며 위아래로 크게 흔들리기 쉽다. 예상보다 약한 물가 → 금리 부담 완화 → 반등, 이런 흐름이 흔하다.',
    where: [{ href: '/calendar', label: '경제 캘린더 (FOMC·CPI)' }],
    whereNote: 'PCE 발표일은 캘린더에 아직 없음 — 미국 상무부(BEA) 일정에서 확인.',
    trap: '숫자 하나로 추세가 바뀌지 않는다. 발표 전후엔 방향을 맞히려 하기보다 신규 진입을 쉬거나 사이즈를 줄이는 게 공부의 결론이다.',
  },
  {
    title: '현물 비트코인 ETF 자금 흐름',
    why: '미국 현물 ETF로 들어오는 돈 = 기관·장기 자금의 실제 매수.',
    btc: '연속 순유입은 하락 때 "받쳐 주는 힘(하단 지지)", 순유출 전환은 상승 동력 약화로 읽힌다. 금리가 높아도 ETF 매수가 강하면 덜 밀린다.',
    where: [{ href: '/coins', label: '코인 › 현물 ETF 순유입' }],
    trap: 'ETF 흐름은 하루 늦게 집계되고, 하루 유출로 흐름이 끝났다고 보기 어렵다. 며칠 단위 누적으로 본다.',
  },
  {
    title: '거래소 유출입·고래 이동',
    why: '코인이 거래소 밖(개인 지갑·수탁)으로 나가면 당장 팔 물량이 줄고, 거래소로 들어오면 매도 대기 물량이 늘 수 있다.',
    btc: '대량 순유출 = 중장기 보유(매집) 신호로 해석되는 경우가 많다. 대량 입금은 단기 매도 압력 경계.',
    where: [{ href: '/coin-analysis', label: '코인선물 분석 › 온체인 고래 피드' }],
    whereNote: '거래소 전체 순유출 "정확한 수치"는 유료 데이터라 앱에 없음 — 큰 이동만 고래 피드로 확인.',
    trap: '거래소 지갑 이동은 내부 정리·수탁 이전일 때도 많다. 한 건의 이동으로 매수·매도를 단정하지 않는다.',
  },
  {
    title: '강제청산 (롱·숏 청산)',
    why: '레버리지 포지션이 증거금을 잃으면 거래소가 강제로 정리한다. 이게 연쇄로 터지면 가격이 순간 크게 움직인다.',
    btc: '숏이 대량 청산되면 순간 급등, 롱이 대량 청산되면 순간 급락. 지표 발표 직후에 양쪽이 함께 터지며 "위아래로 흔드는" 장이 자주 나온다.',
    where: [{ href: '/coin-analysis', label: '코인선물 분석 › 실시간 청산' }],
    trap: '청산 규모는 "이미 일어난 일"이다. 청산을 보고 추격 진입하면 흔들기에 같이 털린다.',
  },
  {
    title: '옵션 시장 심리 (풋·콜)',
    why: '풋 = 하락 대비 보험, 콜 = 상승 베팅. 풋 수요와 가격이 치솟으면 시장이 폭락을 두려워한다는 뜻.',
    btc: '풋 수요가 늘어도 가격이 급등하지 않으면 "강세 기대는 식었지만 폭락 공포까지는 아님" 정도로 읽는다.',
    where: [],
    whereNote: '옵션 데이터는 앱에 없음 — Deribit 등 옵션 거래소·분석 사이트에서 확인.',
    trap: '옵션 심리는 해석이 어렵고 초보에게 우선순위가 낮다. 금리·ETF·일정부터 익힌다.',
  },
  {
    title: '핵심 가격대 (지지·저항)',
    why: '여러 번 매수가 들어온 가격(지지), 여러 번 막힌 가격(저항)에 사람들의 주문이 몰린다.',
    btc: '기사의 "○만 달러를 내주면 추가 조정, ○만 달러를 돌파하면 전고점 재시험" 같은 문장이 이것. 손절·사이즈를 정할 기준선으로 쓴다.',
    where: [{ href: '/crypto/BTCUSDT', label: '비트코인 상세 차트' }],
    trap: '가격대 문장은 "이렇게 되면 이렇게 될 수 있다"는 시나리오이지 예측이 아니다. 진입 근거가 아니라 손절 위치를 정하는 데 쓴다.',
  },
];

/* 매일 10분 루틴 — 결론은 방향이 아니라 "오늘 사이즈를 줄일 날인가" */
const ROUTINE: { n: number; title: string; body: string; href: string; link: string }[] = [
  { n: 1, title: '일정부터', body: '오늘·내일 FOMC·CPI 같은 큰 발표가 있나? 있으면 그 전후는 신규 진입을 쉬거나 사이즈를 반으로.', href: '/calendar', link: '경제 캘린더' },
  { n: 2, title: '금리·달러·유가 방향', body: '미 국채 10년물·DXY·유가가 최근 한 달 오르는 중인가? 셋 다 오르면 위험자산에 불리한 바람.', href: '/coins', link: '코인 › 시장환경' },
  { n: 3, title: '돈이 들어오나', body: '현물 ETF가 며칠째 순유입인가, 순유출로 돌았나? 받쳐 주는 힘이 있는지 본다.', href: '/coins', link: '코인 › ETF 순유입' },
  { n: 4, title: '쏠림 확인', body: '청산이 한쪽으로 크게 터지고 있나, 공포·탐욕 지수가 극단인가? 극단일수록 흔들기 주의.', href: '/coin-analysis', link: '코인선물 분석' },
  { n: 5, title: '가격대로 손절 정하기', body: '가까운 지지·저항을 확인하고, 그 밖에 손절을 둔다. 손절까지 거리로 사이즈를 역산한다.', href: '/crypto/BTCUSDT', link: '비트코인 차트' },
];

/* 기사 문장 판별 — 사실/해석/전망 */
const SENTENCES: { kind: string; tone: string; example: string; how: string }[] = [
  { kind: '사실(숫자)', tone: 'var(--ok)', example: '"10년물 금리가 5.3%까지 올랐다", "ETF에 9월 한 달 약 27억 달러 순유입"', how: '앱·원자료에서 직접 확인할 수 있다. 공부의 출발점.' },
  { kind: '해석', tone: 'var(--amber)', example: '"기관 자금이 하단을 지지한 것으로 풀이된다"', how: '그럴듯하지만 한 가지 설명일 뿐. 같은 숫자로 다른 해석도 가능하다.' },
  { kind: '전망·시나리오', tone: 'var(--warn)', example: '"○만 달러를 돌파하면 10만 달러를 향할 가능성"', how: '조건부 가능성. 진입 근거로 쓰지 말고 손절·관망 기준으로만.' },
];

function ToolLinks({ links, note }: { links: { href: string; label: string }[]; note?: string }) {
  return (
    <div className="mt-2.5">
      <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1">앱에서 보는 곳</p>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <Link key={l.href + l.label} href={l.href}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--accent-ink)] font-semibold hover:border-[var(--accent)]">
              {l.label} →
            </Link>
          ))}
        </div>
      )}
      {note && <p className="text-[11px] text-[var(--faint)] mt-1 leading-relaxed">{note}</p>}
    </div>
  );
}

export default function StudyPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">코인 기초 공부법</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        &ldquo;비트코인 상승을 막은 건 미국 국채금리였다&rdquo; 같은 시황 기사를 <strong className="text-[var(--text)]">읽고 → 앱에서 숫자로 확인하고 → 오늘의 행동을 정하는</strong> 연습입니다.
      </p>

      {/* 왜 예측 기능이 아니라 공부법인가 */}
      <section className="rounded-2xl p-4 mb-6" style={{ background: 'var(--amber-soft)' }}>
        <h2 className="text-[14px] font-bold text-[var(--text)] mb-1.5">왜 &ldquo;미리 분석해 주는 기능&rdquo;이 아니라 공부법인가</h2>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          이 앱은 금리·유가·ETF·펀딩·청산 같은 요인으로 방향을 맞히는 엔진을 실제로 만들어 과거 데이터로 측정했습니다.
          결과는 <strong className="text-[var(--text)]">코인 727건 적중 49.7%, 3모드 신호 41.7%</strong> — 동전 던지기보다 낫지 않았습니다.
          시황 기사도 대부분 <strong className="text-[var(--text)]">이미 움직인 가격을 사후에 설명</strong>합니다. 그래서 &ldquo;미리 맞혀 주는 기능&rdquo;은 오히려 과신을 키워 잃을 확률을 높일 수 있습니다.
        </p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)] mt-2">
          대신 이 요인들로 확실히 할 수 있는 것은 하나입니다 — <strong className="text-[var(--text)]">&ldquo;오늘은 위험이 큰 날인가?&rdquo;를 알고 사이즈를 줄이거나 쉬는 것.</strong> 잃을 확률은 방향을 맞혀서가 아니라 크게 걸지 않아서 줄어듭니다.
        </p>
        <Link href="/principles" className="inline-block mt-2 text-[12px] font-semibold text-[var(--accent-ink)]">매매 대원칙 보기 →</Link>
      </section>

      {/* 요인별 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">1. 기사에 나오는 요인 읽는 법</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-3">원리 → 비트코인에 어떻게 → 앱에서 확인 → 함정 순서로.</p>
      <div className="space-y-3 mb-8">
        {FACTORS.map((f, i) => (
          <article key={f.title} className="fin-card p-4">
            <h3 className="text-[14px] font-bold text-[var(--text)] flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg text-xs font-extrabold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>{i + 1}</span>
              {f.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)] mt-2"><b className="text-[var(--text)]">원리</b> · {f.why}</p>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)] mt-1.5"><b className="text-[var(--text)]">비트코인에</b> · {f.btc}</p>
            <ToolLinks links={f.where} note={f.whereNote} />
            <p className="text-[12px] leading-relaxed mt-2.5 rounded-lg px-3 py-2" style={{ background: 'var(--warn-soft)', color: 'var(--ink-2)' }}>
              <b style={{ color: 'var(--warn)' }}>함정</b> · {f.trap}
            </p>
          </article>
        ))}
      </div>

      {/* 문장 판별 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">2. 기사 문장을 세 가지로 나눠 읽기</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-3">한 기사 안에 사실·해석·전망이 섞여 있다. 사실만 확인하고, 해석과 전망은 한 발 떨어져서.</p>
      <div className="fin-card divide-y divide-[var(--line-2)] mb-8">
        {SENTENCES.map((s) => (
          <div key={s.kind} className="p-4">
            <p className="text-[13px] font-bold" style={{ color: s.tone }}>{s.kind}</p>
            <p className="text-[12.5px] text-[var(--text)] mt-1">{s.example}</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">{s.how}</p>
          </div>
        ))}
      </div>

      {/* 루틴 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">3. 매일 10분 루틴</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-3">결론은 &ldquo;오를까 내릴까&rdquo;가 아니라 <b className="text-[var(--text)]">&ldquo;오늘 평소대로 / 반으로 / 쉰다&rdquo;</b> 셋 중 하나.</p>
      <ol className="space-y-2 mb-8">
        {ROUTINE.map((r) => (
          <li key={r.n} className="fin-card p-3.5 flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-[13px] font-extrabold" style={{ background: 'var(--accent)', color: '#fff' }}>{r.n}</span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-[var(--text)]">{r.title}</p>
              <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed mt-0.5">{r.body}</p>
              <Link href={r.href} className="inline-block mt-1 text-[12px] font-semibold text-[var(--accent-ink)]">{r.link} →</Link>
            </div>
          </li>
        ))}
      </ol>

      {/* 기록 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">4. 공부한 걸 기록해서 검증하기</h2>
      <div className="fin-card p-4 mb-8">
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          매매할 때 그날 본 환경을 남기세요. 매매일지에서 매매를 눌러 <b className="text-[var(--text)]">셋업 &lsquo;뉴스·이벤트&rsquo;</b> 태그와 메모(&ldquo;10년물 급등 중, ETF 유출&rdquo;)를 달고,
          진입 직전 차트를 <b className="text-[var(--text)]">스냅샷</b>으로 붙여 두면 한두 달 뒤 <b className="text-[var(--text)]">셋업별 성적</b>으로 &ldquo;이 공부가 내 매매에 실제로 도움이 됐나&rdquo;를 숫자로 확인할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Link href="/journal" className="inline-flex px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--accent-ink)] font-semibold">매매일지 — 태그·메모·스냅샷 →</Link>
          <Link href="/performance" className="inline-flex px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--accent-ink)] font-semibold">성과 — 실제 성적 →</Link>
        </div>
      </div>

      {/* 하지 말 것 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-2">5. 공부하다 빠지기 쉬운 함정</h2>
      <ul className="space-y-1.5 mb-8 text-[13px] text-[var(--text-muted)] leading-relaxed">
        <li>• 기사 한 줄(&ldquo;돌파하면 10만 달러&rdquo;)을 보고 바로 진입하기</li>
        <li>• 사후 설명을 다음 움직임의 예측으로 착각하기 — 기사는 대부분 이미 일어난 일을 설명한다</li>
        <li>• 요인을 많이 알수록 확신이 생겨 레버리지·사이즈를 키우기</li>
        <li>• 맞힌 날만 기억하기 — 그래서 기록(매매일지)과 성적(성과)으로 확인한다</li>
      </ul>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4">
        이 페이지는 시황 기사를 읽는 일반적인 방법을 이 앱의 화면에 연결해 정리한 학습 자료입니다. 특정 기사를 옮긴 것이 아니며, 예시 숫자는 설명용입니다.
        모든 내용은 참고용이며 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
