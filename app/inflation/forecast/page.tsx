'use client';

/**
 * CPI·PPI 예상치 비교 — 시장 예상치 vs 우리 예상치(수치 모델 + AI 기사 보정).
 * 수치 모델은 열 때마다 무료로 계산, 기사 보정은 버튼을 누를 때만(유료 AI 1회) 계산해 저장한다. 매매 신호 아님.
 */
import { useState } from 'react';
import useSWR from 'swr';
import UnlockGate from '@/components/UnlockGate';
import type { ForecastPayload, ForecastItem, ScoreRow } from '@/lib/priceForecastData';
import { AI_ADJ_MAX, type TargetKey } from '@/lib/priceForecast';

type Resp = ForecastPayload & { locked?: boolean; error?: string };
const fetcher = (url: string) => fetch(url).then((r) => r.json());

const n1 = (x?: number | null) => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(1)}%`);
const n2 = (x?: number | null) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));
const sg = (x: number, d = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
const tone = (x: number) => (x > 0.0049 ? 'text-red-400' : x < -0.0049 ? 'text-blue-400' : 'text-[var(--text-muted)]');
const ymKo = (ym?: string | null) => (ym ? `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월` : '—');
const SHORT: Record<TargetKey, string> = { cpi: 'CPI', coreCpi: '근원 CPI', ppi: 'PPI', corePpi: '근원 PPI' };
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function kstWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const k = new Date(t + 9 * 3_600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WD[k.getUTCDay()]}) ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}
const kstStamp = (ms: number) => { const k = new Date(ms + 9 * 3_600_000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`; };

export default function ForecastPage() {
  const { data, mutate } = useSWR<Resp>('/api/price-forecast', fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/price-forecast/run', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.payload) setErr(j.error ?? `실행 실패 (${r.status})`);
      else {
        await mutate(j.payload, { revalidate: false });
        if (j.saved === false) setErr('분석은 끝났지만 저장에 실패했습니다. 새로고침하면 사라집니다.');
      }
    } catch { setErr('실행 실패 (네트워크)'); }
    setBusy(false);
  };

  const items = data?.items ?? [];
  const groups = (['ppi', 'cpi'] as const)
    .map((g) => items.filter((t) => t.group === g))
    .filter((g) => g.length)
    .sort((a, b) => (a[0].month < b[0].month ? -1 : a[0].month > b[0].month ? 1 : 0));   // 발표가 먼저인 쪽을 위로
  const last = data?.lastRun;

  return (
    <>
      <h1 className="text-xl font-extrabold text-[var(--text)] mb-1">CPI·PPI 예상치 비교</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">
        다음 발표의 <b className="text-[var(--text)]">시장 예상치</b>와 <b className="text-[var(--text)]">우리가 직접 계산한 예상치</b>를 나란히 봅니다.
        우리 예상치는 휘발유·경유·유가·천연가스·달러·임금 같은 지표로 만든 수치 모델에, AI가 관련 기사를 읽고 더한 작은 보정(±{AI_ADJ_MAX}%p 이내)을 합친 값입니다.
        <b className="text-[var(--text)]"> 매매 신호가 아닙니다.</b>
      </p>

      {data?.locked && <div className="mb-4"><UnlockGate reason="이 페이지는 접근 권한이 필요한 분석 페이지입니다." /></div>}
      {!data && <p className="text-[12px] text-[var(--text-muted)] text-center py-8 border border-dashed border-[var(--border)] rounded-xl">계산하는 중…</p>}
      {data && !data.locked && data.error && <p className="text-[12px] text-[var(--warn)] mb-3">불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>}
      {data && !data.locked && !data.error && data.configured === false && <p className="text-[12px] text-[var(--warn)] mb-3">FRED 키가 설정되지 않아 수치 모델을 계산할 수 없습니다.</p>}

      {groups.map((g) => <GroupCard key={g[0].group} items={g} refs={g[0].group === 'cpi' ? data?.refs ?? null : null} />)}

      {data && !data.locked && items.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <h2 className="text-sm font-semibold text-[var(--text)]">기사 반영 (AI 보정)</h2>
            <button type="button" onClick={run} disabled={busy}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] disabled:opacity-50">
              {busy ? '기사 읽는 중… (최대 1분)' : last ? '다시 분석 (유료 AI 1회)' : '기사 분석 실행 (유료 AI 1회)'}
            </button>
          </div>
          {err && <p className="text-[12px] text-[var(--warn)] mb-2">{err}</p>}
          {!last && <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">아직 실행한 적이 없습니다. 버튼을 누르면 최근 7일 물가·연준 관련 기사 제목을 모아 AI가 읽고, 지표별 보정값과 이유를 남깁니다.</p>}
          {last && (
            <>
              <p className="text-[11px] text-[var(--text-muted)] mb-2 tabular-nums">마지막 실행 {kstStamp(last.ranAt)} · 기사 제목 {last.newsCount}건{last.aiModel ? ` · ${last.aiModel}` : ''}</p>
              {last.summary && <p className="text-[13px] text-[var(--text)] leading-relaxed mb-3">{last.summary}</p>}
              <ul className="space-y-1.5 mb-3">
                {items.filter((t) => t.ai).map((t) => (
                  <li key={t.key} className="text-[12px] leading-relaxed">
                    <b className="text-[var(--text)]">{SHORT[t.key]}</b>{' '}
                    <b className={`tabular-nums ${tone(t.ai!.adj)}`}>{sg(t.ai!.adj)}%p</b>
                    {t.ai!.reason && <span className="text-[var(--text-muted)]"> — {t.ai!.reason}</span>}
                  </li>
                ))}
              </ul>
              {last.articles.length > 0 && (
                <>
                  <h3 className="text-[12px] font-semibold text-[var(--text)] mb-1">근거로 본 기사</h3>
                  <ul className="divide-y divide-[var(--border)]/60">
                    {last.articles.map((a, i) => (
                      <li key={i} className="py-1.5 text-[12px] leading-snug">
                        <span className={`font-semibold ${a.effect === 'up' ? 'text-red-400' : a.effect === 'down' ? 'text-blue-400' : 'text-[var(--text-muted)]'}`}>
                          {a.effect === 'up' ? '▲ 상방' : a.effect === 'down' ? '▼ 하방' : '– 영향 없음'}
                        </span>{' '}
                        <span className="text-[var(--text)]">{a.title}</span>
                        {a.why && <span className="block text-[11px] text-[var(--text-muted)]">{a.why}</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      {items.length > 0 && <BacktestCard items={items} />}
      {data?.scores && data.scores.length > 0 && <ScoreCard rows={data.scores} />}

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-70 border-t border-[var(--border)] pt-4 mt-5">
        지표: FRED(미 세인트루이스 연준). 시장 예상치: <a href="https://nowflation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-ink)]">Nowflation</a> 경제 캘린더(CC BY 4.0, 중계) — 발표 약 3주 전부터 잡힙니다.
        전월비는 계절조정 기준, 전년비는 공식 헤드라인(비조정)에 맞춘 근사입니다. AI는 기사 본문이 아닌 제목만 읽습니다.
        물가 수치를 맞혀도 주가·코인 방향을 맞히는 우위는 이 앱의 측정에서 확인되지 않았습니다.
      </p>
    </>
  );
}

function GroupCard({ items, refs }: { items: ForecastItem[]; refs: ForecastPayload['refs'] }) {
  const head = items[0];
  const when = kstWhen(items.map((t) => t.consensus.releaseAt).find(Boolean));
  const hasAi = items.some((t) => t.ai);
  const rows = items.flatMap((t) => [
    { id: `${t.key}-m`, label: `${SHORT[t.key]} 전월비`, prev: t.prevMom, cons: t.consensus.mom?.estimate ?? null, actual: t.consensus.mom?.actual ?? null, model: t.mom, fin: t.ai?.final ?? null },
    { id: `${t.key}-y`, label: `${SHORT[t.key]} 전년비`, prev: t.prevYoy, cons: t.consensus.yoy?.estimate ?? null, actual: t.consensus.yoy?.actual ?? null, model: t.yoy, fin: t.ai && t.yoy != null ? t.yoy + t.ai.adj : null },
  ]);
  const anyActual = rows.some((r) => r.actual != null);
  const top = items[0];
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-[var(--text)]">미국 {head.group === 'cpi' ? 'CPI (소비자물가)' : 'PPI (생산자물가)'} · {ymKo(head.month)}분</h2>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{when ? `발표 ${when} (한국시간)` : '발표 일정 미정'}</span>
      </div>
      {head.partial && (
        <p className="text-[11px] text-[var(--text-muted)] mb-2">이 달은 아직 진행 중입니다. 에너지·달러는 월초부터 {head.asOf?.slice(5).replace('-', '/') ?? '최근'}까지의 평균이라, 남은 기간에 따라 숫자가 바뀝니다.</p>
      )}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-medium py-1.5">지표</th>
              <th className="font-medium px-1.5">이전</th>
              <th className="font-medium px-1.5">시장 예상</th>
              <th className="font-medium px-1.5">우리(모델)</th>
              {hasAi && <th className="font-medium px-1.5">우리(기사 반영)</th>}
              <th className="font-medium px-1.5">우리−시장</th>
              {anyActual && <th className="font-medium pl-1.5">실제</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/60">
            {rows.map((r) => {
              const ours = r.fin ?? r.model;
              const diff = ours != null && r.cons != null ? ours - r.cons : null;
              return (
                <tr key={r.id} className="text-right">
                  <td className="text-left py-1.5 text-[var(--text)] whitespace-nowrap">{r.label}</td>
                  <td className="px-1.5 text-[var(--text-muted)]">{n1(r.prev)}</td>
                  <td className="px-1.5 text-[var(--text)]">{n1(r.cons)}</td>
                  <td className={`px-1.5 ${hasAi ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text)]'}`}>{n1(r.model)}<span className="text-[10px] text-[var(--text-muted)] font-normal"> ({n2(r.model)})</span></td>
                  {hasAi && <td className="px-1.5 font-semibold text-[var(--text)]">{n1(r.fin)}<span className="text-[10px] text-[var(--text-muted)] font-normal"> ({n2(r.fin)})</span></td>}
                  <td className={`px-1.5 ${diff == null ? 'text-[var(--text-muted)]' : tone(diff)}`}>{diff == null ? '—' : `${sg(diff)}%p`}</td>
                  {anyActual && <td className="pl-1.5 font-semibold text-[var(--text)]">{n1(r.actual)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.every((r) => r.cons == null) && <p className="text-[11px] text-[var(--text-muted)] mt-2">시장 예상치는 아직 없습니다(발표 약 3주 전부터 표시).</p>}
      {refs && (refs.cleveland != null || refs.kalshi != null || refs.nowflation != null) && (
        <p className="text-[11px] text-[var(--text-muted)] mt-2 tabular-nums">
          참고(CPI 전년비 다른 예측): {[refs.cleveland != null && `클리블랜드 연준 ${refs.cleveland.toFixed(2)}%`, refs.kalshi != null && `Kalshi ${refs.kalshi.toFixed(2)}%`, refs.nowflation != null && `Nowflation ${refs.nowflation.toFixed(2)}%`].filter(Boolean).join(' · ')}
        </p>
      )}

      {top.drivers.length > 0 && top.base != null && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]/60">
          <h3 className="text-[12px] font-semibold text-[var(--text)] mb-1">{SHORT[top.key]} 전월비 {n2(top.mom)}% — 무엇이 움직였나</h3>
          <ul className="space-y-0.5">
            <li className="flex items-center justify-between text-[11.5px] tabular-nums">
              <span className="text-[var(--text-muted)]">평소 수준(학습 기간 평균)</span>
              <span className="text-[var(--text)]">{n2(top.base)}%</span>
            </li>
            {top.drivers.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-2 text-[11.5px] tabular-nums">
                <span className="text-[var(--text-muted)] min-w-0 truncate">{d.label} <span className="text-[var(--text)]">{d.unit === '%p' ? `${d.x.toFixed(2)}%` : `${sg(d.x, 1)}%`}</span></span>
                <span className={`shrink-0 ${tone(d.contrib)}`}>{sg(d.contrib)}%p</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BacktestCard({ items }: { items: ForecastItem[] }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-1">수치 모델은 얼마나 맞았나 (과거 검증)</h2>
      <p className="text-[11px] text-[var(--text-muted)] mb-2 leading-relaxed">
        매달 그 전까지의 자료로만 다시 계산해 실제 발표와 비교했습니다. 평균 오차가 작을수록 좋고, &lsquo;직전 3개월 평균&rsquo;은 아무 분석 없이 최근 평균을 그대로 쓴 경우입니다.
      </p>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-medium py-1.5">지표(전월비)</th>
              <th className="font-medium px-1.5">검증 횟수</th>
              <th className="font-medium px-1.5">모델 평균 오차</th>
              <th className="font-medium px-1.5">직전 3개월 평균</th>
              <th className="font-medium pl-1.5">±0.1%p 안</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/60">
            {items.map((t) => (
              <tr key={t.key} className="text-right">
                <td className="text-left py-1.5 text-[var(--text)]">{SHORT[t.key]}</td>
                <td className="px-1.5 text-[var(--text-muted)]">{t.backtest.n}회</td>
                <td className="px-1.5 font-semibold text-[var(--text)]">{n2(t.backtest.maeModel)}%p</td>
                <td className="px-1.5 text-[var(--text-muted)]">{n2(t.backtest.maeNaive)}%p</td>
                <td className="pl-1.5 text-[var(--text)]">{t.backtest.within01 == null ? '—' : `${(t.backtest.within01 * 100).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-2 leading-relaxed">
        한계: 지금의 수정된 지표로 과거를 다시 계산한 값이라 당시 실제로 낼 수 있었던 성적보다 좋게 보일 수 있습니다. 근원 지표는 직전 평균보다 조금 나은 정도이고, PPI는 오차가 큽니다. 시장 예상치의 과거 기록은 무료 자료가 없어 비교하지 못했습니다.
      </p>
    </div>
  );
}

function ScoreCard({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-3">
      <h2 className="text-sm font-semibold text-[var(--text)] mb-1">발표 전에 남긴 예상 vs 실제</h2>
      <p className="text-[11px] text-[var(--text-muted)] mb-2">기사 분석을 실행할 때마다 그때의 예상을 저장해 두고, 발표 뒤 실제와 비교합니다(전월비 %).</p>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[12px] tabular-nums">
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-medium py-1.5">지표·월</th>
              <th className="font-medium px-1.5">시장</th>
              <th className="font-medium px-1.5">우리(모델)</th>
              <th className="font-medium px-1.5">우리(기사 반영)</th>
              <th className="font-medium pl-1.5">실제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]/60">
            {rows.map((r) => (
              <tr key={`${r.key}-${r.month}`} className="text-right">
                <td className="text-left py-1.5 text-[var(--text)] whitespace-nowrap">{SHORT[r.key]} {r.month.slice(2).replace('-', '.')}</td>
                <td className="px-1.5 text-[var(--text-muted)]">{n2(r.consensus)}</td>
                <td className="px-1.5 text-[var(--text-muted)]">{n2(r.model)}</td>
                <td className="px-1.5 text-[var(--text)]">{n2(r.final)}</td>
                <td className="pl-1.5 font-semibold text-[var(--text)]">{n2(r.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
