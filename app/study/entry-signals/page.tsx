import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '롱·숏 진입 신호 가이드 — KOSPI LAB',
  description: '단기 상승/하락 신호 평가, 중요한 가격대, 상승 지속 신뢰도 기준, 그래프로 이해하는 상승·하락 과정, RSI·MACD 해석법, 롱/숏 진입 전 체크와 최종 진입 규칙.',
};

/* 이 앱 원칙: 방향 예측 우위 없음(대규모 백테스트 49.7%). 아래는 '조건 충족도'를 읽는 체크리스트이지 매수 신호가 아니다. */

function Sec({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-base font-extrabold text-[var(--text)] mb-2 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 text-[12px] font-bold">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

function Tbl({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-[12px] min-w-[420px]">
        <thead><tr className="bg-[var(--surface-2)] text-[var(--text-muted)] text-left">{head.map((h) => <th key={h} className="font-semibold px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-[var(--border)] text-[var(--text)]">{r.map((c, j) => <td key={j} className="px-3 py-2 align-top leading-snug">{c}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const UP = 'var(--up, #ef4444)'; // 상승=빨강(국내 관행)과 무관하게 차트 상승선은 초록으로(교육용 명료성)
const GREEN = '#10b981';
const RED = '#f43f5e';
const MUT = 'var(--text-muted)';

/** 상승/하락 과정 설명용 인라인 SVG (실제 시세 아님) */
function RiseFallSvg() {
  return (
    <svg viewBox="0 0 360 150" className="w-full h-auto" role="img" aria-label="상승과 하락 과정 예시 그래프">
      {/* 저항/지지 점선 */}
      <line x1="10" y1="40" x2="350" y2="40" stroke={RED} strokeDasharray="4 4" strokeWidth="1" opacity="0.7" />
      <line x1="10" y1="110" x2="350" y2="110" stroke={GREEN} strokeDasharray="4 4" strokeWidth="1" opacity="0.7" />
      {/* 상승 경로: 저점상승→고점돌파→돌파후지지 */}
      <polyline points="15,120 45,100 70,112 100,78 130,90 160,45 185,58 215,30" fill="none" stroke={GREEN} strokeWidth="2.2" />
      <circle cx="70" cy="112" r="3" fill={GREEN} /><circle cx="130" cy="90" r="3" fill={GREEN} />
      <text x="60" y="135" fontSize="8" fill={MUT}>저점 상승</text>
      <text x="150" y="36" fontSize="8" fill={GREEN}>고점 돌파</text>
      {/* 하락 경로: 지지이탈→되돌림실패 */}
      <polyline points="215,30 240,55 265,48 290,85 315,75 340,118" fill="none" stroke={RED} strokeWidth="2.2" />
      <circle cx="265" cy="48" r="3" fill={RED} />
      <text x="250" y="42" fontSize="8" fill={RED}>되돌림 실패</text>
      <text x="300" y="100" fontSize="8" fill={RED}>지지 이탈</text>
      <text x="14" y="34" fontSize="8" fill={RED}>저항</text>
      <text x="14" y="124" fontSize="8" fill={GREEN}>지지</text>
    </svg>
  );
}

export default function EntrySignalsGuidePage() {
  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto pb-14">
      <Link href="/study" className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]">← 공부법으로</Link>
      <h1 className="text-xl font-extrabold text-[var(--text)] mt-2 mb-1">롱·숏 진입 신호 가이드</h1>
      <p className="text-sm text-[var(--text-muted)] mb-3 leading-relaxed">
        언제·어느 가격에 들어가고 어디서 끊을지를 <b className="text-[var(--text)]">조건 충족도</b>로 빠르게 판단하는 법. 분석 화면(<Link href="/coin-analysis" className="underline hover:text-[var(--text)]">코인선물 분석</Link>)이 현재값·판정을 자동 계산해 주고, 이 가이드는 <b className="text-[var(--text)]">어떤 값이 상승/하락 신뢰인지 기준</b>을 정리합니다.
      </p>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 mb-6">
        <p className="text-[11px] text-amber-300/90 leading-snug">⚠ <b>매수·매도 신호가 아닙니다.</b> 이 앱 실측상 방향 예측 우위는 없습니다(룰 엔진 백테스트 49.7%). 체크리스트는 <b>진입 조건이 갖춰졌는지</b>를 볼 뿐이고, 들어갈지는 본인 판단·리스크 관리입니다.</p>
      </div>

      <Sec n={1} title="단기 상승/하락 신호 평가">
        <p className="text-[12px] text-[var(--text-muted)] mb-2 leading-relaxed">각 지표가 어떤 값일 때 상승 신뢰(롱)·하락 신뢰(숏)인지. 분석 화면은 현재값에 긍정/부정/중립을 자동으로 붙입니다.</p>
        <Tbl head={['지표', '상승 신뢰(롱)', '하락 신뢰(숏)']} rows={[
          ['가격 구조', '고점·저점이 함께 ↑ (저점 상승)', '고점·저점이 함께 ↓'],
          ['EMA 정렬', 'EMA20 > EMA60 (정배열), 가격이 그 위', 'EMA20 < EMA60 (역배열), 가격이 아래'],
          ['RSI(14)', <>50~70 유지 <span className="text-[var(--text-muted)]">(70+ 과열은 추격 주의)</span></>, <>50 아래·30 부근 <span className="text-[var(--text-muted)]">(30- 침체는 반등 주의)</span></>],
          ['MACD', '0선 위·히스토그램 양(+)이 확대', '0선 아래·음(−)이 확대'],
          ['VWAP', '가격이 VWAP(당일 평균체결가) 위', '가격이 VWAP 아래'],
          ['거래량', '돌파 시 최근 20봉 평균의 1.5배↑', '하락 시 거래량 증가'],
          ['OI(미결제)', '가격 상승 + OI 증가 = 신규 매수 유입', '가격 하락 + OI 증가 = 하방 압력'],
        ]} />
        <p className="text-[11px] text-[var(--text-muted)] mt-2">가장 중요한 건 <b className="text-[var(--text)]">가격 구조와 거래량</b>. RSI·MACD는 가격을 뒤따르는 보조 지표라 단독 판단은 늦습니다.</p>
      </Sec>

      <Sec n={2} title="중요한 가격대">
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mb-2">진입 전에 <b className="text-[var(--text)]">돌파선·지지·저항</b>을 먼저 표시하세요. 분석 화면의 &lsquo;중요한 가격대&rsquo; 사다리가 현재가 기준 위·아래 레벨을 자동 정렬합니다.</p>
        <Tbl head={['레벨', '의미']} rows={[
          [<b className="text-red-400">저항·24h 고점</b>, '위에서 막히는 가격. 돌파+거래량이면 상승 가속'],
          [<b className="text-sky-400">핵심 돌파선</b>, '직전 반등 고점. 여기 돌파가 확인되면 상승 신뢰↑'],
          [<b className="text-emerald-400">지지</b>, '아래서 받치는 가격. 눌림에서 재지지면 롱 유리'],
          ['돌파 후 지지(눌림)', '깨진 저항이 지지로 바뀌는 자리 = 추격보다 유리한 진입 후보'],
        ]} />
      </Sec>

      <Sec n={3} title="상승 지속 신뢰도 5가지 기준">
        <ol className="space-y-1.5 text-[12px] text-[var(--text)] list-decimal pl-5 leading-relaxed">
          <li><b>가격 구조</b> — 전고점 돌파 + 저점이 계속 높아짐(저점 상승)</li>
          <li><b>거래량</b> — 돌파할 때 평소보다 거래가 늘어남(1.5배↑)</li>
          <li><b>EMA·VWAP</b> — 가격이 EMA20·VWAP 위에서 유지</li>
          <li><b>RSI·MACD</b> — RSI 50 이상, MACD 상승 모멘텀 확대</li>
          <li><b>OI</b> — 가격 상승과 함께 미결제약정 증가(신규 참여)</li>
        </ol>
        <p className="text-[11px] text-[var(--text-muted)] mt-2">다섯이 동시에 맞을수록 단순 반등보다 추세 지속 근거가 강해집니다. 반대로 하락은 각 항목을 뒤집어 보면 됩니다.</p>
      </Sec>

      <Sec n={4} title="그래프로 이해하는 상승·하락 과정">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <RiseFallSvg />
          <p className="text-[10px] text-[var(--text-muted)] text-center">패턴 설명용 그래프 — 실제 시세 아님</p>
        </div>
        <ul className="mt-2 space-y-1 text-[12px] text-[var(--text)] leading-relaxed">
          <li><b className="text-emerald-400">상승</b>: 저점 상승 → 고점 돌파 → 돌파 후 이전 저항이 지지로 전환되면 추세 지속 근거가 강해짐.</li>
          <li><b className="text-red-400">하락</b>: 지지 이탈 → 다시 올라와도 이전 지지(=저항)를 못 넘고 되돌림 실패 → 하락 재개.</li>
        </ul>
      </Sec>

      <Sec n={5} title="RSI·MACD 해석법">
        <Tbl head={['지표', '롱 관점', '숏 관점']} rows={[
          ['RSI(14)', '50 위에서 상승·고점 갱신이면 긍정. 70+는 과열이라 추격 대신 눌림 대기', '50 아래에서 하락이면 부정. 30-는 침체라 반등 주의'],
          ['MACD', '0선 위 + 히스토그램 양(+)이 연속 커지면 모멘텀 강화', '0선 아래 + 음(−) 확대면 하락 모멘텀. 음(−)이 줄면 하락 힘 약화'],
        ]} />
        <p className="text-[11px] text-[var(--text-muted)] mt-2">RSI·MACD는 <b className="text-[var(--text)]">가격을 뒤따르는</b> 지표라, 가격 구조·거래량과 <b className="text-[var(--text)]">같이</b> 봐야 늦거나 잘못된 신호를 거릅니다.</p>
      </Sec>

      <Sec n={6} title="롱·숏 진입 전 체크 + 최종 규칙">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <p className="text-[12px] font-bold text-emerald-400 mb-1.5">롱 진입 전 5초 체크</p>
            <ol className="text-[11px] text-[var(--text)] space-y-1 list-decimal pl-4 leading-snug">
              <li>이전 고점을 5분봉 종가로 돌파했나?</li>
              <li>돌파할 때 거래량이 늘었나?</li>
              <li>가격이 EMA20·VWAP 위에 있나?</li>
              <li>RSI 50↑, MACD 개선 중인가?</li>
              <li>가격 상승과 함께 OI 증가하나?</li>
            </ol>
          </div>
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
            <p className="text-[12px] font-bold text-red-400 mb-1.5">숏 진입 전 5초 체크</p>
            <ol className="text-[11px] text-[var(--text)] space-y-1 list-decimal pl-4 leading-snug">
              <li>이전 저점을 5분봉 종가로 이탈했나?</li>
              <li>하락할 때 거래량이 늘었나?</li>
              <li>가격이 EMA20·VWAP 아래인가?</li>
              <li>RSI 50↓, MACD 하락 중인가?</li>
              <li>가격 하락과 OI 증가가 동반되나?</li>
            </ol>
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
          <p className="text-[12px] font-bold text-[var(--text)] mb-1.5">최종 진입 규칙 (세 가지 모두 맞을 때만)</p>
          <ol className="text-[12px] text-[var(--text)] space-y-1 list-decimal pl-4 leading-snug">
            <li>고점 돌파(롱)·저점 이탈(숏) <b>+ 거래량 증가</b></li>
            <li>돌파/이탈한 가격이 <b>다시 지지/저항으로 전환</b> 확인</li>
            <li>목표 수익이 예상 손실의 <b>최소 1.5배(R:R ≥ 1.5)</b></li>
          </ol>
          <p className="text-[11px] text-[var(--text-muted)] mt-2">특히 고배율이라면 <b className="text-[var(--text)]">진입 전에 손절가부터</b> 정하세요. 5개 지표가 다 좋아도 손절 위치가 너무 멀면 건너뛰는 게 낫습니다. 5분봉은 진입 타이밍, 1시간봉은 방향, 4시간봉은 전체 추세 확인용.</p>
        </div>
      </Sec>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-4">
        이 가이드와 점수는 빠른 판단을 돕는 체크리스트이지 상승 확률·수익을 보장하지 않습니다. 투자 손실의 책임은 본인에게 있으며, 레버리지 상품은 원금 초과 손실이 발생할 수 있습니다.
      </p>
    </div>
  );
}
