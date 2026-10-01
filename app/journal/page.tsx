'use client';

/**
 * 매매일지 (단순화판) — 세 조각만 남긴다.
 *  ① 거래소 대조: Bitget USDT 선물 청산 이력 + 현재 열린 포지션을 그대로 가져온다(매매 목록의 소스).
 *  ② 매매별 기분: 각 매매마다 '진입 당시 심리'를 이 브라우저에 덧입힌다(열린 포지션에 바로 기록 가능).
 *  ③ 월별 보고서: 평소엔 월 목록만 접어두고, 월을 선택하면 그 달의 요약·거래내역·청산 성적·기분별 성적을 펼친다.
 *
 * 코인선물 전용(거래소 자동 대조가 되는 유일한 소스). 읽기 전용 조회 — 주문하지 않는다.
 * 색은 한국 관행(상승·이익=빨강 / 하락·손실=파랑).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BottomSheet from '@/components/ui/BottomSheet';
import { useTradeMood, type TradeMood } from '@/hooks/useTradeMood';
import { MOODS, MOOD_BY_KEY, type MoodKey } from '@/lib/tradeMood';
import { monthlyStats, moodStats, kstMonth } from '@/lib/tradeReport';
import BreakdownTables from '@/components/BreakdownTables';
import type { BreakItem } from '@/lib/tradeBreakdown';
import { toCsv, downloadCsv, kstDateTime as csvTime, kstStamp } from '@/lib/csv';
import { fmtCoinPrice } from '@/lib/coins';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const UP = '#ff4433';
const DOWN = '#1c6cff';
const COIN_NAME: Record<string, string> = {
  BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나',
};
const coinName = (s: string) => COIN_NAME[s] ?? s.replace(/USDT$/, '');

/** 현재 열린 포지션(/api/bitget/positions) — positionId가 없어 기분 키는 open-심볼-방향 */
interface OpenPosition {
  symbol: string; side: 'long' | 'short'; size: number; openAvg: number;
  markPrice: number; leverage: number; unrealizedPL: number;
  liquidationPrice: number; liqDistPct: number | null;
}
const openId = (p: OpenPosition) => `open-${p.symbol}-${p.side}`;

const fmtPnl = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
const pnlColor = (n: number) => (n > 0 ? UP : n < 0 ? DOWN : 'var(--faint)');
function fmtHold(ms: number | null): string {
  if (ms == null || ms <= 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h}시간 ${m}분` : `${h}시간`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}일 ${rh}시간` : `${d}일`;
}
const kstDateTime = (ts: number) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ts));
const kstMonthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `${y}년 ${Number(m)}월`; };

function SideBadge({ side }: { side: 'long' | 'short' }) {
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${side === 'long' ? 'text-[#ff4433] bg-[#ff4433]/10' : 'text-[#1c6cff] bg-[#1c6cff]/10'}`}>{side === 'long' ? '롱' : '숏'}</span>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
      className="text-[var(--faint)] shrink-0 transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export default function JournalPage() {
  const { moods, mounted, setMood, clearMood } = useTradeMood();
  const [days, setDays] = useState(30);
  const [positions, setPositions] = useState<ClosedPosition[]>([]);
  const [open, setOpen] = useState<OpenPosition[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selMonth, setSelMonth] = useState<string | null>(null); // 펼쳐진 월(null=전부 접힘)

  // 기분 편집 시트 — 열린/청산 포지션 공통으로 { id, symbol } 을 편집한다
  const [editing, setEditing] = useState<{ id: string; symbol: string } | null>(null);
  const [pick, setPick] = useState<MoodKey | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!editing) return;
    const cur = moods[editing.id];
    setPick(cur?.mood ?? null);
    setNote(cur?.note ?? '');
  }, [editing, moods]);

  const load = useCallback(async (d: number) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const [hRes, pRes] = await Promise.all([
        fetch(`/api/bitget/history?days=${d}`),
        fetch('/api/bitget/positions').catch(() => null),
      ]);

      // 현재 열린 포지션 — best-effort(잠금·권한 문제는 아래 history 에러로 안내)
      let openList: OpenPosition[] = [];
      if (pRes && pRes.ok) {
        try { const pj = await pRes.json() as { positions?: OpenPosition[] }; if (Array.isArray(pj.positions)) openList = pj.positions; } catch { /* 무시 */ }
      }
      setOpen(openList);

      if (hRes.status === 401) { setErr('잠금 상태입니다 — /bitget 에서 접근 토큰을 1회 입력하세요.'); setPositions([]); return; }
      const j = await hRes.json() as { configured?: boolean; error?: string; positions?: ClosedPosition[] };
      if (j.configured === false) { setErr('Bitget API 키가 서버에 설정되지 않았습니다.'); setPositions([]); return; }
      if (j.error) { setErr(`거래소 조회 실패 — ${j.error.includes('40014') ? '키에 선물 읽기 권한이 없습니다(Bitget API 관리에서 Futures/Position Read 추가).' : j.error}`); setPositions([]); return; }
      const list = j.positions ?? [];
      setPositions(list);
      if (!list.length && !openList.length) setMsg(`최근 ${d}일 청산된 선물 포지션이 없고, 열린 포지션도 없습니다.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); setLoaded(true); }
  }, []);

  // 진입 시 자동 1회 + 기간 변경 시 재조회
  useEffect(() => { load(days); }, [days, load]);

  const months = useMemo(() => monthlyStats(positions), [positions]);
  // 월별 거래내역(상세 펼침용)
  const monthGroups = useMemo(() => {
    const map = new Map<string, ClosedPosition[]>();
    for (const p of positions) {
      const k = kstMonth(p.closeTs);
      const arr = map.get(k);
      if (arr) arr.push(p); else map.set(k, [p]);
    }
    return map;
  }, [positions]);

  // 손익 분해(요일·시간대는 '진입' 시각 기준 — 언제 들어간 매매가 잘 됐나)
  const breakItems: BreakItem[] = useMemo(() => positions.map((p) => ({
    ts: p.openTs || p.closeTs, symbol: p.symbol, label: coinName(p.symbol), value: p.netProfit,
    win: p.netProfit > 0 ? true : p.netProfit < 0 ? false : null,
  })), [positions]);

  // CSV 내보내기 — 거래소 청산 내역 + 이 기기의 기분 기록(엑셀용 BOM·KST)
  const exportCsv = () => {
    const rows = [...positions].sort((a, b) => a.closeTs - b.closeTs).map((p) => {
      const m = moods[p.positionId];
      return [csvTime(p.openTs), csvTime(p.closeTs), p.symbol, coinName(p.symbol), p.side === 'long' ? '롱' : '숏',
        p.openAvg, p.closeAvg, +p.netProfit.toFixed(4), +p.fee.toFixed(4), +p.funding.toFixed(4),
        m ? MOOD_BY_KEY.get(m.mood)?.label ?? m.mood : '', m?.note ?? '', p.positionId];
    });
    downloadCsv(`매매일지_코인선물_${days}일_${kstStamp()}.csv`, toCsv(
      ['진입(KST)', '청산(KST)', '심볼', '이름', '방향', '진입가', '청산가', '순손익(USDT)', '수수료', '펀딩', '진입 기분', '메모', '포지션ID'], rows));
  };

  const saveMood = () => {
    if (!editing || !pick) return;
    setMood(editing.id, pick, note);
    setEditing(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-[var(--text)]">매매일지 <span className="text-xs font-normal text-[var(--text-muted)]">거래소 대조 · 기분 · 월별 보고서</span></h1>
        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
          거래소가 아는 매입·청산·실현손익(수수료·펀딩 반영)을 그대로 가져오고, 매매마다 <strong className="text-[var(--text)]">진입 당시 기분</strong>을 남깁니다.
          손으로 적는 기록은 이긴 매매만 남기 쉬워, 대조는 거래소에 맡깁니다. <span className="text-[var(--faint)]">코인선물(Bitget) · 읽기 전용 조회.</span>
        </p>
      </div>

      {/* 기간 + 가져오기 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} disabled={busy}
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                days === d ? 'bg-sky-500/15 text-sky-400 border-sky-500/40' : 'text-[var(--text-muted)] border-[var(--border)]'
              }`}>{d}일</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={exportCsv} disabled={busy || positions.length === 0}
            title="청산 내역·기분 기록을 엑셀에서 열 수 있는 CSV로 저장"
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] text-[12px] font-semibold disabled:opacity-40">
            CSV 내보내기
          </button>
          <button type="button" onClick={() => load(days)} disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-400 text-[12px] font-semibold disabled:opacity-50">
            {busy ? '대조 중…' : '⟳ 거래소에서 가져오기'}
          </button>
        </div>
      </div>

      {err && <p className="mb-3 text-[12px] text-red-400">⚠ {err} {err.includes('잠금') && <Link href="/bitget" className="underline">계좌로 이동</Link>}</p>}
      {msg && !err && <p className="mb-3 text-[12px] text-[var(--text-muted)]">{msg}</p>}

      {/* 현재 포지션 (미청산) — 진입 당시 기분을 바로 기록 */}
      {open.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-2">현재 포지션 <span className="text-[10px] font-normal text-[var(--text-muted)]">미청산 · 눌러서 진입 기분 기록</span></h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {open.map((p, i) => {
              const id = openId(p);
              const mood = moods[id];
              const meta = mood ? MOOD_BY_KEY.get(mood.mood) : null;
              return (
                <button key={id} type="button" onClick={() => setEditing({ id, symbol: p.symbol })}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 active:bg-[var(--surface-2)] transition-colors ${i > 0 ? 'border-t border-[var(--line-2)]' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <b className="text-[14px] text-[var(--text)]">{coinName(p.symbol)}</b>
                      <SideBadge side={p.side} />
                      {p.leverage > 0 && <span className="text-[10px] font-bold text-[var(--faint)]">{p.leverage}x</span>}
                      {meta && <span className="text-[11px]">{meta.emoji} {meta.label}</span>}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                      진입 {fmtCoinPrice(p.openAvg)} · 현재 {fmtCoinPrice(p.markPrice)}{p.liqDistPct != null ? ` · 청산까지 ${p.liqDistPct.toFixed(1)}%` : ''}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-[14px] font-bold tabular-nums" style={{ color: pnlColor(p.unrealizedPL) }}>{fmtPnl(p.unrealizedPL)}</span>
                    <span className="block text-[10px] text-[var(--faint)]">미실현</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 손익 분해 — 요일·시간대·종목별(청산 건, 수수료·펀딩 반영 순손익) */}
      {positions.length > 0 && (
        <BreakdownTables items={breakItems} unit="USDT" valueLabel="순손익" fmt={fmtPnl}
          sub={`최근 ${days}일 청산 ${positions.length}건 · 진입 시각(KST) 기준`} />
      )}

      {/* ③ 월별 보고서 — 접힘 상태로 월 목록만, 월을 누르면 상세 펼침(청산 건만) */}
      {months.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-2">월별 보고서 <span className="text-[10px] font-normal text-[var(--text-muted)]">월을 누르면 상세가 열립니다</span></h2>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            {months.map((m, i) => {
              const isOpen = selMonth === m.month;
              const trades = monthGroups.get(m.month) ?? [];
              const mm = moodStats(trades, moods);
              return (
                <div key={m.month} className={i > 0 ? 'border-t border-[var(--line-2)]' : ''}>
                  <button type="button" onClick={() => setSelMonth(isOpen ? null : m.month)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 active:bg-[var(--surface-2)] transition-colors">
                    <span className="flex items-center gap-2 min-w-0">
                      <Chevron open={isOpen} />
                      <b className="text-[15px] text-[var(--text)]">{kstMonthLabel(m.month)}</b>
                      <span className="text-[11px] text-[var(--text-muted)]">{m.count}건 · 승 {m.winRate != null ? `${m.winRate.toFixed(0)}%` : '—'}</span>
                    </span>
                    <span className="text-[15px] font-extrabold tabular-nums shrink-0" style={{ color: pnlColor(m.netSum) }}>{fmtPnl(m.netSum)} USDT</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4">
                      {/* 요약 */}
                      <div className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm rounded-xl bg-[var(--surface-2)] p-3">
                        <Stat label="거래" value={`${m.count}건`} />
                        <Stat label="승률" value={m.winRate != null ? `${m.winRate.toFixed(0)}% (${m.wins}/${m.count})` : '—'} />
                        <Stat label="롱 / 숏" value={`${m.longCount} / ${m.shortCount}`} />
                        <Stat label="평균 보유" value={fmtHold(m.avgHoldMs)} />
                        <Stat label="수수료" value={`${m.feeSum.toFixed(2)}`} />
                        <Stat label="펀딩" value={fmtPnl(m.fundingSum)} />
                      </div>
                      {(m.best || m.worst) && (
                        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                          {m.best && <div><span className="text-[var(--text-muted)]">최고 </span><b className="text-[var(--text)]">{coinName(m.best.symbol)}</b> <span className="tabular-nums" style={{ color: pnlColor(m.best.netProfit) }}>{fmtPnl(m.best.netProfit)}</span></div>}
                          {m.worst && <div><span className="text-[var(--text-muted)]">최저 </span><b className="text-[var(--text)]">{coinName(m.worst.symbol)}</b> <span className="tabular-nums" style={{ color: pnlColor(m.worst.netProfit) }}>{fmtPnl(m.worst.netProfit)}</span></div>}
                        </div>
                      )}

                      {/* 기분별 성적(그 달) */}
                      {mm.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-[12px] font-bold text-[var(--text)] mb-1.5">기분별 성적 <span className="text-[10px] font-normal text-[var(--text-muted)]">어떤 심리일 때 잘·못 했나</span></h3>
                          <div className="space-y-1.5">
                            {mm.map((s) => {
                              const meta = MOOD_BY_KEY.get(s.mood)!;
                              return (
                                <div key={s.mood} className="flex items-center gap-2 text-[13px]">
                                  <span className="w-28 shrink-0">{meta.emoji} {meta.label}</span>
                                  <span className="text-[var(--text-muted)] tabular-nums w-12">{s.count}건</span>
                                  <span className="text-[var(--text-muted)] tabular-nums w-14">{s.winRate != null ? `${s.winRate.toFixed(0)}%` : '—'}</span>
                                  <span className="ml-auto font-bold tabular-nums" style={{ color: pnlColor(s.netSum) }}>{fmtPnl(s.netSum)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 거래내역(그 달, 청산 성적) — 행을 눌러 기분 기록 */}
                      <div className="mt-4">
                        <h3 className="text-[12px] font-bold text-[var(--text)] mb-1.5">거래내역 <span className="text-[10px] font-normal text-[var(--text-muted)]">행을 눌러 기분 기록</span></h3>
                        <div className="rounded-xl border border-[var(--line-2)] overflow-hidden">
                          {trades.map((p, j) => (
                            <TradeRow key={p.positionId} p={p} mood={moods[p.positionId]} border={j > 0}
                              onEdit={() => setEditing({ id: p.positionId, symbol: p.symbol })} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loaded && !busy && !err && positions.length === 0 && open.length === 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-sm text-[var(--text-muted)]">
          표시할 매매가 없습니다. 기간을 늘리거나 다시 가져와 보세요.
        </div>
      )}

      <p className="text-[10px] text-[var(--text-muted)] mt-4 leading-relaxed">
        ※ 월별 보고서·손익은 <strong className="text-[var(--text)]">거래소가 청산한 포지션</strong>만 반영합니다(수수료·펀딩 포함). 현재 포지션의 미실현손익은 참고용이며 보고서에 넣지 않습니다.
        기분 기록은 이 브라우저에만 저장되며 <Link href="/virtual" className="text-sky-400 hover:underline">가상투자·백업</Link>에서 관리합니다. 읽기 전용 조회이며 주문은 하지 않습니다.
      </p>

      {/* 기분 편집 시트 */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${coinName(editing.symbol)} · 진입 당시 기분` : ''}
        footer={
          <div className="flex items-center gap-2">
            {editing && moods[editing.id] && (
              <button type="button" onClick={() => { clearMood(editing.id); setEditing(null); }}
                className="px-3 py-2.5 rounded-xl border border-[var(--border)] text-[13px] text-red-400 font-semibold">삭제</button>
            )}
            <button type="button" onClick={saveMood} disabled={!pick}
              className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[13px] font-bold disabled:opacity-40">저장</button>
          </div>
        }>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {MOODS.map((m) => (
            <button key={m.key} type="button" onClick={() => setPick(m.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${
                pick === m.key ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              <span className="text-[16px]">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={200}
          placeholder="메모(선택) — 왜 그렇게 들어갔나, 무엇을 배웠나"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] resize-none" />
      </BottomSheet>

      {!mounted && <div className="skeleton h-40 mt-3" />}
    </div>
  );
}

function TradeRow({ p, mood, border, onEdit }: { p: ClosedPosition; mood?: TradeMood; border: boolean; onEdit: () => void }) {
  const meta = mood ? MOOD_BY_KEY.get(mood.mood) : null;
  return (
    <button type="button" onClick={onEdit}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 bg-[var(--bg-card)] active:bg-[var(--surface-2)] transition-colors ${border ? 'border-t border-[var(--line-2)]' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 flex-wrap">
          <b className="text-[13px] text-[var(--text)]">{coinName(p.symbol)}</b>
          <SideBadge side={p.side} />
          {meta && <span className="text-[11px]">{meta.emoji} {meta.label}</span>}
        </span>
        <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
          {kstDateTime(p.closeTs)} · {fmtCoinPrice(p.openAvg)} → {fmtCoinPrice(p.closeAvg)} · {fmtHold(p.closeTs - p.openTs)}
        </span>
      </span>
      <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: pnlColor(p.netProfit) }}>{fmtPnl(p.netProfit)}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[var(--text-muted)] text-[11px] mb-0.5">{label}</p>
      <p className="font-bold tabular-nums text-[var(--text)]">{value}</p>
    </div>
  );
}
