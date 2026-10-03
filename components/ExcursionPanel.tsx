'use client';

/**
 * 매매별 MAE/MFE — 진입 후 보유 구간에서 가장 불리하게(최대 역행)·가장 유리하게(최대 순행) 간 폭과,
 * 최대 순행 중 실제로 챙긴 비율(참고: Edgewonk·TraderSync). 매매일지 편집 시트 안에서 거래소 청산 매매만.
 * 계산은 lib/tradeAutopsy(tradeExcursion·analyzeTrade, 테스트 고정). 캔들은 공개 /api/candles(Bitget, 키 불필요).
 * 손절가(거래소 SL 주문에서 복구)가 있을 때만 R 환산 + 손절 폭·진입 위치 진단 — 없으면 % · USDT 만(추측 금지).
 */
import { useEffect, useState } from 'react';
import { analyzeTrade, type Excursion, type Finding } from '@/lib/tradeAutopsy';
import { loadExcursion, fetchTradeCandles, type ExcursionTrade } from '@/lib/excursionFetch';

export type { ExcursionTrade };
interface Result { ex: Excursion; findings: Finding[]; g: string }

// 같은 매매를 다시 열면 재계산하지 않는다(과거 캔들은 바뀌지 않음). 결과 자체는 excursionFetch 가 기기에 저장
const cache = new Map<string, Result | 'empty'>();

const UP = 'var(--warn)';
const DOWN = 'var(--accent-ink)';
const BAR_NAME: Record<string, string> = { '1m': '1분봉', '5m': '5분봉', '15m': '15분봉', '30m': '30분봉', '1H': '1시간봉', '4H': '4시간봉', '12H': '12시간봉', '1D': '일봉' };
/** 부호 붙인 % — 음수는 하이픈이 아니라 마이너스 기호(−) */
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
const sevColor = (s: Finding['severity']) => (s === 'bad' ? 'var(--warn)' : s === 'warn' ? 'var(--amber)' : 'var(--ok)');
const sevIcon = (s: Finding['severity']) => (s === 'bad' ? '✗' : s === 'warn' ? '△' : '✓');

/** MAE/MFE 해석 — 손절가 없이도 되는 것(%)만. R 이 있으면 손절 근처까지 갔는지도 */
function excursionFindings(e: Excursion): Finding[] {
  const f: Finding[] = [];
  if (e.capturePct != null && e.capturePct < 0 && e.mfePct > 0)
    f.push({ key: 'gave-back', severity: 'bad', title: `최대 +${e.mfePct}%까지 유리하게 갔다가 손실로 청산 — 이익을 되돌려줌`, fix: '일정 이상 순행하면 손절을 본전으로 올리거나 일부 익절하는 규칙을 정해 두세요.' });
  else if (e.capturePct != null && e.capturePct < 40 && e.mfePct >= 0.5)
    f.push({ key: 'low-capture', severity: 'warn', title: `최대 순행의 ${e.capturePct}%만 챙김 — 익절이 이르거나 되돌림을 많이 맞음` });
  else if (e.capturePct != null && e.capturePct >= 70)
    f.push({ key: 'good-capture', severity: 'good', title: `최대 순행의 ${e.capturePct}%를 챙김 — 청산 위치 양호` });
  if (e.maeR != null && e.maeR >= 1)
    // 손절가를 넘어 역행했는데 손절로 끝나지 않았다 = 손절을 옮겼거나(기록된 손절가가 최종이 아님), 봉 단위 근사로 과대
    f.push({ key: 'mae-over', severity: 'warn', title: `보유 중 기록된 손절가를 넘어 −${e.maeR}R까지 역행 — 그 손절이 그대로였다면 걸렸을 자리`, fix: '손절을 뒤로 옮긴 매매라면 다음엔 처음 정한 손절을 지키는지 기록해 보세요(봉 단위 근사로 실제보다 크게 잡혔을 수도 있음).' });
  else if (e.maeR != null && e.maeR >= 0.9)
    f.push({ key: 'mae-high', severity: 'warn', title: `보유 중 손절 거리의 ${Math.round(e.maeR * 100)}%까지 역행 — 손절 직전까지 몰렸음` });
  return f;
}

export default function ExcursionPanel({ t }: { t: ExcursionTrade }) {
  const [state, setState] = useState<{ loading: boolean; res?: Result | 'empty'; err?: string }>(() => {
    const c = cache.get(t.positionId);
    return c ? { loading: false, res: c } : { loading: true };
  });

  useEffect(() => {
    if (cache.has(t.positionId)) return;
    let alive = true;
    (async () => {
      // MAE/MFE: 요약 카드가 이미 계산해 기기에 저장했으면 그대로(캔들 요청 없음)
      const ex = await loadExcursion(t);
      let res: Result | 'empty' = 'empty';
      let failed = false;
      if (ex) {
        // 손절가가 있을 때만 손절 폭(ATR)·진입 위치 진단 — 이건 캔들이 필요(메모리 캐시 공용). MAE/MFE 판정은 excursion 하나로
        let structure: Finding[] = [];
        if (t.stop) {
          const { candles, error } = await fetchTradeCandles(t);
          failed = !!error;
          structure = analyzeTrade({ entry: t.openAvg, stop: t.stop, direction: t.side, entryTs: t.openTs, exitTs: t.closeTs }, candles)
            .findings.filter((x) => ['stop-tight', 'stop-wide', 'stop-ok', 'chase', 'dip'].includes(x.key));
        }
        res = { ex, findings: [...excursionFindings(ex), ...structure], g: ex.g };
        if (!failed) cache.set(t.positionId, res);
      }
      if (alive) setState({ loading: false, res, err: !ex ? '캔들을 불러오지 못했거나 보유 구간 캔들이 없습니다' : undefined });
    })()
      .catch(() => { if (alive) setState({ loading: false, err: '캔들을 불러오지 못했습니다' }); });
    return () => { alive = false; };
    // 같은 매매면 다시 요청하지 않는다 — 부모가 다시 그릴 때마다 새 객체가 와도 positionId 로만 판단
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.positionId]);

  return (
    <div>
      <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">진입 후 움직임 <span className="font-normal">· MAE(최대 역행)·MFE(최대 순행)</span></p>
      {state.loading ? (
        <div className="skeleton h-24 rounded-xl" aria-label="캔들 불러오는 중" />
      ) : state.err || !state.res || state.res === 'empty' ? (
        <p className="text-[12px] text-[var(--text-muted)] rounded-xl bg-[var(--surface-2)] px-3 py-2.5">{state.err ?? '보유 구간 캔들이 없어 계산할 수 없습니다.'}</p>
      ) : (
        <Body r={state.res} hasStop={!!t.stop} />
      )}
    </div>
  );
}

function Body({ r, hasStop }: { r: Result; hasStop: boolean }) {
  const { ex } = r;
  const span = Math.max(ex.maePct + ex.mfePct, 1e-9);
  const zero = (ex.maePct / span) * 100;                          // 진입가 위치
  const exitPos = Math.max(0, Math.min(100, ((ex.exitPct + ex.maePct) / span) * 100)); // 청산 위치
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      {/* 역행 ← 진입 → 순행, 청산 지점 표시 */}
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }} aria-hidden>
        <div className="absolute inset-y-0 left-0" style={{ width: `${zero}%`, background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }} />
        <div className="absolute inset-y-0" style={{ left: `${zero}%`, right: 0, background: 'color-mix(in srgb, var(--warn) 55%, transparent)' }} />
        <div className="absolute inset-y-0 w-px" style={{ left: `${zero}%`, background: 'var(--ink)' }} />
      </div>
      <div className="relative h-4" aria-hidden>
        <span className="absolute -translate-x-1/2 text-[9.5px] font-bold text-[var(--ink)] whitespace-nowrap" style={{ left: `${exitPos}%`, top: 1 }}>▲ 청산</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-1 text-[12px] tabular-nums">
        <div>
          <p className="text-[10.5px] text-[var(--text-muted)]">최대 역행 (MAE)</p>
          <p className="font-extrabold" style={{ color: DOWN }}>−{ex.maePct}%{ex.maeR != null && <span className="text-[11px] font-bold"> · −{ex.maeR}R</span>}</p>
          <p className="text-[10px] text-[var(--faint)]">−{ex.maeUsdt} USDT</p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] text-[var(--text-muted)]">최대 순행 (MFE)</p>
          <p className="font-extrabold" style={{ color: UP }}>+{ex.mfePct}%{ex.mfeR != null && <span className="text-[11px] font-bold"> · +{ex.mfeR}R</span>}</p>
          <p className="text-[10px] text-[var(--faint)]">+{ex.mfeUsdt} USDT</p>
        </div>
      </div>
      <p className="text-[11.5px] text-[var(--text-muted)] mt-1.5 tabular-nums">
        청산 <b style={{ color: ex.exitPct > 0 ? UP : ex.exitPct < 0 ? DOWN : 'var(--text)' }}>{pct(ex.exitPct)}</b> ·{' '}
        {ex.capturePct == null ? '유리하게 간 적 없음'
          : ex.capturePct >= 0 ? <>최대 순행 중 <b className="text-[var(--text)]">{ex.capturePct}%</b> 챙김</>
          : <>최대 +{ex.mfePct}%까지 갔지만 <b style={{ color: DOWN }}>손실로 청산</b></>}
      </p>
      {r.findings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {r.findings.map((f) => (
            <li key={f.key} className="text-[11.5px] leading-snug">
              <span style={{ color: sevColor(f.severity) }} className="font-bold mr-1">{sevIcon(f.severity)}</span>
              <span className="text-[var(--text)]">{f.title}</span>
              {f.fix && <span className="block text-[10.5px] text-[var(--text-muted)] ml-4">{f.fix}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-[var(--faint)] mt-2 leading-relaxed">
        {BAR_NAME[r.g] ?? r.g} {ex.bars}개 기준(가격 차이 × 수량, 수수료 전){ex.rough ? ' · 보유가 봉 3개보다 짧아 진입·청산 봉 전체 범위가 섞인 근사 — 실제보다 크게 나올 수 있음' : ''}.
        {!hasStop && ' 손절가 기록이 없어 R 환산·손절 폭 진단은 생략.'}
      </p>
    </div>
  );
}
