'use client';

/**
 * 급변 확률 계기판 — 지금 상태(사전 등록 신호)에 해당했던 과거 구간에서 다음 4시간 급락·급등이 실제로 몇 %였나.
 * 측정값 = /data/precursor-stats.json(scripts/precursor-stats.ts, 바이낸스 15분봉 1~2년), 지금 상태 = /api/precursor.
 * 출발점: 2026-10-24 23:15 4코인 동시 급락 해부(lib/crashPrecursor 머리말). 예측·매매 신호가 아니라 과거 빈도다.
 */
import useSWR from 'swr';
import type { LiveState, StatsFile, ShockStat } from '@/lib/crashPrecursor';
import { SIGNALS } from '@/lib/crashPrecursor';

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

export default function PrecursorCard({ symbol }: { symbol: string }) {
  const supported = /^(BTC|ETH|SOL|XRP)USDT$/.test(symbol);
  const { data: live } = useSWR<{ state: LiveState; oiChg6h: number | null; asOf: number }>(supported ? `/api/precursor?symbol=${symbol}` : null, fetcher, { refreshInterval: 60_000 });
  const { data: stats } = useSWR<StatsFile>(supported ? '/data/precursor-stats.json' : null, fetcher, { revalidateOnFocus: false });
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
        측정 결과: 조용한 압축 구간 뒤엔 급변이 <b>덜</b> 왔고(평소의 약 절반), 폭락을 미리 맞히는 전조는 측정에서 살아남지 못했습니다(2026-10-24 급락 해부).
        살아남은 건 &lsquo;하락 충격봉 뒤 추가 하락이 반등보다 잦다&rsquo;뿐입니다. 판정 기준 n≥30·|z|≥2.58·기간 앞뒤 절반 같은 방향 · 측정 {new Date(Date.parse(stats.generatedAt) + 9 * 3600e3).toISOString().slice(0, 10)}.
      </p>
    </section>
  );
}
