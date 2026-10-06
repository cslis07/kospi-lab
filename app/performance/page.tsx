'use client';

/**
 * 자산 › 성과 — 매매일지에 기록된 청산 결과만으로 계산한 실제 성적(승률·기대값·실현손익·주간 추이).
 * 예측·신호가 아니다. 기록·복기·거래소 대조는 관리 › 매매일지에서 한다.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useCoinJournal } from '@/hooks/useCoinJournal';
import { useStockJournal } from '@/hooks/useStockJournal';
import { scoreboard } from '@/lib/journalStats';
import ScoreCard from '@/components/ScoreCard';
import WeeklyReview from '@/components/WeeklyReview';
import { ICON } from '@/lib/menu';
import BreakdownTables, { type BreakRowSel } from '@/components/BreakdownTables';
import { rowKeyOf, type BreakItem } from '@/lib/tradeBreakdown';
import { SETUPS, MISTAKES, CONVICTIONS, convictionStats, convictionBySetup, convictionByMistake, convictionCoaching, type TradeTagSet } from '@/lib/tradeTags';
import ConvictionCard from '@/components/ConvictionCard';
import SetupConvictionCard from '@/components/SetupConvictionCard';
import type { TradePosition } from '@/lib/tradeReport';
import { toCsv, downloadCsv, kstDateTime, kstStamp } from '@/lib/csv';

const fmtR = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}R`;
const RCOLOR = (n: number) => (n > 0 ? 'var(--warn)' : n < 0 ? 'var(--accent-ink)' : 'var(--faint)');
type RMarket = 'coin' | 'stock';
const RESULT_KO: Record<string, string> = { open: '미청산', win: '익절', loss: '손절', even: '본전' };
const winOf = (r: string) => (r === 'win' ? true : r === 'loss' ? false : null);

function LinkRow({ href, icon, title, sub }: { href: string; icon: string; title: string; sub: string }) {
  return (
    <Link href={href} className="fin-card fin-row">
      <span className="fin-badge tint-blue">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICON[icon]} /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="nm">{title}</div>
        <div className="sb truncate">{sub}</div>
      </div>
      <svg className="w-4 h-4 text-[var(--faint)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
    </Link>
  );
}

/** 태그 선택 줄(셋업·실수) — 켜지면 tone 색 */
function TagPickRow({ label, metas, active, onToggle, tone }: {
  label: string; metas: { key: string; label: string; emoji: string }[]; active: string[]; onToggle: (k: string) => void; tone: string;
}) {
  return (
    <div className="flex items-start gap-1.5 flex-wrap">
      <span className="text-[10px] text-[var(--text-muted)] w-7 pt-1.5">{label}</span>
      {metas.map((m) => {
        const on = active.includes(m.key);
        return (
          <button key={m.key} type="button" onClick={() => onToggle(m.key)}
            className="px-2 py-1 rounded-lg border text-[11px] font-semibold"
            style={on ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: 'var(--text)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {m.emoji} {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PerformancePage() {
  const coin = useCoinJournal();
  const stock = useStockJournal();
  const coinSb = useMemo(() => scoreboard(coin.entries), [coin.entries]);
  const stockSb = useMemo(() => scoreboard(stock.entries), [stock.entries]);
  const ready = coin.mounted || stock.mounted;

  // 손익 분해 — 결과가 나온 기록만(R 기준). 요일·시간대는 기록(진입 판단) 시각 KST
  // 행 드릴다운(참고: /journal)을 위해 BreakItem 과 표시 메타를 함께 들고 있는다.
  const entryRows = useMemo(() => [
    ...coin.entries.filter((e) => e.result !== 'open').map((e) => ({
      bi: { ts: e.ts, symbol: `C:${e.symbol}`, label: `${e.name || e.symbol} · 코인`, value: e.resultR, win: winOf(e.result),
        side: (e.direction === 'long' || e.direction === 'short' ? e.direction : null) as 'long' | 'short' | null } as BreakItem,
      disp: { id: e.id, market: 'coin' as RMarket, ts: e.ts, name: `${e.name || e.symbol} · 코인`, dir: e.direction === 'long' ? '롱' : e.direction === 'short' ? '숏' : '관망', resultR: e.resultR, result: e.result, setups: e.setups, mistakes: e.mistakes, conviction: e.conviction },
    })),
    ...stock.entries.filter((e) => e.result !== 'open').map((e) => ({
      bi: { ts: e.ts, symbol: `S:${e.ticker}`, label: `${e.name || e.ticker} · 주식`, value: e.resultR, win: winOf(e.result) } as BreakItem,
      disp: { id: e.id, market: 'stock' as RMarket, ts: e.ts, name: `${e.name || e.ticker} · 주식`, dir: e.stance === 'buy' ? '매수' : e.stance === 'reduce' ? '축소' : '중립', resultR: e.resultR, result: e.result, setups: e.setups, mistakes: e.mistakes, conviction: e.conviction },
    })),
  ], [coin.entries, stock.entries]);
  const breakItems: BreakItem[] = useMemo(() => entryRows.map((r) => r.bi), [entryRows]);

  const [selRow, setSelRow] = useState<BreakRowSel | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const rowEntries = useMemo(() => {
    if (!selRow) return [];
    return entryRows.filter((r) => rowKeyOf(selRow.tab, r.bi) === selRow.key).sort((a, b) => a.disp.ts - b.disp.ts);
  }, [selRow, entryRows]);

  // 복기 교차표 — R 기록에 셋업·실수·확신 태그가 있는 매매만(R은 손절 계획한 매매만)
  const rTagged = useMemo(() => {
    const tags: Record<string, TradeTagSet> = {};
    const positions: TradePosition[] = [];
    for (const r of entryRows) {
      const e = r.disp;
      if (e.setups?.length || e.mistakes?.length || e.conviction != null) tags[e.id] = { setups: e.setups ?? [], mistakes: e.mistakes ?? [], conviction: e.conviction };
      if (e.resultR != null) positions.push({ positionId: e.id, symbol: e.name, side: 'long', openAvg: 0, closeAvg: 0, netProfit: e.resultR, fee: 0, funding: 0, openTs: e.ts, closeTs: e.ts });
    }
    return { tags, positions, count: Object.keys(tags).length };
  }, [entryRows]);
  const rConvStats = useMemo(() => convictionStats(rTagged.positions, rTagged.tags), [rTagged]);
  const rConvBySetup = useMemo(() => convictionBySetup(rTagged.positions, rTagged.tags), [rTagged]);
  const rConvByMistake = useMemo(() => convictionByMistake(rTagged.positions, rTagged.tags), [rTagged]);
  const rCoaching = useMemo(() => convictionCoaching(rTagged.positions, rTagged.tags), [rTagged]);

  const setTag = (market: RMarket, id: string, kind: 'setups' | 'mistakes', key: string) => {
    const upd = market === 'coin' ? coin.update : stock.update;
    const cur = (market === 'coin' ? coin.entries : stock.entries).find((e) => e.id === id);
    const list = (cur?.[kind] ?? []) as string[];
    upd(id, { [kind]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] });
  };
  const setConv = (market: RMarket, id: string, lv: number) => {
    const upd = market === 'coin' ? coin.update : stock.update;
    const cur = (market === 'coin' ? coin.entries : stock.entries).find((e) => e.id === id);
    upd(id, { conviction: cur?.conviction === lv ? undefined : lv });
  };

  // CSV 내보내기 — 두 매매일지(코인·주식) 전체 기록. 이 기기의 기록이 원본이므로 백업용으로도 쓸 수 있다
  const exportCsv = () => {
    const rows = [
      ...coin.entries.map((e) => [kstDateTime(e.ts), '코인선물', e.symbol, e.name, e.direction === 'long' ? '롱' : e.direction === 'short' ? '숏' : '관망',
        e.price, e.entry, e.stop, e.leverage, RESULT_KO[e.result] ?? e.result, e.resultR, e.realizedUsdt ?? null, e.memo, e.id]),
      ...stock.entries.map((e) => [kstDateTime(e.ts), '국내주식', e.ticker, e.name, e.stance === 'buy' ? '매수' : e.stance === 'reduce' ? '축소' : '중립',
        e.price, null, e.stop, null, RESULT_KO[e.result] ?? e.result, e.resultR, null, e.memo, e.id]),
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    downloadCsv(`매매기록_성과_${kstStamp()}.csv`, toCsv(
      ['기록(KST)', '시장', '코드', '이름', '방향', '기록가', '진입가', '손절가', '레버리지', '결과', 'R', '실현손익(USDT)', '메모', 'ID'], rows));
  };

  return (
    <div className="space-y-4 pb-6">
      <p className="text-xs leading-relaxed text-[var(--text-muted)] px-1">
        성과는 <strong className="text-[var(--text)]">매매일지에 입력한 청산 결과</strong>만으로 계산합니다. 엔진 점수가 아니라 내 실제 성적이며,
        기대값(R)은 손절·사이징을 계획해 둔 매매에서만 환산됩니다.
      </p>

      {ready ? <WeeklyReview rows={[...coin.entries, ...stock.entries]} /> : <div className="skeleton h-40" />}

      {ready && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">코인 {coin.entries.length}건 · 주식 {stock.entries.length}건 기록</span>
          <button type="button" onClick={exportCsv} disabled={coin.entries.length + stock.entries.length === 0}
            title="두 매매일지 기록을 엑셀에서 열 수 있는 CSV로 저장(백업 겸용)"
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-[12px] font-semibold disabled:opacity-40">
            CSV 내보내기
          </button>
        </div>
      )}

      {ready && breakItems.length > 0 && (
        <BreakdownTables items={breakItems} unit="R" valueLabel="R" fmt={fmtR}
          sub={`결과 입력 ${breakItems.length}건 · 기록 시각(KST) 기준 · R은 손절을 계획한 매매만`}
          selectedRow={selRow} onSelectRow={setSelRow}
          renderDetail={() => (
            <div className="mt-3 rounded-xl border border-[var(--line-2)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--surface-2)] text-[12px] text-[var(--text-muted)]">이 구간 기록 {rowEntries.length}건 · 행을 누르면 셋업·실수·확신 태그</div>
              {rowEntries.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">해당 기록이 없습니다.</p>
              ) : rowEntries.map((r, i) => {
                const d = r.disp; const editing = editId === d.id;
                const tagEmojis = [...(d.setups ?? []).map((k) => SETUPS.find((s) => s.key === k)?.emoji), ...(d.mistakes ?? []).map((k) => MISTAKES.find((s) => s.key === k)?.emoji)].filter(Boolean);
                return (
                <div key={d.id} className={i > 0 ? 'border-t border-[var(--line-2)]' : ''}>
                  <button type="button" onClick={() => setEditId(editing ? null : d.id)}
                    className="w-full px-3 py-2 flex items-center gap-2 text-[12px] text-left active:bg-[var(--surface-2)]">
                    <span className="text-[var(--text)] font-semibold truncate max-w-[38%]">{d.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{d.dir}</span>
                    {d.conviction != null && <span className="text-[10px] text-[var(--text-muted)]">확신 {d.conviction}</span>}
                    {tagEmojis.length > 0 && <span className="text-[11px]">{tagEmojis.join('')}</span>}
                    <span className="ml-auto text-[11px]" style={{ color: d.result === 'win' ? 'var(--warn)' : d.result === 'loss' ? 'var(--accent-ink)' : 'var(--faint)' }}>{RESULT_KO[d.result] ?? d.result}</span>
                    <span className="text-[12px] font-bold tabular-nums w-[64px] text-right" style={{ color: RCOLOR(d.resultR ?? 0) }}>{d.resultR == null ? '—' : fmtR(d.resultR)}</span>
                  </button>
                  {editing && (
                    <div className="px-3 pb-3 pt-1 space-y-2 bg-[var(--surface-2)]">
                      <TagPickRow label="셋업" metas={SETUPS} active={d.setups ?? []} onToggle={(k) => setTag(d.market, d.id, 'setups', k)} tone="var(--accent)" />
                      <TagPickRow label="실수" metas={MISTAKES} active={d.mistakes ?? []} onToggle={(k) => setTag(d.market, d.id, 'mistakes', k)} tone="var(--amber)" />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-[var(--text-muted)] w-7">확신</span>
                        {CONVICTIONS.map((c) => (
                          <button key={c.level} type="button" onClick={() => setConv(d.market, d.id, c.level)}
                            className="px-2 py-1 rounded-lg border text-[11px] font-semibold"
                            style={d.conviction === c.level ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--text)' } : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                            {c.emoji} {c.level}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )} />
      )}

      {/* 복기 교차표(R 기록) — 태그가 달린 매매가 있을 때만 */}
      {ready && rTagged.count > 0 && (
        <div className="space-y-3">
          {rConvStats.length > 0 && (() => {
            const style = rCoaching.verdict === 'calibrated' ? 'border-emerald-500/40 bg-emerald-500/5' : rCoaching.verdict === 'overconfident' ? 'border-amber-500/40 bg-amber-500/5' : 'border-[var(--border)] bg-[var(--surface-2)]';
            const emoji = rCoaching.verdict === 'calibrated' ? '🎯' : rCoaching.verdict === 'overconfident' ? '⚠️' : rCoaching.verdict === 'insufficient' ? '📊' : '🤔';
            return (
              <div className={`rounded-2xl border p-4 ${style}`}>
                <p className="text-[11px] font-bold text-[var(--text)] mb-0.5">{emoji} 확신 보정 <span className="font-normal text-[var(--text-muted)]">— 기록(R) 기준</span></p>
                <p className="text-[12px] text-[var(--text)] leading-relaxed">{rCoaching.text}</p>
              </div>
            );
          })()}
          {rConvStats.length > 0 && <ConvictionCard rows={rConvStats} fmt={fmtR} sub={`기록(R) · 확신 매긴 ${rConvStats.reduce((a, r) => a + r.count, 0)}건`} />}
          {rConvBySetup.length > 0 && <SetupConvictionCard rows={rConvBySetup} fmt={fmtR} sub="기록(R) · 셋업+확신 둘 다 매긴 매매" />}
          {rConvByMistake.length > 0 && <SetupConvictionCard kind="mistake" rows={rConvByMistake} fmt={fmtR} sub="기록(R) · 실수+확신 둘 다 매긴 매매" />}
        </div>
      )}
      {ready && breakItems.length > 0 && rTagged.count === 0 && (
        <p className="text-[11px] text-[var(--faint)] px-1 leading-relaxed">
          손익 분해 표의 <b className="text-[var(--text-muted)]">행을 눌러 매매를 펼친 뒤</b> 셋업·실수·확신을 매기면, 여기에 <b className="text-[var(--text-muted)]">확신별 성적·셋업×확신·실수×확신</b> 복기가 생깁니다(참고: Edgewonk).</p>
      )}

      {ready && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScoreCard title="코인선물 성적" href="/coin-analysis" sb={coinSb} unit="USDT" />
          <ScoreCard title="국내주식 성적" href="/stock-analysis" sb={stockSb} unit="원" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        <LinkRow href="/journal" icon="journal" title="매매일지" sub="기록·결과 입력·거래소 대조·복기" />
        <LinkRow href="/bitget" icon="bitget" title="계좌" sub="거래소 잔고·포지션·청산" />
      </div>
    </div>
  );
}
