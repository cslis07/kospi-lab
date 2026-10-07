'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { BriefData, BriefMarket, MacroNum, BriefNews, NewsTag } from '@/lib/brief';
import type { EdgeReport, EdgeRow } from '@/lib/briefEdge';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TABS: { key: BriefMarket; label: string; emoji: string }[] = [
  { key: 'coin', label: '코인', emoji: '🪙' },
  { key: 'kr', label: '국내증시', emoji: '🇰🇷' },
  { key: 'us', label: '해외증시', emoji: '🇺🇸' },
];

const SOURCES: Record<BriefMarket, string> = {
  coin: '수치 네이버 금융·Bitget·SoSoValue·alternative.me(실시간~15분 지연) · 뉴스 CoinDesk·The Block·Cointelegraph·Decrypt 등 · 과거 통계 FRED',
  kr: '수치 네이버 금융(실시간~15분 지연) · 뉴스 네이버 증권·해외 RSS · 과거 통계 FRED·네이버 일봉',
  us: '수치 네이버 금융(실시간~15분 지연) · 뉴스 CNBC·Bloomberg·연준 등 · 과거 통계 FRED',
};

const GROUPS: { key: NonNullable<MacroNum['group']>; label: string; desc: string }[] = [
  { key: 'market', label: '시장', desc: '' },
  { key: 'lead', label: '선행 지표', desc: '시장이 미리 반영하는 것들' },
  { key: 'macro', label: '금리·유가', desc: '' },
  { key: 'crypto', label: '코인 수급', desc: '' },
];

const TAG_STYLE: Record<Exclude<NewsTag, null>, { label: string; cls: string }> = {
  war: { label: '지정학', cls: 'bg-[var(--warn-soft)] text-[var(--warn)]' },
  geo: { label: '정치', cls: 'bg-[var(--warn-soft)] text-[var(--warn)]' },
  oil: { label: '유가', cls: 'bg-amber-500/15 text-amber-400' },
  rate: { label: '금리', cls: 'bg-[var(--accent-soft)] text-[var(--accent)]' },
};

/** 한국 관행: 상승=빨강(--warn), 하락=파랑(--accent) */
function changeColor(n: number | null): string {
  if (n == null || n === 0) return 'text-[var(--text-muted)]';
  return n > 0 ? 'text-[var(--warn)]' : 'text-[var(--accent)]';
}

const kst = (ms: number) => new Date(ms + 9 * 3600_000);
const pad = (n: number) => String(n).padStart(2, '0');
/** 수치 기준 시각 — ISO 는 KST 시각으로, 날짜만 있으면 '확정치' */
function asOfText(m: MacroNum): string {
  if (!m.asOf) return '';
  if (m.asOf.length <= 10) return `${Number(m.asOf.slice(5, 7))}/${Number(m.asOf.slice(8, 10))} 집계`;
  const t = new Date(m.asOf).getTime();
  if (!Number.isFinite(t)) return '';
  const d = kst(t);
  const base = `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${base}${m.live === false ? ' 마감' : ''}${m.delayMin ? ` · ${m.delayMin}분 지연` : ''}`;
}
function hhmm(iso?: string): string {
  if (!iso) return '';
  const d = kst(new Date(iso).getTime());
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function ago(ts: number | null): string {
  if (!ts) return '';
  const h = (Date.now() - ts) / 3600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 전`;
  if (h < 24) return `${Math.round(h)}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function MacroCell({ m }: { m: MacroNum }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="text-xs text-[var(--text-muted)] truncate">{m.label}</div>
      <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <span className="text-lg font-semibold text-[var(--text)] font-mono">{m.value}</span>
        <span className={`text-xs font-mono ${changeColor(m.change)}`}>{m.changeText}</span>
      </div>
      {m.hint && <div className="mt-1 text-[11px] leading-snug text-[var(--text-muted)] opacity-80">{m.hint}</div>}
      <div className="mt-1 text-[10px] text-[var(--text-muted)] opacity-60 tabular-nums">{[asOfText(m), m.source].filter(Boolean).join(' · ')}</div>
    </div>
  );
}

function MacroGroups({ macro }: { macro: MacroNum[] }) {
  if (!macro.length) {
    return <p className="text-sm text-[var(--text-muted)] py-4">수치를 불러오지 못했습니다 (잠시 후 다시 시도).</p>;
  }
  return (
    <div className="space-y-3">
      {GROUPS.map((g) => {
        const list = macro.filter((m) => (m.group ?? 'macro') === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key}>
            <p className="text-[11px] font-semibold text-[var(--text-muted)] mb-1.5">{g.label}{g.desc && <span className="font-normal opacity-70"> · {g.desc}</span>}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{list.map((m) => <MacroCell key={m.key} m={m} />)}</div>
          </div>
        );
      })}
    </div>
  );
}

const VERDICT: Record<EdgeRow['verdict'], { label: string; cls: string }> = {
  significant: { label: '차이 유의', cls: 'bg-[var(--warn-soft)] text-[var(--warn)]' },
  noise: { label: '우연 범위', cls: 'bg-white/5 text-[var(--text-muted)]' },
  thin: { label: '표본 부족', cls: 'bg-white/5 text-[var(--text-muted)]' },
};

/** 과거 통계 — 요인이 크게 움직인 다음 날 이 시장은 실제로 어땠나(대조군 포함, 측정값 그대로) */
function EdgeSection({ e }: { e: EdgeReport }) {
  if (!e.rows.length) return <p className="text-sm text-[var(--text-muted)] py-2">{e.note ?? '과거 통계를 불러오지 못했습니다.'}</p>;
  const sig = e.rows.filter((r) => r.verdict === 'significant');
  const hasIntra = e.rows.some((r) => r.intra);
  const gapOnly = hasIntra && sig.length > 0 && sig.every((r) => r.intra?.verdict !== 'significant');
  const latestOf = (factor: string) => e.latest.find((l) => l.factor === factor);
  const thr = (r: EdgeRow) => `${r.threshold >= 0 ? '+' : ''}${r.threshold.toFixed(2)}${r.unit}`;
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-2">
        최근 약 3년({e.from}~{e.to}, {e.days}거래일) 실측. 요인이 <b className="text-[var(--text)]">상위·하위 20%</b>로 크게 움직인 다음 거래일에 {e.target}가 오른 비율을,
        평소 상승 비율 <b className="text-[var(--text)]">{e.baseRate?.toFixed(0)}%</b>(대조군)와 비교합니다.
      </p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-x-auto">
        <table className="w-full text-[12px] tabular-nums" style={{ minWidth: 330 }}>
          <thead>
            <tr className="text-[10.5px] text-[var(--text-muted)] text-right">
              <th className="text-left font-semibold px-3 py-2">전날 조건</th>
              <th className="font-semibold px-2">다음 날 상승</th>
              {hasIntra && <th className="font-semibold px-2">시가→종가</th>}
              <th className="font-semibold px-2">표본</th>
              <th className="font-semibold px-3">판정</th>
            </tr>
          </thead>
          <tbody>
            {e.rows.map((r) => {
              const l = latestOf(r.factor);
              const now = l?.bucket === r.bucket;
              const v = VERDICT[r.verdict];
              return (
                <tr key={`${r.factor}-${r.bucket}`} className="border-t border-[var(--border)] text-right" style={now ? { background: 'rgba(56,189,248,.08)' } : undefined}>
                  <td className="text-left px-3 py-2">
                    <span className="text-[var(--text)] font-medium">{r.label} {r.bucket === 'surge' ? '급등' : '급락'}</span>
                    <span className="block text-[10px] text-[var(--text-muted)]">{r.bucket === 'surge' ? '≥' : '≤'} {thr(r)}{now && l ? <b className="text-sky-400"> · 최근({l.date.slice(5)}) 해당</b> : null}</span>
                  </td>
                  <td className="px-2">
                    <b className={r.verdict === 'significant' ? changeColor(r.diff) : 'text-[var(--text)]'}>{r.upRate.toFixed(0)}%</b>
                    <span className="block text-[10px] text-[var(--text-muted)]">평소 {r.baseRate.toFixed(0)}%</span>
                  </td>
                  {hasIntra && (
                    <td className="px-2">
                      {r.intra ? <><span className="text-[var(--text)]">{r.intra.upRate.toFixed(0)}%</span><span className="block text-[10px] text-[var(--text-muted)]">평소 {r.intra.baseRate.toFixed(0)}%</span></> : '—'}
                    </td>
                  )}
                  <td className="px-2 text-[var(--text-muted)]">{r.n}</td>
                  <td className="px-3"><span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${v.cls}`}>{v.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11.5px] text-[var(--text-muted)] leading-relaxed space-y-1">
        {sig.length === 0 && <p><b className="text-[var(--text)]">결론: 이 요인들로는 다음 날 {e.target} 방향을 가늠할 수 없었습니다</b>(전부 우연 범위). 요인이 크게 움직여도 다음 날 오를지 내릴지는 평소와 다르지 않았습니다.</p>}
        {sig.length > 0 && gapOnly && (
          <p><b className="text-[var(--text)]">결론: 방향은 통계적으로 뚜렷하지만 시가 갭에 이미 반영됩니다.</b> &lsquo;시가→종가&rsquo;(장이 열린 뒤)로 보면 평소와 차이가 없습니다 —
            오늘 시가가 어느 쪽으로 열릴지 가늠하는 참고는 되지만, 보고 나서 시가에 사고팔아 얻는 우위는 측정되지 않았습니다.</p>
        )}
        {sig.length > 0 && !gapOnly && <p><b className="text-[var(--text)]">결론: 표시된 조건에서 평소와 유의한 차이가 있었습니다.</b> 과거 3년의 경향이며 다음 날을 보장하지 않습니다.</p>}
        <p className="opacity-80">판정 기준(사전 고정): 표본 30건 이상 · |z| ≥ 2.58 · 기간을 반으로 나눠도 같은 방향. 파란 줄 = 요인의 최근 확정치가 그 구간에 해당. 예측이 아니라 과거 측정값입니다.</p>
      </div>
    </div>
  );
}

function NewsRow({ item }: { item: BriefNews }) {
  const tag = item.tag ? TAG_STYLE[item.tag] : null;
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-colors group"
    >
      {tag && <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${tag.cls}`}>{tag.label}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text)] leading-snug group-hover:text-sky-400 transition-colors line-clamp-2">{item.title}</p>
        <span className="text-xs text-[var(--text-muted)] opacity-60">{[item.source, ago(item.ts)].filter(Boolean).join(' · ')}</span>
      </div>
    </a>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-24 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[...Array(6)].map((_, i) => <div key={i} className="h-20 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />)}
      </div>
      {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]" />)}
    </div>
  );
}

export default function BriefPage() {
  const [market, setMarket] = useState<BriefMarket>('coin');
  const { data, isLoading, error } = useSWR<BriefData>(`/api/brief?market=${market}`, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 30 * 60 * 1000,
  });
  // 수치는 요약과 따로 1분마다 갱신(요약은 1시간 캐시)
  const { data: live } = useSWR<{ asOf: string; macro: MacroNum[] }>(`/api/brief/macro?market=${market}`, fetcher, {
    refreshInterval: 60 * 1000,
    revalidateOnFocus: true,
  });
  const { data: edge } = useSWR<EdgeReport>(`/api/brief/edge?market=${market}`, fetcher, { revalidateOnFocus: false });

  const ai = data?.ai;
  const macro = live?.macro?.length ? live.macro : data?.macro ?? [];

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-[var(--text)]">모닝 브리핑</h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          간밤 美 시장·금리·유가·지정학이 각 시장에 주는 <b className="text-[var(--text)]">맥락</b>과 과거 실측 통계. 매일 아침 자동 정리.
        </p>
      </div>

      {/* 시장 탭 */}
      <div className="flex gap-0 mb-4 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMarket(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              market === t.key ? 'border-sky-500 text-sky-400' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton />}

      {error && !isLoading && (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <p>브리핑을 불러오지 못했습니다</p>
          <p className="text-xs mt-1 opacity-60">잠시 후 다시 시도해 주세요</p>
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="space-y-5">
          {/* AI 요약 */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">AI 요약</span>
              {ai?.at && <span className="text-[10px] text-[var(--text-muted)] opacity-70 tabular-nums">{hhmm(ai.at)} 작성</span>}
              {ai?.model && <span className="text-[10px] text-[var(--text-muted)] opacity-50">{ai.model}</span>}
              {ai?.stale && <span className="text-[10px] text-amber-400 opacity-80">이전 요약</span>}
            </div>
            {ai?.headline ? (
              <>
                <p className="text-base font-semibold text-[var(--text)] leading-snug">{ai.headline}</p>
                <ul className="mt-2 space-y-1.5">
                  {ai.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--text-muted)] leading-snug">
                      <span className="text-sky-400 shrink-0">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10.5px] text-[var(--text-muted)] opacity-70">
                  문장 속 수치는 아래 수치·헤드라인과 자동 대조했습니다{ai.dropped ? ` — 근거에 없는 숫자를 쓴 문장 ${ai.dropped}개 제외` : ''}. 요약 뒤에도 수치는 계속 갱신됩니다.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                {ai?.notConfigured ? 'AI 요약 준비 중 (키 미설정)' : `AI 요약 생성 실패${ai?.error ? ` — ${ai.error}` : ''}. 아래 수치·뉴스는 정상입니다.`}
              </p>
            )}
          </div>

          {/* 수치 */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-sm font-semibold text-[var(--text)]">지금 수치</h3>
              <span className="text-[10.5px] text-[var(--text-muted)] tabular-nums">1분마다 갱신{live?.asOf ? ` · ${hhmm(live.asOf)} 조회` : ''}</span>
            </div>
            <MacroGroups macro={macro} />
          </div>

          {/* 과거 통계 */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-2">과거 통계 — 이런 날 다음엔 어땠나</h3>
            {edge ? <EdgeSection e={edge} /> : <div className="h-28 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] animate-pulse" />}
          </div>

          {/* 전쟁·지정학 */}
          {data.war.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)] mb-2">⚠️ 전쟁·지정학</h3>
              <div className="space-y-2">{data.war.map((n, i) => <NewsRow key={`w-${i}`} item={n} />)}</div>
            </div>
          )}

          {/* 관련 뉴스 */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <h3 className="text-sm font-semibold text-[var(--text)]">관련 뉴스</h3>
              <span className="text-[10.5px] text-[var(--text-muted)]">관련도·매체·신선도순 · 같은 사건 중복 제거</span>
            </div>
            {data.news.length > 0 ? (
              <div className="space-y-2">{data.news.map((n, i) => <NewsRow key={`n-${i}`} item={n} />)}</div>
            ) : (
              <p className="text-sm text-[var(--text-muted)] py-2">관련 뉴스를 찾지 못했습니다.</p>
            )}
          </div>

          {/* 오늘 일정 */}
          {data.events.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)] mb-2">변동성 주의 일정</h3>
              <div className="space-y-1.5">
                {data.events.map((e, i) => (
                  <div key={`e-${i}`} className="flex items-center gap-3 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">{e.date.slice(5)}</span>
                    <span className="text-sm text-[var(--text)] flex-1 min-w-0 truncate">{e.title}</span>
                    {e.importance === 'high' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--warn-soft)] text-[var(--warn)] shrink-0">중요</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 면책 */}
          <div className="text-[11px] text-[var(--text-muted)] opacity-70 leading-relaxed border-t border-[var(--border)] pt-3">
            <p>※ 맥락 참고용이며 <b>매매 신호가 아닙니다</b>. 과거 통계는 측정값이고 다음 날을 보장하지 않습니다.</p>
            <p className="mt-0.5">{SOURCES[market]}</p>
          </div>
        </div>
      )}
    </div>
  );
}
