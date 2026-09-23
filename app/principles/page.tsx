import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '매매 대원칙',
  description: '오래 살아남은 매매의 공통 원칙 — 지킬 3가지·피할 3가지. 방향 예측이 아니라 손실 통제·기록·습관으로.',
};

/* 원칙을 지키게 도와주는 앱 도구로 연결한다 */
interface Tool { href: string; label: string }
interface Principle { n: number; title: string; body: string; tools?: Tool[]; toolNote?: string }

// 지킬 원칙 — 특정인의 글을 옮긴 것이 아니라, 오래 살아남은 매매의 공통 규율을 이 앱의 언어로 정리한 것.
const DO: Principle[] = [
  {
    n: 1,
    title: '잃을 돈을 먼저 정한다',
    body: '얼마를 벌지는 시장이 정하지만, 얼마까지 잃을지는 내가 정할 수 있다. 한 번의 매매에서 잃어도 되는 금액을 계좌의 작은 비율(예: 0.5~1%)로 미리 묶고, 레버리지는 낮게 둔다. 진입가가 아니라 손절가에서 사이즈가 나온다.',
    toolNote: '이 앱이 돕는 방법',
    tools: [
      { href: '/journal', label: '매매일지 — 손실·사이즈 기록' },
      { href: '/', label: '홈 오늘의 리스크 — 서킷브레이커 상태' },
    ],
  },
  {
    n: 2,
    title: '번 돈은 계좌 밖으로 뺀다',
    body: '계좌 잔액은 성적표가 아니라 다음 판의 판돈이다. 실현이익의 일부를 주기적으로 빼두면, 큰 낙폭이 와도 이미 빠져나간 돈은 지킬 수 있다. 불어난 잔액에 사이즈를 자동으로 키우지 않는다.',
    toolNote: '이 앱이 돕는 방법',
    tools: [
      { href: '/performance', label: '성과 — 실현손익·기대값' },
      { href: '/journal', label: '매매일지 — 실현손익 누적 기록' },
    ],
  },
  {
    n: 3,
    title: '잃은 날에도 하던 대로 한다',
    body: '손실 다음 날 사이즈를 갑자기 키우지 않는다. 잃은 걸 한 방에 되찾으려는 "복수 매매"가 계좌를 가장 빨리 망가뜨린다. 이기든 지든 같은 규칙·같은 크기로 반복하는 것이 장기 생존의 조건이다.',
    toolNote: '이 앱이 돕는 방법',
    tools: [
      { href: '/journal', label: '매매일지 — 손절 후 사이즈 급증·복기' },
      { href: '/', label: '홈 오늘의 리스크 — 서킷브레이커 상태' },
    ],
  },
];

// 따라 하면 안 되는 것 — 살아남은 한 사람의 무용담을 규칙으로 착각할 때 생기는 함정.
const DONT: Principle[] = [
  {
    n: 1,
    title: '"저 사람도 했으니 나도" 라는 생각',
    body: '우리가 보는 건 살아남은 한 사람의 기록이지, 같은 방식을 따라 한 사람들의 평균 결과가 아니다(생존편향). 성공담 대부분은 소수의 대박 포지션에서 나오고, 그 사람도 어딘가에서 크게 깨진 적이 있다. 이 앱의 자체 대규모 측정에서도 방향 예측의 우위는 어디에서도 확인되지 않았다 — 남는 건 손실 통제뿐이다.',
  },
  {
    n: 2,
    title: '손실 포지션을 오래 들고 물타기',
    body: '손절 라인을 지키지 않고 버티며 계속 물을 타는 습관은, 실력으로 버틴 사람을 흉내 내는 순간 계좌를 날리는 가장 빠른 길이 된다. 손절은 지는 게 아니라 다음 판을 살리는 비용이다.',
    tools: [{ href: '/journal', label: '매매일지에 손절 계획을 먼저 기록하기' }],
  },
  {
    n: 3,
    title: '항상 시장에 붙어 24시간 본다',
    body: '전업 수준의 노동을 겸업으로 흉내 내면 구조 자체가 성립하지 않는다. 더 오래 본다고 승률이 오르지 않는다 — 오히려 과잉매매·복수매매로 이어진다. 규칙에 맞는 자리만 골라 치고, 나머지는 계좌 밖에서 기다린다.',
  },
];

function ToolLinks({ note, tools }: { note?: string; tools?: Tool[] }) {
  if (!tools?.length) return null;
  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)]">
      {note && <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-2 uppercase tracking-wide">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {tools.map((t) => (
          <Link key={t.href + t.label} href={t.href}
            className="inline-flex items-center gap-1 text-[12px] font-semibold px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
            {t.label}
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function PrinciplesPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">매매 대원칙</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5 leading-relaxed">
        오래 살아남은 매매에는 공통점이 있습니다 — 방향을 잘 맞혀서가 아니라, <strong className="text-[var(--text)]">잃는 쪽을 통제</strong>했기 때문입니다.
        이 앱의 도구(매매일지·성과·서킷브레이커·오늘의 리스크)는 아래 원칙을 <strong className="text-[var(--text)]">실행 가능하게</strong> 만들기 위한 것입니다.
      </p>

      {/* 지킬 3 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          지킬 원칙 3
        </span>
      </div>
      <div className="space-y-3 mb-8">
        {DO.map((p) => (
          <div key={p.n} className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4">
            <h2 className="text-[15px] font-bold text-[var(--text)] flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg bg-emerald-500/15 text-emerald-500 text-xs font-extrabold">{p.n}</span>
              {p.title}
            </h2>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)] mt-2">{p.body}</p>
            <ToolLinks note={p.toolNote} tools={p.tools} />
          </div>
        ))}
      </div>

      {/* 피할 3 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
          따라 하면 안 되는 것 3
        </span>
      </div>
      <div className="space-y-3 mb-8">
        {DONT.map((p) => (
          <div key={p.n} className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
            <h2 className="text-[15px] font-bold text-[var(--text)] flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg bg-amber-500/15 text-amber-500 text-xs font-extrabold">{p.n}</span>
              {p.title}
            </h2>
            <p className="text-[13px] leading-relaxed text-[var(--text-muted)] mt-2">{p.body}</p>
            <ToolLinks note="이 앱이 돕는 방법" tools={p.tools} />
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4">
        위 원칙은 특정인의 글을 옮긴 것이 아니라, 오래 살아남은 매매의 공통 규율을 이 앱의 관점(방향이 아닌 리스크 관리)에서 재정리한 것입니다.
        모든 내용은 참고용이며 투자 권유가 아닙니다. 자체 대규모 측정에서 코인·주식 엔진 모두 방향 예측의 우위가 확인되지 않았습니다 — 체크리스트로만 사용하세요.
      </p>
    </div>
  );
}
