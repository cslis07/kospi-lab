import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import warnRaw from '@/public/data/crash-warning-stats.json';
import precRaw from '@/public/data/precursor-stats.json';
import type { WarningStatsFile, Scorecard } from '@/lib/crashWarning';
import type { StatsFile, ShockStat } from '@/lib/crashPrecursor';
import { Lesson, Tip, Trap, KvTable } from '@/components/study/StudyShell';

export const metadata: Metadata = {
  title: '폭락 대응 교본',
  description: 'ETH 2026.10.24-25 폭락 분석에서 나온 3단계 대응(감지·가속 확인·종료 확인), 30초 체크리스트와 점수별 행동, 바이낸스 5분봉 2년 측정 결과.',
};

/* 사용자 문서 「ETH 2026.10.24-25 폭락 분석」 요약 + 측정 결과(scripts/backtest-crash-warning.ts · scripts/precursor-stats.ts 가 만든 정적 파일).
   측정 정의는 lib/crashWarning 머리말과 같다: 폭락 = 60분 안 −3%, 경고 적중 = 15~75분 안 −3%, 대조군 = 아무 5분 시점. */

const W = warnRaw as unknown as WarningStatsFile;
const P = precRaw as unknown as StatsFile;

const COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'] as const;
const coinName = (s: string) => s.replace('USDT', '');
const SIGS: { key: string; label: string; desc: string }[] = [
  { key: 'check4', label: '체크리스트 4개↑', desc: '아래 30초 체크리스트 5개 중 4개 이상' },
  { key: 'core', label: '상위 약세+이탈+거래량', desc: '일봉·4H·1H 모두 EMA20 아래 + 15분 종가가 6시간 저점 아래 + 5분 거래량 3배' },
  { key: 'failReclaim', label: '반등 실패+새 저점', desc: '15분 지지 이탈 → 종가로 못 되찾음 → 이탈 후 저점을 다시 깸' },
  { key: 'h1VolBreak', label: '1H 거래량 4배', desc: '1시간 거래량이 직전 20개 평균의 4배 + 종가 EMA20 아래' },
  { key: 'mtf', label: '상위 시간봉 약세', desc: '일봉·4H·1H 종가가 모두 EMA20 아래(환경 필터)' },
];
const VERDICT: Record<string, { t: string; chip: string }> = {
  significant: { t: '유의', chip: 'good' }, noise: { t: '우연 범위', chip: 'flat' }, thin: { t: '표본 부족', chip: 'flat' },
  continue: { t: '추가 하락 쪽 유의', chip: 'warn' }, revert: { t: '되돌림 쪽 유의', chip: 'good' },
};
const card = (coin: string, key: string): Scorecard | undefined => W.coins[coin]?.find((c) => c.key === key);
const f1 = (n: number) => `${n.toFixed(1)}%`;
const share = (a: number, n: number) => (n ? `${Math.round((a / n) * 100)}%` : '–');

const STAGES: { n: string; tag: string; title: string; goal: string; items: ReactNode[] }[] = [
  {
    n: '①', tag: '예방', title: '폭락 위험 감지', goal: '신규 롱을 제한한다',
    items: [
      '일봉·4H·1H가 모두 EMA20 아래 — 롱에 불리한 장(이것만으로 폭락 확률이 오르진 않음)',
      '1H 반등 고점이 계속 낮아짐 · 극단적 압축(변동폭 매우 좁음, 주말·새벽)',
      '1시간 거래량이 평소 몇 배로 튀며 EMA20 아래 마감',
    ],
  },
  {
    n: '②', tag: '경계', title: '하락 가속 확인', goal: '신규 롱 중단 · 손절은 규칙대로 · 숏 추격 금지',
    items: [
      <><b>지지선 이탈</b> — 15분 종가가 직전 6시간 저점 아래</>,
      <><b>거래량 증가</b> — 이탈 봉의 5분 거래량이 평소 3배 이상</>,
      <><b>반등 실패</b> — 깨진 지지를 종가로 못 되찾고 저점을 다시 깸</>,
      '이미 크게 빠진 뒤 숏으로 따라가지 않는다(되돌림에 손절당하기 쉬움)',
    ],
  },
  {
    n: '③', tag: '재진입 검토', title: '폭락 종료 확인', goal: '아래가 모두 맞을 때만 다시 롱을 검토',
    items: [
      '새 저점이 더 안 나오고 멈춤',
      '가까운 저항을 돌파한 뒤 15분 종가로 그 위 유지',
      '되돌림(리테스트)에서 돌파한 자리가 지지로 버팀',
      '반등 봉에 매수 거래량이 실림',
      'BTC가 같이 안정(새 저점 없음)',
    ],
  },
];

const CHECK = [
  '1H 반등 고점이 낮아짐',
  '15분 종가가 직전 6시간 저점 아래(지지 이탈)',
  '그 이탈 때 5분 거래량 3배 이상',
  '반등 후 지지를 못 되찾고 새 저점',
  'BTC도 15분 지지 이탈(최근 30분, BTC 자체는 4개 기준)',
];

function ShockRow({ label, s }: { label: string; s: ShockStat }) {
  const v = VERDICT[s.verdict] ?? VERDICT.noise;
  return (
    <tr className="border-t border-[var(--line-2)]">
      <td className="py-1.5 pr-2 font-bold text-[var(--text)] whitespace-nowrap">{label}</td>
      <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{s.n}</td>
      <td className="py-1.5 pr-2 text-right tabular-nums font-semibold" style={{ color: 'var(--warn)' }}>{share(s.cont, s.n)}</td>
      <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{share(s.rev, s.n)}</td>
      <td className="py-1.5 text-right"><span className={`fin-chip ${v.chip}`}>{v.t}</span></td>
    </tr>
  );
}

export default function CrashPlaybookPage() {
  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto pb-12 min-w-0">
      <Link href="/study" className="text-[12px] font-semibold text-[var(--accent-ink)]">← 코인 기초 공부법</Link>
      <h1 className="text-xl font-extrabold text-[var(--text)] mt-2 mb-1">폭락 대응 교본</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        ETH 2026.10.24-25 폭락 분석 기록을 짧게 정리했습니다. 목적은 <b className="text-[var(--text)]">폭락을 맞히는 게 아니라 폭락 중에 롱을 새로 잡지 않는 것</b>.
        아래 측정 결과처럼 경보는 자주 틀리므로 숏 신호로 쓰지 않습니다.
      </p>

      {/* 한 줄 결론 */}
      <div className="fin-card p-4 mb-4">
        <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1">한 줄 요약</p>
        <p className="text-[13px] text-[var(--text)] leading-relaxed">
          체크리스트 4개↑이면 60분 안 −3% 확률이 평소의 <b>2~2.7배</b>(ETH·SOL·XRP)지만 절대 확률 <b>3~4%</b>·오경보 <b>96%</b> —
          <b> 신규 롱 보류·손절 확인용, 숏 신호 아님</b>.
        </p>
      </div>

      {/* 3단계 */}
      {STAGES.map((s) => (
        <section key={s.n} className="fin-card p-4 mb-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-[var(--text)]">{s.n} {s.title}</h2>
            <span className="fin-chip warn shrink-0">{s.tag}</span>
          </div>
          <p className="text-[12.5px] font-semibold mt-1" style={{ color: 'var(--accent-ink)' }}>→ {s.goal}</p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--text-muted)] leading-relaxed list-disc pl-4 [&_b]:text-[var(--text)]">
            {s.items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </section>
      ))}

      {/* 30초 체크리스트 */}
      <Lesson id="checklist" n="✓" title="30초 체크리스트">
        <ol className="list-decimal pl-4 space-y-0.5">
          {CHECK.map((c) => <li key={c}>{c}</li>)}
        </ol>
        <KvTable
          head={['해당 개수', '행동']}
          rows={[
            ['0~1개', '경고 신호 적음 — 폭락 위험이 없다는 뜻은 아님. 돌발 뉴스와 다른 시간봉도 확인'],
            ['2~3개', '주의 구간 — 하락 지속 가능성을 확인하고 신규 롱 진입을 서두르지 않기'],
            ['4~5개', <><b>강한 하락 경고</b> — 신규 롱을 피하고 기존 포지션의 손절·노출 규모 점검(숏 추격 아님)</>],
          ]}
        />
        <Tip title="실시간">코인선물 분석 화면의 급변 계기판에 이 체크리스트가 지금 몇 개인지 표시됩니다.</Tip>
      </Lesson>

      {/* 10-24 사례 */}
      <Lesson id="case" n="📌" title="10-24 사례로 보면">
        <p><b>23:15 1차 급락</b> 전에는 경보가 없었습니다(극단 압축 뒤 갑자기 터짐 — 첫 다리는 못 잡음).</p>
        <p><b>23:30 체크리스트 4/5</b> → <b>30분 뒤 2차 급락</b>. 1차 급락 직후 &lsquo;싸 보여서&rsquo; 롱을 잡았다면 2차에 맞았을 자리 — 교본의 쓰임새는 바로 여기입니다.</p>
        <Trap>경보가 꺼졌다고 안전한 게 아닙니다. 폭락의 대부분(88~94%)은 15분 전 경보 없이 왔습니다(체크리스트 4개↑ 포착률 6~12%).</Trap>
      </Lesson>

      {/* 측정 결과 */}
      <section id="measured" className="fin-card p-4 mb-4 scroll-mt-20">
        <h2 className="text-[15px] font-bold text-[var(--text)]">측정 결과</h2>
        <p className="text-[11.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
          바이낸스 5분봉 {Math.round(W.days / 365)}년 · 폭락 = 60분 안 −3% · 적중 = 경보 15~75분 뒤 −3% 도달 · 평소 = 아무 5분 시점의 같은 확률.
          유의 = 경보 30회↑·|z|≥2.58·앞/뒤 절반 모두 평소보다 높음(결과 보기 전 고정).
        </p>

        <p className="text-[12px] font-bold text-[var(--text)] mt-3 mb-1">평소 대비 배수 <span className="font-normal text-[var(--text-muted)]">(굵게 = 유의)</span></p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] mx-1 tabular-nums">
            <thead><tr className="text-[var(--text-muted)]">
              <th className="text-left font-semibold py-1 pr-2">신호</th>
              {COINS.map((c) => <th key={c} className="text-right font-semibold py-1 pl-1">{coinName(c)}</th>)}
            </tr></thead>
            <tbody>
              {SIGS.map((s) => (
                <tr key={s.key} className="border-t border-[var(--line-2)]">
                  <td className="py-1.5 pr-2 text-[var(--text)]">{s.label}</td>
                  {COINS.map((c) => {
                    const x = card(c, s.key);
                    const sig = x?.verdict === 'significant';
                    return (
                      <td key={c} className="py-1.5 pl-1 text-right whitespace-nowrap"
                        style={{ color: sig ? 'var(--warn)' : 'var(--text-muted)', fontWeight: sig ? 800 : 400 }}>
                        {x ? `${x.lift.toFixed(1)}×` : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-[var(--faint)] mt-1.5 leading-relaxed">BTC는 2년간 폭락 자체가 {card('BTCUSDT', 'check4')?.crashes ?? '–'}번뿐이라 배수가 커 보여도 적중이 1~4건 — 전부 표본 부족·우연 범위입니다.</p>

        <div className="mt-3 space-y-2">
          {COINS.map((c) => (
            <details key={c} className="rounded-xl border border-[var(--border)] group">
              <summary className="px-3 py-2 cursor-pointer select-none text-[12.5px] font-bold text-[var(--text)] flex items-center justify-between">
                <span>{coinName(c)} 자세히</span>
                <span aria-hidden className="text-[var(--faint)] group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <ul className="px-3 pb-3 space-y-2">
                {SIGS.map((s) => {
                  const x = card(c, s.key);
                  if (!x) return null;
                  const v = VERDICT[x.verdict] ?? VERDICT.noise;
                  return (
                    <li key={s.key} className="text-[12px] border-t border-[var(--line-2)] pt-2 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-[var(--text)] min-w-0">{s.label}</b>
                        <span className={`fin-chip ${v.chip} shrink-0`}>{v.t}</span>
                      </div>
                      <div className="text-[var(--text-muted)] tabular-nums mt-0.5 leading-relaxed">
                        적중 {f1(x.precision)} · 평소 {f1(x.base)} ({x.lift.toFixed(1)}배) · 포착 {f1(x.recall)} · 오경보 {share(x.falseAlarms, x.warnings)}
                        <span className="text-[var(--faint)]"> · 경보 {x.warnings}회</span>
                      </div>
                      <div className="text-[11px] text-[var(--faint)] mt-0.5">{s.desc}</div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>

        <p className="text-[12px] font-bold text-[var(--text)] mt-4 mb-1">하락 충격봉 뒤 2시간 — 더 빠졌나, 되돌렸나</p>
        <p className="text-[11px] text-[var(--text-muted)] mb-1 leading-relaxed">충격봉 = 15분 거래량 8배·변동폭 3배·저가 쪽 마감. 추가 하락/되돌림 = 그 봉 변동폭만큼 더 감/되돌림({Math.round(P.days.shock / 365)}년).</p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] mx-1">
            <thead><tr className="text-[var(--text-muted)]">
              <th className="text-left font-semibold py-1 pr-2">코인</th>
              <th className="text-right font-semibold py-1 pr-2">건</th>
              <th className="text-right font-semibold py-1 pr-2">추가 하락</th>
              <th className="text-right font-semibold py-1 pr-2">되돌림</th>
              <th className="text-right font-semibold py-1">판정</th>
            </tr></thead>
            <tbody>
              <ShockRow label="4코인 합" s={P.pooledShockDown} />
              {COINS.map((c) => P.coins[c] && <ShockRow key={c} label={coinName(c)} s={P.coins[c].shockDown} />)}
            </tbody>
          </table>
        </div>
        <p className="text-[11.5px] text-[var(--text-muted)] mt-2 leading-relaxed">
          4코인 합으로는 첫 급락 뒤 <b className="text-[var(--text)]">추가 하락이 되돌림보다 잦았습니다</b> — 떨어지는 칼날 매수·손절 없는 버티기 주의. 코인 하나씩은 표본이 작아 대부분 우연 범위.
        </p>
        <p className="text-[10.5px] text-[var(--faint)] mt-2">측정 {W.generatedAt.slice(0, 10)} · 과거 빈도이며 예측·매매 신호가 아닙니다.</p>
      </section>

      <div className="flex flex-wrap gap-1.5 mb-5">
        <Link href="/coin-analysis" className="fin-more">실시간 체크리스트 — 코인선물 분석 →</Link>
        <Link href="/paper" className="fin-more">모의 선행테스트 →</Link>
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4">
        사용자 문서의 가설적 규칙을 측정과 함께 정리한 학습 자료입니다. 기계적 매매 규칙이 아니며, 어떤 경보도 방향을 보장하지 않습니다. 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
