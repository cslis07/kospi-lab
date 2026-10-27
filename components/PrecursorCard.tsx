'use client';

/**
 * 급변 확률 계기판 — 지금 상태(사전 등록 신호)에 해당했던 과거 구간에서 다음 4시간 급락·급등이 실제로 몇 %였나.
 * 측정값 = /data/precursor-stats.json(scripts/precursor-stats.ts, 바이낸스 15분봉 1~2년), 지금 상태 = /api/precursor.
 * 출발점: 2026-10-24 23:15 4코인 동시 급락 해부(lib/crashPrecursor 머리말). 예측·매매 신호가 아니라 과거 빈도다.
 */
import useSWR from 'swr';
import type { LiveState, StatsFile, ShockStat } from '@/lib/crashPrecursor';
import { SIGNALS } from '@/lib/crashPrecursor';
import type { Flags, WarningStatsFile, Scorecard } from '@/lib/crashWarning';
import type { AlertLogSummary } from '@/lib/alertLog';

const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '–' : `${v.toFixed(d)}%`);
const VERDICT: Record<string, string> = { significant: '측정상 유의', noise: '우연 범위', thin: '표본 부족', continue: '추가 하락 쪽 유의', revert: '되돌림 쪽 유의' };
const kst = (ts: number) => { const d = new Date(ts + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/** 켜진 신호 중 가장 구체적인 것(SIGNALS 순서상 뒤쪽이 더 구체적) */
const PRIORITY = ['compDownLow', 'compDown', 'compUp', 'comp', 'oiBuild'];

function ShockLine({ s, label }: { s: ShockStat; label: string }) {
  const m = s.n || 1;
  return <span>{label} {s.n}건 · 추가 {pct((s.cont / m) * 100)} vs 되돌림 {pct((s.rev / m) * 100)} <span className="text-[var(--text-muted)]">({VERDICT[s.verdict]})</span></span>;
}

/** 폭락 조기 경보 — 사용자 문서(10.24-25 폭락 분석)의 30초 체크리스트를 실시간 판정 + 과거 2년 성적표(lib/crashWarning) */
function EarlyWarning({ f, cards, btc, days }: { f: Flags; cards: Scorecard[]; btc: boolean; days: number }) {
  const card = (k: string) => cards.find((c) => c.key === k);
  const items: [string, boolean][] = [
    ['1H 반등 고점이 낮아짐', f.lowerHighs1h],
    ['15분봉이 직전 6h 지지 아래 마감', f.break15],
    ['이탈 때 5분 거래량 3배↑', f.vol5 && f.break15],
    ['반등 후 지지 되찾기 실패 + 새 저점', f.failReclaim],
    ...(btc ? [] : [['BTC도 15분 지지 이탈(30분 안)', f.btcBreak === true] as [string, boolean]]),
  ];
  const max = items.length, score = f.checklist;
  const active = [score >= 4 ? 'check4' : null, f.core ? 'core' : null, f.failReclaim ? 'failReclaim' : null, f.h1VolBreak ? 'h1VolBreak' : null, f.btcBreak ? 'btcBreak' : null].filter((x): x is string => !!x)
    .map((k) => card(k)).filter((c): c is Scorecard => !!c);
  const c4 = card('check4');
  const hot = active.some((c) => c.verdict === 'significant');
  const line = (c: Scorecard) => `과거 ${days}일 ${c.warnings}번 울림 · 60분 안 −3% ${pct(c.precision, 1)} (평소 ${pct(c.base, 1)}, ${c.lift.toFixed(1)}배) · 오경보 ${pct((c.falseAlarms / Math.max(1, c.warnings)) * 100)} · 폭락의 ${pct(c.recall)} 사전 포착 · 선행 약 ${c.leadMedMin ?? '–'}분 · ${VERDICT[c.verdict]}`;
  const LABEL: Record<string, string> = { check4: '체크리스트 4개 이상', core: '상위 약세 + 지지 이탈 + 거래량', failReclaim: '반등 실패 + 새 저점', h1VolBreak: '1H 거래량 4배 + EMA20 아래', btcBreak: 'BTC 15분 지지 이탈' };
  return (
    <div className={`rounded-xl border px-3 py-2 mb-2 ${hot ? 'border-[var(--warn)] bg-[var(--warn-soft)]' : 'border-[var(--border)]'}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <b className="text-[12.5px] text-[var(--text)]">{hot ? '🚨 ' : ''}폭락 조기 경보 — 30초 체크리스트 {score}/{max}</b>
        <span className="text-[10.5px] text-[var(--text-muted)]">폭락 = 60분 안 −3% · 15분 이상 앞선 경보만 인정</span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 mt-1 text-[11.5px]">
        {items.map(([k, v]) => <li key={k} className={v ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}>{v ? '☑' : '☐'} {k}</li>)}
      </ul>
      {f.mtf && <p className="text-[11px] text-[var(--text-muted)] mt-1">일봉·4H·1H 모두 EMA20 아래 — 롱에 불리한 장세(단, 이것만으로는 폭락 확률이 오르지 않았음: 측정상 우연).</p>}
      {active.map((c) => (
        <p key={c.key} className="text-[11.5px] text-[var(--text)] mt-1 leading-relaxed"><b>{LABEL[c.key]}</b> — {line(c)}</p>
      ))}
      {!active.length && c4 && <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">4개 이상이면: {line(c4)}</p>}
      <p className="text-[10.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
        행동: 신규 롱 보류·손절 확인용(숏 추격 신호 아님). 첫 급락은 사전 신호 없이 오는 경우가 많고(10-24 23:15도 그랬음), 이 경보는 첫 충격 뒤 추가 하락을 앞서 잡는 데 강했습니다 — 10-24엔 23:30에 4/5로 울렸고 30분 뒤 2차 급락.
      </p>
    </div>
  );
}

/** 실전 성적 — 가드가 실제로 보낸 경보의 이후 결과(lib/alertLog) vs 과거 측정값. 계좌 게이트 뒤라 잠겨 있으면 안 보임 */
function LiveRecord({ pooled }: { pooled: ShockStat }) {
  const { data } = useSWR<{ ok: boolean; summary: AlertLogSummary | null }>('/api/bitget/alert-log', fetcher, { revalidateOnFocus: false });
  const s = data?.summary;
  if (!s || (s.warn.n + s.warn.pending + s.shock.n + s.shock.pending) === 0) return null;
  const m = pooled.n || 1;
  return (
    <div className="rounded-xl border border-[var(--border)] px-3 py-2 mb-2 text-[11.5px] leading-relaxed tabular-nums">
      <p className="font-semibold text-[var(--text)]">내 알림 실전 성적 <span className="font-normal text-[var(--text-muted)]">가드가 보낸 경보 · 4코인 합산</span></p>
      <p className="text-[var(--text-muted)]">
        🚨 폭락 조기 경보 {s.warn.n}번 판정 · 15~75분 안 −3% <b className="text-[var(--text)]">{s.warn.hit}번{s.warn.ratePct != null ? ` (${s.warn.ratePct.toFixed(0)}%)` : ''}</b> — 과거 측정 3~8%
        {s.warn.pending ? ` · 대기 ${s.warn.pending}` : ''}
      </p>
      <p className="text-[var(--text-muted)]">
        ⚡ 하락 충격봉 {s.shock.n}번 판정 · 2시간 안 추가 하락 <b className="text-[var(--text)]">{s.shock.cont}</b> vs 반등 <b className="text-[var(--text)]">{s.shock.rev}</b>
        {' '}— 과거 {Math.round((pooled.cont / m) * 100)}% vs {Math.round((pooled.rev / m) * 100)}%{s.shock.pending ? ` · 대기 ${s.shock.pending}` : ''}
      </p>
      {(s.warn.n + s.shock.n) < 30 && <p className="text-[10.5px] text-[var(--text-muted)]">표본 {s.warn.n + s.shock.n}건 — 30건 전엔 측정값과 비교하지 마세요.</p>}
    </div>
  );
}

export default function PrecursorCard({ symbol }: { symbol: string }) {
  const supported = /^(BTC|ETH|SOL|XRP)USDT$/.test(symbol);
  const { data: live } = useSWR<{ state: LiveState; oiChg6h: number | null; asOf: number; warn: Flags | null }>(supported ? `/api/precursor?symbol=${symbol}` : null, fetcher, { refreshInterval: 60_000 });
  const { data: stats } = useSWR<StatsFile>(supported ? '/data/precursor-stats.json' : null, fetcher, { revalidateOnFocus: false });
  const { data: wstats } = useSWR<WarningStatsFile>(supported ? '/data/crash-warning-stats.json' : null, fetcher, { revalidateOnFocus: false });
  if (!supported || !live?.state || !stats?.coins?.[symbol]) return null;
  const st = live.state, cs = stats.coins[symbol];
  const active = PRIORITY.find((k) => st.signals.includes(k));
  const sig = active ? cs.signals[active] : null;
  const base = cs.signals.comp;
  const label = active ? SIGNALS.find((s) => s.key === active)?.label : null;
  const shockFresh = st.shock && live.asOf - st.shock.ts < 2 * 3_600_000 ? st.shock : null;   // 서버 응답 시각 기준(렌더 중 Date.now 금지)

  return (
    <section className="fin-card p-4 mt-3">
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <h3 className="text-sm font-bold text-[var(--text)]">급변 확률 계기판</h3>
        <span className="text-[10.5px] text-[var(--text-muted)]">다음 4시간 · 과거 {stats.days.signals}일 측정 · 매매 신호 아님</span>
      </div>

      {shockFresh && (
        <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 mb-2 text-[12px] leading-relaxed">
          <b className="text-[var(--text)]">⚡ {shockFresh.dir === 'down' ? '하락' : '상승'} 충격봉 {kst(shockFresh.ts)}</b>
          <span className="text-[var(--text-muted)]"> · 거래량 {shockFresh.volX.toFixed(0)}배 · 봉 변동 {shockFresh.rangePct.toFixed(2)}%</span>
          <div className="text-[11.5px] text-[var(--text)] mt-0.5">
            {shockFresh.dir === 'down'
              ? <>과거 2시간 안: <ShockLine s={stats.pooledShockDown} label="4코인" /> · <ShockLine s={cs.shockDown} label="이 코인" /><br /><b>떨어지는 칼날 매수·손절 없는 버티기 주의</b> — 측정상 반등보다 추가 하락이 잦았습니다.</>
              : <>과거 2시간 안: <ShockLine s={stats.pooledShockUp} label="4코인" /> — 상승 충격엔 방향 비대칭이 측정되지 않았습니다.</>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-2 text-[11px]">
        <span className="fin-chip">6h 변동 {pct(st.rng6h, 2)} · 30일 하위 {st.comp == null ? '–' : `${Math.round(st.comp * 100)}%`}{st.comp != null && st.comp <= 0.15 ? ' (압축)' : ''}</span>
        <span className="fin-chip">기울기 {st.down ? '하락(고점↓)' : st.up ? '상승(저점↑)' : '뚜렷하지 않음'}</span>
        {st.nearLow && <span className="fin-chip">24h 저점 2 ATR 안</span>}
        <span className="fin-chip">OI 6h {live.oiChg6h == null ? '–' : `${live.oiChg6h >= 0 ? '+' : ''}${live.oiChg6h.toFixed(2)}%`}{st.oiBuild ? ' · 박스권 축적' : ''}</span>
      </div>

      {live.warn && wstats?.coins?.[symbol] && <EarlyWarning f={live.warn} cards={wstats.coins[symbol]} btc={symbol === 'BTCUSDT'} days={wstats.days} />}

      <LiveRecord pooled={stats.pooledShockDown} />

      <div className="rounded-xl border border-[var(--border)] overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 300 }}>
          <thead><tr className="text-[10.5px] text-[var(--text-muted)] text-right">
            <th className="text-left font-semibold px-3 py-1.5">상태</th><th className="font-semibold px-2">급락</th><th className="font-semibold px-3">급등</th>
          </tr></thead>
          <tbody>
            {sig && (
              <tr className="border-t border-[var(--border)] text-right" style={{ background: 'var(--warn-soft)' }}>
                <td className="text-left px-3 py-1.5 text-[var(--text)]">지금: {label}<span className="block text-[10px] text-[var(--text-muted)]">과거 {sig.n}번</span></td>
                <td className="px-2"><b className="text-[var(--text)]">{pct(sig.dnRate)}</b><span className="block text-[10px] text-[var(--text-muted)]">{VERDICT[sig.verdictDn]}</span></td>
                <td className="px-3"><b className="text-[var(--text)]">{pct(sig.upRate)}</b><span className="block text-[10px] text-[var(--text-muted)]">{VERDICT[sig.verdictUp]}</span></td>
              </tr>
            )}
            <tr className="border-t border-[var(--border)] text-right">
              <td className="text-left px-3 py-1.5 text-[var(--text-muted)]">평소(모든 시간)</td>
              <td className="px-2 text-[var(--text-muted)]">{pct(base?.baseDn)}</td>
              <td className="px-3 text-[var(--text-muted)]">{pct(base?.baseUp)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
        급락·급등 = 다음 4시간 안 움직임이 이 코인 최근 30일 기준 상위 20% 크기. {active ? '' : '지금은 등록된 신호에 해당하지 않아 평소 확률이 기준입니다. '}
        측정 결과: 조용한 압축 구간 뒤엔 급변이 <b>덜</b> 왔고(평소의 약 절반) 압축 계열 전조는 기각됐습니다. 살아남은 것은 &lsquo;하락 충격봉 뒤 추가 하락이 반등보다 잦다&rsquo;와
        위 폭락 조기 경보 일부(평소의 2~4배 · 그래도 절대 확률 3~8%, 오경보 90%↑)입니다. 판정 기준 n≥30·|z|≥2.58·기간 앞뒤 절반 같은 방향 · 측정 {new Date(Date.parse(stats.generatedAt) + 9 * 3600e3).toISOString().slice(0, 10)}.
      </p>
    </section>
  );
}
