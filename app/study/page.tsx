import Link from 'next/link';
import type { Metadata } from 'next';
import { StudyNav, StudyLead, COURSES, KvTable, StudyFooter } from '@/components/study/StudyShell';

export const metadata: Metadata = {
  title: '코인 기초 공부법',
  description: '차트·보조지표(RSI·MACD·볼린저)·피보나치·금리와 국채·유가 등 코인 기초를 그림과 함께. 방향 예측이 아니라 "오늘 위험이 큰 날인가"를 판단하는 공부.',
};

const HERE = '/study';

/* 매일 10분 루틴 — 결론은 방향이 아니라 "오늘 사이즈를 줄일 날인가" */
const ROUTINE: { n: number; title: string; body: string; href: string; link: string }[] = [
  { n: 1, title: '일정부터', body: '오늘·내일 FOMC·CPI 같은 큰 발표가 있나? 있으면 그 전후는 신규 진입을 쉬거나 사이즈를 반으로.', href: '/calendar', link: '경제 캘린더' },
  { n: 2, title: '금리·달러·유가 방향', body: '미 국채 10년물·DXY·유가가 최근 한 달 오르는 중인가? 셋 다 오르면 위험자산에 맞바람.', href: '/coins', link: '코인 › 시장환경' },
  { n: 3, title: '돈이 들어오나', body: '현물 ETF가 며칠째 순유입인가, 순유출로 돌았나? 받쳐 주는 힘이 있는지 본다.', href: '/coins', link: '코인 › ETF 순유입' },
  { n: 4, title: '쏠림 확인', body: '펀딩비가 치솟았나, 청산이 한쪽으로 터지나, 공포·탐욕 지수가 극단인가? 극단일수록 흔들기 주의.', href: '/coin-analysis', link: '코인선물 분석' },
  { n: 5, title: '차트로 손절 정하기', body: '일봉 추세(고점·저점) → 가까운 지지·저항·피보나치 레벨 → 그 밖에 손절. 손절까지 거리로 사이즈를 역산.', href: '/crypto/BTCUSDT', link: '비트코인 차트' },
];

/* 기사 문장 판별 — 사실/해석/전망 */
const SENTENCES: { kind: string; tone: string; example: string; how: string }[] = [
  { kind: '사실(숫자)', tone: 'var(--ok)', example: '"10년물 금리가 5.3%까지 올랐다", "ETF에 한 달간 약 27억 달러 순유입"', how: '앱·원자료에서 직접 확인할 수 있다. 공부의 출발점.' },
  { kind: '해석', tone: 'var(--amber)', example: '"기관 자금이 하단을 지지한 것으로 풀이된다"', how: '그럴듯하지만 한 가지 설명일 뿐. 같은 숫자로 다른 해석도 가능하다.' },
  { kind: '전망·시나리오', tone: 'var(--warn)', example: '"○만 달러를 돌파하면 10만 달러를 향할 가능성"', how: '조건부 가능성. 진입 근거로 쓰지 말고 손절·관망 기준으로만.' },
];

export default function StudyPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <StudyNav current={HERE} />
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">코인 기초 공부법</h1>
      <StudyLead>차트 읽기부터 RSI·MACD·피보나치, 금리·국채·유가와 코인의 관계까지 — <b className="text-[var(--text)]">그림으로 배우고 → 앱에서 숫자로 확인하고 → 오늘의 행동(사이즈)을 정하는</b> 과정입니다.</StudyLead>

      {/* 왜 예측 기능이 아니라 공부법인가 */}
      <section className="rounded-2xl p-4 mb-5" style={{ background: 'var(--amber-soft)' }}>
        <h2 className="text-[14px] font-bold text-[var(--text)] mb-1.5">왜 &ldquo;미리 분석해 주는 기능&rdquo;이 아니라 공부법인가</h2>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          이 앱은 금리·유가·ETF·펀딩·청산·차트 지표로 방향을 맞히는 엔진을 실제로 만들어 과거 데이터로 측정했습니다.
          결과는 <strong className="text-[var(--text)]">코인 727건 적중 49.7%, 3모드 신호 41.7%</strong> — 동전 던지기보다 낫지 않았습니다.
          시황 기사도 대부분 <strong className="text-[var(--text)]">이미 움직인 가격을 사후에 설명</strong>합니다. &ldquo;미리 맞혀 주는 기능&rdquo;은 오히려 과신을 키워 잃을 확률을 높일 수 있습니다.
        </p>
        <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)] mt-2">
          대신 이 공부로 확실히 할 수 있는 것 — <strong className="text-[var(--text)]">&ldquo;오늘은 위험이 큰 날인가?&rdquo;를 알고, 틀렸을 때 나올 자리를 미리 정해 크게 걸지 않는 것.</strong> 잃을 확률은 방향을 맞혀서가 아니라 크게 걸지 않아서 줄어듭니다.
        </p>
        <Link href="/principles" className="inline-block mt-2 text-[12px] font-semibold text-[var(--accent-ink)]">매매 대원칙 보기 →</Link>
      </section>

      {/* 과정 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-2">과정</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-7">
        {COURSES.filter((c) => c.n > 0).map((c) => (
          <Link key={c.href} href={c.href} className="fin-card p-4 block">
            <div className="flex items-center gap-2">
              <span className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-[13px] font-extrabold" style={{ background: 'var(--accent)', color: '#fff' }}>{c.n}</span>
              <b className="text-[14px] text-[var(--text)]">{c.title}</b>
            </div>
            <p className="text-[12px] text-[var(--text-muted)] mt-1.5 leading-relaxed">{c.desc}</p>
          </Link>
        ))}
      </div>

      {/* 문장 판별 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">시황 기사를 세 가지로 나눠 읽기</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-3">한 기사 안에 사실·해석·전망이 섞여 있다. 사실만 확인하고, 해석과 전망은 한 발 떨어져서.</p>
      <div className="fin-card divide-y divide-[var(--line-2)] mb-7">
        {SENTENCES.map((s) => (
          <div key={s.kind} className="p-4">
            <p className="text-[13px] font-bold" style={{ color: s.tone }}>{s.kind}</p>
            <p className="text-[12.5px] text-[var(--text)] mt-1">{s.example}</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">{s.how}</p>
          </div>
        ))}
      </div>

      {/* 루틴 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">매일 10분 루틴</h2>
      <p className="text-[12px] text-[var(--text-muted)] mb-3">결론은 &ldquo;오를까 내릴까&rdquo;가 아니라 <b className="text-[var(--text)]">&ldquo;오늘 평소대로 / 반으로 / 쉰다&rdquo;</b> 셋 중 하나.</p>
      <ol className="space-y-2 mb-7">
        {ROUTINE.map((r) => (
          <li key={r.n} className="fin-card p-3.5 flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 grid place-items-center rounded-full text-[13px] font-extrabold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>{r.n}</span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-[var(--text)]">{r.title}</p>
              <p className="text-[12.5px] text-[var(--text-muted)] leading-relaxed mt-0.5">{r.body}</p>
              <Link href={r.href} className="inline-block mt-1 text-[12px] font-semibold text-[var(--accent-ink)]">{r.link} →</Link>
            </div>
          </li>
        ))}
      </ol>

      {/* 기록 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">공부한 걸 기록해서 검증하기</h2>
      <div className="fin-card p-4 mb-7">
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          매매할 때 근거를 남기세요. 매매일지에서 매매를 눌러 <b className="text-[var(--text)]">셋업 태그</b>(돌파·눌림목·지지저항 반등·뉴스·패턴…)와 메모(&ldquo;골든 포켓 반등, 10년물 상승 중&rdquo;)를 달고,
          진입 직전 차트를 <b className="text-[var(--text)]">스냅샷</b>으로 붙여 두면 한두 달 뒤 <b className="text-[var(--text)]">셋업별 성적</b>으로 &ldquo;이 공부가 내 매매에 실제로 도움이 됐나&rdquo;를 숫자로 확인할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Link href="/journal" className="inline-flex px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--accent-ink)] font-semibold">매매일지 — 태그·메모·스냅샷 →</Link>
          <Link href="/performance" className="inline-flex px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] text-[var(--accent-ink)] font-semibold">성과 — 실제 성적 →</Link>
        </div>
      </div>

      {/* 함정 */}
      <h2 className="text-[15px] font-bold text-[var(--text)] mb-2">공부하다 빠지기 쉬운 함정</h2>
      <div className="fin-card p-4 mb-7">
        <KvTable head={['함정', '대신']} rows={[
          ['기사·지표 한 줄 보고 바로 진입', '손절 자리부터 정하고, 사이즈를 계산한 뒤에'],
          ['사후 설명을 예측으로 착각', '사실(숫자)만 확인, 전망은 시나리오로'],
          ['많이 알수록 레버리지 ↑', '아는 것과 맞히는 건 다르다 — 사이즈는 그대로'],
          ['맞힌 날만 기억', '매매일지·성과로 숫자 확인'],
          ['지표를 계속 추가', '추세·모멘텀·변동성·거래량에서 하나씩만'],
        ]} />
      </div>

      <StudyFooter current={HERE} />
    </div>
  );
}
