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
import { useTradeTags } from '@/hooks/useTradeTags';
import { useSnapshots } from '@/hooks/useSnapshots';
import SnapshotField from '@/components/SnapshotField';
import { MOODS, MOOD_BY_KEY, type MoodKey } from '@/lib/tradeMood';
import { SETUPS, MISTAKES, SETUP_BY_KEY, MISTAKE_BY_KEY, tagStats, convictionStats, convictionBySetup, convictionByMistake, convictionCoaching, tagDistribution, CONVICTIONS, hasAnyTag, type TagStat, type TagMeta } from '@/lib/tradeTags';
import { monthlyStats, moodStats, kstMonth } from '@/lib/tradeReport';
import BreakdownTables from '@/components/BreakdownTables';
import { weekdayHourHeatmap, kstParts, bandOf, rowKeyOf, notionalQuartileEdges, HOUR_BANDS, HOLD_BANDS, WEEKDAYS, type BreakItem } from '@/lib/tradeBreakdown';
import WeekdayHourHeatmap, { type HeatSel } from '@/components/WeekdayHourHeatmap';
import ConvictionCard from '@/components/ConvictionCard';
import SetupConvictionCard from '@/components/SetupConvictionCard';
import type { BreakRowSel } from '@/components/BreakdownTables';
import EquityCurveLazy from '@/components/EquityCurveLazy';
import CalendarHeatmap from '@/components/CalendarHeatmap';
import { streaks, resultOf, edgeSummary, kstDateKey, afterLossStreaks, tradesPerDay, type TradeValue } from '@/lib/journalAnalytics';
import TradesPerDayCard from '@/components/TradesPerDayCard';
import EdgeSummaryCard from '@/components/EdgeSummaryCard';
import CostCard from '@/components/CostCard';
import ExcursionPanel from '@/components/ExcursionPanel';
import { costBreakdown, costByHoldBand, cashFlow, type CashMove } from '@/lib/tradeCosts';
import AfterLossTable from '@/components/AfterLossTable';
import ExcursionSummaryCard from '@/components/ExcursionSummaryCard';
import { useRiskLimits } from '@/hooks/useRiskLimits';
import { toCsv, downloadCsv, kstDateTime as csvTime, kstStamp } from '@/lib/csv';
import { fmtCoinPrice } from '@/lib/coins';
import type { ClosedPosition } from '@/app/api/bitget/history/route';

const UP = '#ff4433';
const DOWN = '#1c6cff';
const COIN_NAME: Record<string, string> = {
  BTCUSDT: '비트코인', ETHUSDT: '이더리움', XRPUSDT: '리플', SOLUSDT: '솔라나',
};
const coinName = (s: string) => COIN_NAME[s] ?? s.replace(/USDT$/, '');

const SIZE_NAMES = ['작은(하위25%)', '중하', '중상', '큰(상위25%)'];
/** 손익 분해 표 행 key → 사람이 읽는 라벨(드릴다운 제목용) */
function rowLabel(sel: BreakRowSel): string {
  const { tab, key } = sel;
  if (tab === 'wd') return `${WEEKDAYS[Number(key.slice(2))]}요일`;
  if (tab === 'hour') return HOUR_BANDS[Number(key.slice(1))]?.label ?? key;
  if (tab === 'hold') return HOLD_BANDS[Number(key.slice(2))]?.label ?? key;
  if (tab === 'sym') return coinName(key);
  if (tab === 'side') return key === 'long' ? '롱' : '숏';
  if (tab === 'stop') return key === 'stop' ? '손절 걸어둠' : '손절 없이';
  if (tab === 'size') return `규모 ${SIZE_NAMES[Number(key.slice(2))] ?? key}`;
  return key;
}

/** 현재 열린 포지션(/api/bitget/positions) — positionId가 없어 기분 키는 open-심볼-방향 */
interface OpenPosition {
  symbol: string; side: 'long' | 'short'; size: number; openAvg: number;
  markPrice: number; leverage: number; unrealizedPL: number;
  liquidationPrice: number; liqDistPct: number | null;
}
const openId = (p: OpenPosition) => `open-${p.symbol}-${p.side}`;

const fmtPnl = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}`;
// 차트·달력용 금액 표기(부호는 컴포넌트가 붙임) — 큰 값은 천단위, 작은 값은 소수 2자리
/** 조회 기간을 날짜로 — "최근 30일"만 쓰면 연간 합계로 오해하기 쉽다 */
function periodLabel(days: number): string {
  const d = (ms: number) => { const x = new Date(ms + 9 * 3600_000); return `${x.getUTCFullYear()}.${x.getUTCMonth() + 1}.${x.getUTCDate()}`; };
  const now = Date.now();
  return `${d(now - days * 86_400_000)}~${d(now)}(최근 ${days}일)`;
}
const fmtUsdt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));
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
  const { tags, saveTags, clearTags } = useTradeTags();
  const snaps = useSnapshots();
  const { limits } = useRiskLimits(); // 서킷브레이커 연패 기준(사용자 설정) — 연패 분석 마지막 줄을 같은 선으로
  const [days, setDays] = useState(30);
  const [positions, setPositions] = useState<ClosedPosition[]>([]);
  const [open, setOpen] = useState<OpenPosition[]>([]);
  const [moves, setMoves] = useState<{ withdrawals: CashMove[]; deposits: CashMove[] } | null>(null); // 입출금(비용 분석 '출금')
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selMonth, setSelMonth] = useState<string | null>(null); // 펼쳐진 월(null=전부 접힘)
  const [selDay, setSelDay] = useState<string | null>(null);     // 달력에서 펼친 날짜(KST 'YYYY-MM-DD')
  const [selCell, setSelCell] = useState<HeatSel | null>(null);  // 히트맵에서 펼친 요일×시간대 칸
  const [selRow, setSelRow] = useState<BreakRowSel | null>(null); // 손익 분해 표에서 펼친 행

  // 기분 편집 시트 — 열린/청산 포지션 공통으로 { id, symbol } 을 편집한다
  const [editing, setEditing] = useState<{ id: string; symbol: string } | null>(null);
  const [pick, setPick] = useState<MoodKey | null>(null);
  const [note, setNote] = useState('');
  const [selSetups, setSelSetups] = useState<string[]>([]);
  const [selMistakes, setSelMistakes] = useState<string[]>([]);
  const [selConv, setSelConv] = useState<number | null>(null);
  useEffect(() => {
    if (!editing) return;
    const cur = moods[editing.id];
    setPick(cur?.mood ?? null);
    setNote(cur?.note ?? '');
    const t = tags[editing.id];
    setSelSetups(t?.setups ?? []);
    setSelConv(t?.conviction ?? null);
    setSelMistakes(t?.mistakes ?? []);
  }, [editing, moods, tags]);
  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const load = useCallback(async (d: number) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const [hRes, pRes, tRes] = await Promise.all([
        fetch(`/api/bitget/history?days=${d}`),
        fetch('/api/bitget/positions').catch(() => null),
        fetch(`/api/bitget/transfers?days=${d}`).catch(() => null),
      ]);

      // 입출금 — best-effort(지갑 읽기 권한이 없으면 출금 블록만 숨김)
      let mv: { withdrawals: CashMove[]; deposits: CashMove[] } | null = null;
      if (tRes && tRes.ok) {
        try { const tj = await tRes.json() as { withdrawals?: CashMove[]; deposits?: CashMove[]; error?: string }; if (!tj.error && Array.isArray(tj.withdrawals)) mv = { withdrawals: tj.withdrawals, deposits: tj.deposits ?? [] }; } catch { /* 무시 */ }
      }
      setMoves(mv);

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
    holdMs: p.openTs && p.closeTs > p.openTs ? p.closeTs - p.openTs : null, // 보유시간 분해용
    side: p.side,                                                             // 롱/숏 분해용
    hasStop: p.stop != null,                                                  // 손절 주문 유무 분해용
    notional: p.size * p.openAvg,                                             // 진입 규모 분해용
  })), [positions]);

  // 자산 곡선·달력 히트맵 — 청산 시각 기준 실현손익(수수료·펀딩 반영 netProfit USDT)
  const analyticsTrades: TradeValue[] = useMemo(() => positions.map((p) => ({ ts: p.closeTs, value: p.netProfit })), [positions]);
  // 연속 승/패 — 청산 시간순(오래된 것 → 최신)
  // 성적 요약 — 승률·손익비·Profit Factor·기대값(순손익 USDT, 수수료·펀딩 반영)
  const edge = useMemo(() => edgeSummary(positions.map((p) => p.netProfit)), [positions]);
  // 하루 매매 횟수별 — 진입 시각(KST) 기준 과매매 확인
  const perDay = useMemo(() => tradesPerDay(positions.map((p) => ({ ts: p.openTs || p.closeTs, value: p.netProfit }))), [positions]);
  // 비용 분석 — 수수료·펀딩이 손익에서 차지하는 비중
  const costs = useMemo(() => costBreakdown(positions), [positions]);
  const holdCosts = useMemo(() => costByHoldBand(positions), [positions]);
  const cash = useMemo(() => (moves ? cashFlow(moves.withdrawals, moves.deposits, costs.net) : null), [moves, costs.net]);
  // 연패 직후 매매 — 진입 규모 = 수량 × 진입가
  const streakCap = Math.min(5, Math.max(2, limits.maxConsecutiveLosses || 3));
  const afterLoss = useMemo(() => afterLossStreaks(positions.map((p) => ({ openTs: p.openTs, closeTs: p.closeTs, value: p.netProfit, notional: p.size * p.openAvg })), streakCap), [positions, streakCap]);
  // 편집 시트가 연 매매가 거래소 청산 매매면 MAE/MFE 를 보여 준다(현재 포지션 open-… 은 제외)
  const editingPos = useMemo(() => (editing ? positions.find((p) => p.positionId === editing.id) ?? null : null), [editing, positions]);
  // 달력에서 고른 날의 청산 매매(청산 시각 KST 기준 — 달력 색과 같은 기준)
  const dayTrades = useMemo(() => (selDay ? positions.filter((p) => kstDateKey(p.closeTs) === selDay).sort((a, b) => a.closeTs - b.closeTs) : []), [positions, selDay]);
  const streak = useMemo(() => streaks([...positions].sort((a, b) => a.closeTs - b.closeTs).map((p) => resultOf(p.netProfit))), [positions]);
  // 셋업·실수 태그별 성적 — 로드된 청산 포지션 전체
  const heatmap = useMemo(() => weekdayHourHeatmap(breakItems), [breakItems]);
  const convStats = useMemo(() => convictionStats(positions, tags), [positions, tags]);
  const convBySetup = useMemo(() => convictionBySetup(positions, tags), [positions, tags]);
  const convByMistake = useMemo(() => convictionByMistake(positions, tags), [positions, tags]);
  const coaching = useMemo(() => convictionCoaching(positions, tags), [positions, tags]);
  const setupStats = useMemo(() => tagStats(positions, tags, 'setup'), [positions, tags]);
  const mistakeStats = useMemo(() => tagStats(positions, tags, 'mistake'), [positions, tags]);
  // 히트맵 칸 드릴다운 — 선택한 요일×시간대에 '진입'한 청산 매매(집계와 같은 진입 시각·KST 기준)
  const cellTrades = useMemo(() => {
    if (!selCell) return [];
    return positions.filter((p) => {
      const { wd, hour } = kstParts(p.openTs || p.closeTs);
      return wd === selCell.wd && bandOf(hour) === selCell.band;
    }).sort((a, b) => (a.openTs || a.closeTs) - (b.openTs || b.closeTs));
  }, [selCell, positions]);
  // 손익 분해 표 행 드릴다운 — breakItems 와 같은 rowKeyOf 로 그 행 매매만(규모 탭은 분위수 경계 공유)
  const sizeEdges = useMemo(() => notionalQuartileEdges(breakItems), [breakItems]);
  const rowTrades = useMemo(() => {
    if (!selRow) return [];
    return positions.filter((p) => {
      const it: BreakItem = { ts: p.openTs || p.closeTs, symbol: p.symbol, value: p.netProfit, win: null,
        holdMs: p.openTs && p.closeTs > p.openTs ? p.closeTs - p.openTs : null, side: p.side, hasStop: p.stop != null, notional: p.size * p.openAvg };
      return rowKeyOf(selRow.tab, it, sizeEdges) === selRow.key;
    }).sort((a, b) => (a.openTs || a.closeTs) - (b.openTs || b.closeTs));
  }, [selRow, positions, sizeEdges]);

  // CSV 내보내기 — 거래소 청산 내역 + 이 기기의 기분·태그 기록(엑셀용 BOM·KST)
  const exportCsv = () => {
    const rows = [...positions].sort((a, b) => a.closeTs - b.closeTs).map((p) => {
      const m = moods[p.positionId];
      const tg = tags[p.positionId];
      const setupLabels = (tg?.setups ?? []).map((k) => SETUP_BY_KEY.get(k)?.label ?? k).join(' / ');
      const mistakeLabels = (tg?.mistakes ?? []).map((k) => MISTAKE_BY_KEY.get(k)?.label ?? k).join(' / ');
      return [csvTime(p.openTs), csvTime(p.closeTs), p.symbol, coinName(p.symbol), p.side === 'long' ? '롱' : '숏',
        p.openAvg, p.closeAvg, +p.netProfit.toFixed(4), +p.fee.toFixed(4), +p.funding.toFixed(4),
        m ? MOOD_BY_KEY.get(m.mood)?.label ?? m.mood : '', setupLabels, mistakeLabels, m?.note ?? '', p.positionId];
    });
    downloadCsv(`매매일지_코인선물_${days}일_${kstStamp()}.csv`, toCsv(
      ['진입(KST)', '청산(KST)', '심볼', '이름', '방향', '진입가', '청산가', '순손익(USDT)', '수수료', '펀딩', '진입 기분', '셋업', '실수', '메모', '포지션ID'], rows));
  };

  const saveAnnotation = () => {
    if (!editing) return;
    if (pick) setMood(editing.id, pick, note);
    saveTags(editing.id, selSetups, selMistakes, selConv);
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
          <h2 className="text-sm font-bold text-[var(--text)] mb-2">현재 포지션 <span className="text-[10px] font-normal text-[var(--text-muted)]">미청산 · 눌러서 기분·태그 기록</span></h2>
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
                      <TagEmojis set={tags[id]} />
                      {snaps.ids.has(id) && <span className="text-[11px] text-[var(--faint)]" title="차트 이미지 있음">📎</span>}
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

      {/* 손익 분해 — 요일·시간대·종목별(청산 건). 행을 누르면 그 구간 매매가 펼쳐짐 */}
      {positions.length > 0 && (
        <BreakdownTables items={breakItems} unit="USDT" valueLabel="순손익" fmt={fmtPnl}
          sub={`최근 ${days}일 청산 ${positions.length}건 · 진입 시각(KST) 기준`}
          selectedRow={selRow} onSelectRow={setSelRow}
          renderDetail={(sel) => (
            <BucketTrades title={rowLabel(sel)} trades={rowTrades} moods={moods} tags={tags} snapIds={snaps.ids}
              note="행을 누르면 기분·태그·스냅샷 기록"
              onEdit={(p) => setEditing({ id: p.positionId, symbol: p.symbol })} onClose={() => setSelRow(null)} />
          )} />
      )}

      {/* 요일 × 시간대 히트맵 — 어느 요일·시간에 벌고 잃었나 (칸 클릭 → 그 칸 매매 드릴다운) */}
      {positions.length > 0 && heatmap.cells.length > 0 && (
        <WeekdayHourHeatmap h={heatmap} fmt={fmtPnl} sub={`최근 ${days}일 · 진입 시각(KST) 기준`}
          selected={selCell} onSelect={(c) => setSelCell((cur) => (cur && cur.wd === c.wd && cur.band === c.band ? null : c))}
          detail={<BucketTrades title={selCell ? `${WEEKDAYS[selCell.wd]}요일 ${HOUR_BANDS[selCell.band].label}` : null} trades={cellTrades}
            moods={moods} tags={tags} snapIds={snaps.ids} note="진입 시각(KST) 기준 · 행을 누르면 기분·태그·스냅샷 기록"
            onEdit={(p) => setEditing({ id: p.positionId, symbol: p.symbol })} onClose={() => setSelCell(null)} />} />
      )}

      {/* 자산 곡선 · 연속 승패 · 일별 손익 달력 — 청산 시각 기준 실현손익 */}
      {positions.length > 0 && (
        <>
          {(streak.maxWin > 0 || streak.maxLoss > 0) && (
            <div className="fin-card px-4 py-3 mb-3 flex items-center gap-4 text-[12px] flex-wrap">
              <span className="font-bold text-[var(--text)]">연속 승/패</span>
              <span className="text-[var(--text-muted)]">최대 연승 <b className="tabular-nums" style={{ color: 'var(--warn)' }}>{streak.maxWin}</b></span>
              <span className="text-[var(--text-muted)]">최대 연패 <b className="tabular-nums" style={{ color: 'var(--accent-ink)' }}>{streak.maxLoss}</b></span>
              {streak.current !== 0 && (
                <span className="ml-auto text-[var(--text-muted)]">현재{' '}
                  <b className="tabular-nums" style={{ color: streak.current > 0 ? 'var(--warn)' : 'var(--accent-ink)' }}>
                    {streak.current > 0 ? `${streak.current}연승` : `${-streak.current}연패`}
                  </b>
                </span>
              )}
            </div>
          )}
          <EdgeSummaryCard e={edge} unit="USDT" fmt={fmtUsdt} sub={`최근 ${days}일 청산 ${edge.n}건 · 순손익 USDT(수수료·펀딩 반영)`} />
          <CostCard c={costs} fmt={fmtUsdt} holdRows={holdCosts} cash={cash} sub={`${periodLabel(days)} 청산 ${costs.n}건 · 거래소 수수료·펀딩`} />
          <TradesPerDayCard rows={perDay} fmt={fmtUsdt} />
          <AfterLossTable rows={afterLoss} fmt={fmtUsdt} breakerAt={limits.maxConsecutiveLosses} />
          <ExcursionSummaryCard trades={positions} />
          <EquityCurveLazy trades={analyticsTrades} unit="USDT" fmt={fmtUsdt} />
          <CalendarHeatmap trades={analyticsTrades} unit="USDT" fmt={fmtUsdt} selected={selDay} onSelect={setSelDay}
            detail={<DayTrades date={selDay} trades={dayTrades} moods={moods} tags={tags} snapIds={snaps.ids}
              onEdit={(p) => setEditing({ id: p.positionId, symbol: p.symbol })} onClose={() => setSelDay(null)} />} />
        </>
      )}

      {/* 셋업·실수 태그별 성적 — 어떤 셋업이 돈이 되고 어떤 실수가 깎나 */}
      {positions.length > 0 && (setupStats.length > 0 || mistakeStats.length > 0) && (
        <section className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TagStatTable title="셋업별 성적" sub="왜 들어갔나" stats={setupStats} />
          <TagStatTable title="실수별 성적" sub="무엇을 잘못했나" stats={mistakeStats} />
        </section>
      )}
      {positions.length > 0 && setupStats.length === 0 && mistakeStats.length === 0 && (
        <p className="text-[11px] text-[var(--faint)] mb-5 px-1 leading-relaxed">
          매매 행을 눌러 <b className="text-[var(--text-muted)]">셋업·실수 태그</b>를 달면 "어떤 셋업이 돈이 되고 어떤 실수가 깎나"가 여기 집계됩니다(참고: Edgewonk·TraderSync).
        </p>
      )}

      {/* 확신 보정 종합 한 줄 — 확신별·셋업×확신·실수×확신을 묶은 코칭 */}
      {positions.length > 0 && convStats.length > 0 && (() => {
        const style = coaching.verdict === 'calibrated' ? 'border-emerald-500/40 bg-emerald-500/5'
          : coaching.verdict === 'overconfident' ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-[var(--border)] bg-[var(--surface-2)]';
        const emoji = coaching.verdict === 'calibrated' ? '🎯' : coaching.verdict === 'overconfident' ? '⚠️' : coaching.verdict === 'insufficient' ? '📊' : '🤔';
        return (
          <div className={`rounded-2xl border p-4 mb-3 ${style}`}>
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">{emoji}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-[var(--text)] mb-0.5">확신 보정 <span className="font-normal text-[var(--text-muted)]">— 확신이 결과와 맞는 편인가</span></p>
                <p className="text-[12px] text-[var(--text)] leading-relaxed">{coaching.text}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 확신(신뢰도 1~5)별 성적 */}
      {positions.length > 0 && convStats.length > 0 && (
        <ConvictionCard rows={convStats} fmt={fmtUsdt} sub={`최근 ${days}일 · 확신 매긴 ${convStats.reduce((a, r) => a + r.count, 0)}건`} />
      )}

      {/* 셋업 × 확신 교차 — 어떤 셋업에서 확신이 잘 맞았나 */}
      {positions.length > 0 && convBySetup.length > 0 && (
        <SetupConvictionCard rows={convBySetup} fmt={fmtUsdt} sub={`최근 ${days}일 · 셋업+확신 둘 다 매긴 매매`} />
      )}

      {/* 실수 × 확신 교차 — 어떤 실수가 어떤 확신대에서 나왔나(과신 점검) */}
      {positions.length > 0 && convByMistake.length > 0 && (
        <SetupConvictionCard kind="mistake" rows={convByMistake} fmt={fmtUsdt} sub={`최근 ${days}일 · 실수+확신 둘 다 매긴 매매`} />
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

                      {/* 거래내역(그 달, 청산 성적) — 행을 눌러 기분·태그 기록 */}
                      <div className="mt-4">
                        <h3 className="text-[12px] font-bold text-[var(--text)] mb-1.5">거래내역 <span className="text-[10px] font-normal text-[var(--text-muted)]">행을 눌러 기분·태그 기록</span></h3>
                        <div className="rounded-xl border border-[var(--line-2)] overflow-hidden">
                          {trades.map((p, j) => (
                            <TradeRow key={p.positionId} p={p} mood={moods[p.positionId]} tagset={tags[p.positionId]} hasSnap={snaps.ids.has(p.positionId)} border={j > 0}
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
        기분·셋업·실수 태그는 이 브라우저에만 저장되며 <Link href="/virtual" className="text-sky-400 hover:underline">가상투자·백업</Link>에서 관리합니다. 읽기 전용 조회이며 주문은 하지 않습니다.
      </p>

      {/* 기분·셋업·실수 편집 시트 */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `${coinName(editing.symbol)} · 복기 기록` : ''}
        footer={
          <div className="flex items-center gap-2">
            {editing && (moods[editing.id] || tags[editing.id]) && (
              <button type="button" onClick={() => { clearMood(editing.id); clearTags(editing.id); setEditing(null); }}
                className="px-3 py-2.5 rounded-xl border border-[var(--border)] text-[13px] text-red-400 font-semibold">삭제</button>
            )}
            <button type="button" onClick={saveAnnotation} disabled={!editing}
              className="flex-1 px-3 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[13px] font-bold disabled:opacity-40">저장</button>
          </div>
        }>
        <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">진입 당시 기분</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {MOODS.map((m) => (
            <button key={m.key} type="button" onClick={() => setPick(pick === m.key ? null : m.key)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${
                pick === m.key ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              <span className="text-[16px]">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">셋업 <span className="font-normal">· 왜 들어갔나(여러 개 가능)</span></p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SETUPS.map((t) => (
            <TagChip key={t.key} meta={t} on={selSetups.includes(t.key)} onClick={() => toggle(selSetups, setSelSetups, t.key)} tone="setup" />
          ))}
        </div>

        <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">실수 <span className="font-normal">· 무엇을 잘못했나(여러 개 가능)</span></p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {MISTAKES.map((t) => (
            <TagChip key={t.key} meta={t} on={selMistakes.includes(t.key)} onClick={() => toggle(selMistakes, setSelMistakes, t.key)} tone="mistake" />
          ))}
        </div>

        <p className="text-[11px] font-bold text-[var(--text-muted)] mb-1.5">확신(신뢰도) <span className="font-normal">· 진입 당시 얼마나 확신했나</span></p>
        <div className="flex gap-1.5 mb-4">
          {CONVICTIONS.map((c) => (
            <button key={c.level} type="button" onClick={() => setSelConv(selConv === c.level ? null : c.level)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[11px] font-semibold transition-colors ${
                selConv === c.level ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-muted)]'
              }`}>
              <span className="text-[16px]">{c.emoji}</span>{c.level}
            </button>
          ))}
        </div>

        <div className="mb-4">
          {editing && <SnapshotField id={editing.id} has={snaps.ids.has(editing.id)} onSave={snaps.save} onRemove={snaps.remove} onLoad={snaps.load} />}
        </div>

        {editingPos && (
          <div className="mb-4">
            <ExcursionPanel t={editingPos} />
          </div>
        )}

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={200}
          placeholder="메모(선택) — 왜 그렇게 들어갔나, 무엇을 배웠나"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] resize-none" />
        <p className="text-[10px] text-[var(--faint)] mt-2">메모는 기분을 함께 고를 때 저장됩니다. 셋업·실수 태그·차트 이미지는 기분 없이도 저장돼요(이미지는 이 기기에만).</p>
      </BottomSheet>

      {!mounted && <div className="skeleton h-40 mt-3" />}
    </div>
  );
}

function TradeRow({ p, mood, tagset, hasSnap, border, onEdit }: { p: ClosedPosition; mood?: TradeMood; tagset?: { setups: string[]; mistakes: string[] }; hasSnap?: boolean; border: boolean; onEdit: () => void }) {
  const meta = mood ? MOOD_BY_KEY.get(mood.mood) : null;
  return (
    <button type="button" onClick={onEdit}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-3 bg-[var(--bg-card)] active:bg-[var(--surface-2)] transition-colors ${border ? 'border-t border-[var(--line-2)]' : ''}`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 flex-wrap">
          <b className="text-[13px] text-[var(--text)]">{coinName(p.symbol)}</b>
          <SideBadge side={p.side} />
          {meta && <span className="text-[11px]">{meta.emoji} {meta.label}</span>}
          <TagEmojis set={tagset} />
          {hasSnap && <span className="text-[11px] text-[var(--faint)]" title="차트 이미지 있음">📎</span>}
        </span>
        <span className="block text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
          {kstDateTime(p.closeTs)} · {fmtCoinPrice(p.openAvg)} → {fmtCoinPrice(p.closeAvg)} · {fmtHold(p.closeTs - p.openTs)}
        </span>
      </span>
      <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: pnlColor(p.netProfit) }}>{fmtPnl(p.netProfit)}</span>
    </button>
  );
}

/** 달력에서 고른 날의 청산 매매 — 기존 매매 행을 그대로 써서 누르면 기분·태그·스냅샷 편집 */
function DayTrades({ date, trades, moods, tags, snapIds, onEdit, onClose }: {
  date: string | null;
  trades: ClosedPosition[];
  moods: Record<string, TradeMood>;
  tags: Record<string, { setups: string[]; mistakes: string[] }>;
  snapIds: Set<string>;
  onEdit: (p: ClosedPosition) => void;
  onClose: () => void;
}) {
  if (!date) return null;
  const sum = trades.reduce((a, p) => a + p.netProfit, 0);
  const wins = trades.filter((p) => p.netProfit > 0).length;
  const losses = trades.filter((p) => p.netProfit < 0).length;
  return (
    <div className="mt-3 rounded-xl border border-[var(--line-2)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)]">
        <b className="text-[13px] text-[var(--text)]">{Number(date.slice(5, 7))}월 {Number(date.slice(8, 10))}일</b>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{trades.length}건 · {wins}승 {losses}패</span>
        <span className="ml-auto text-[13px] font-bold tabular-nums" style={{ color: pnlColor(sum) }}>{fmtPnl(sum)} USDT</span>
        <button type="button" onClick={onClose} aria-label="날짜 상세 닫기" className="w-7 h-7 grid place-items-center rounded-lg text-[var(--text-muted)]">✕</button>
      </div>
      {trades.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">이 기간에 불러온 그날 청산 매매가 없습니다.</p>
      ) : trades.map((p, j) => (
        <TradeRow key={p.positionId} p={p} mood={moods[p.positionId]} tagset={tags[p.positionId]} hasSnap={snapIds.has(p.positionId)} border={j > 0}
          onEdit={() => onEdit(p)} />
      ))}
      <p className="px-3 py-1.5 text-[10px] text-[var(--faint)] border-t border-[var(--line-2)]">청산 시각(KST) 기준 · 행을 누르면 기분·태그·스냅샷 기록</p>
    </div>
  );
}

/** 선택한 버킷(히트맵 칸·분해 표 행)에 속한 매매 목록 — 기존 TradeRow 재사용, 누르면 편집 */
function BucketTrades({ title, trades, moods, tags, snapIds, onEdit, onClose, note }: {
  title: string | null;
  trades: ClosedPosition[];
  moods: Record<string, TradeMood>;
  tags: Record<string, { setups: string[]; mistakes: string[] }>;
  snapIds: Set<string>;
  onEdit: (p: ClosedPosition) => void;
  onClose: () => void;
  note?: string;
}) {
  if (!title) return null;
  const sum = trades.reduce((a, p) => a + p.netProfit, 0);
  const wins = trades.filter((p) => p.netProfit > 0).length;
  const losses = trades.filter((p) => p.netProfit < 0).length;
  // 이 구간에 어떤 셋업·실수가 많았나(태그 분포)
  const dist = tagDistribution(trades, tags);
  const chips = [
    ...dist.setups.map((t) => ({ ...t, c: 'var(--accent-ink)' })),
    ...dist.mistakes.map((t) => ({ ...t, c: 'var(--amber)' })),
  ];
  return (
    <div className="mt-3 rounded-xl border border-[var(--line-2)] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)]">
        <b className="text-[13px] text-[var(--text)]">{title}</b>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{trades.length}건 · {wins}승 {losses}패</span>
        <span className="ml-auto text-[13px] font-bold tabular-nums" style={{ color: pnlColor(sum) }}>{fmtPnl(sum)} USDT</span>
        <button type="button" onClick={onClose} aria-label="상세 닫기" className="w-7 h-7 grid place-items-center rounded-lg text-[var(--text-muted)]">✕</button>
      </div>
      {chips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-3 py-1.5 border-b border-[var(--line-2)] bg-[var(--bg-card)]">
          <span className="text-[10px] text-[var(--text-muted)]">태그 분포</span>
          {chips.map((t) => (
            <span key={t.key} className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md border border-[var(--line-2)]" style={{ color: t.c }}>
              {t.emoji} {t.label} <b className="tabular-nums">{t.count}</b>
            </span>
          ))}
        </div>
      )}
      {trades.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-[var(--text-muted)]">이 구간에 해당하는 청산 매매가 없습니다.</p>
      ) : trades.map((p, j) => (
        <TradeRow key={p.positionId} p={p} mood={moods[p.positionId]} tagset={tags[p.positionId]} hasSnap={snapIds.has(p.positionId)} border={j > 0}
          onEdit={() => onEdit(p)} />
      ))}
      <p className="px-3 py-1.5 text-[10px] text-[var(--faint)] border-t border-[var(--line-2)]">{note ?? '행을 누르면 기분·태그·스냅샷 기록'}</p>
    </div>
  );
}

/** 행에 붙는 태그 표식 — 셋업(파랑)·실수(앰버) 이모지 알약 */
function TagEmojis({ set }: { set?: { setups: string[]; mistakes: string[] } }) {
  if (!hasAnyTag(set)) return null;
  const items = [
    ...set!.setups.map((k) => ({ k, e: SETUP_BY_KEY.get(k)?.emoji, c: 'var(--accent-ink)' })),
    ...set!.mistakes.map((k) => ({ k, e: MISTAKE_BY_KEY.get(k)?.emoji, c: 'var(--amber)' })),
  ].filter((x) => x.e);
  return (
    <span className="inline-flex items-center gap-0.5">
      {items.map((x, i) => <span key={i} className="text-[11px]" style={{ color: x.c }}>{x.e}</span>)}
    </span>
  );
}

/** 편집 시트의 태그 선택 칩 — 켜지면 셋업=파랑, 실수=앰버 */
function TagChip({ meta, on, onClick, tone }: { meta: TagMeta; on: boolean; onClick: () => void; tone: 'setup' | 'mistake' }) {
  const color = tone === 'setup' ? 'var(--accent)' : 'var(--amber)';
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-[12px] font-semibold transition-colors"
      style={on
        ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)`, color: 'var(--text)' }
        : { borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
      <span className="text-[13px]">{meta.emoji}</span>{meta.label}
    </button>
  );
}

/** 태그별 성적 표 — 건수·승률·순손익 */
function TagStatTable({ title, sub, stats }: { title: string; sub: string; stats: TagStat[] }) {
  return (
    <div className="fin-card p-4">
      <h3 className="text-[13px] font-bold text-[var(--text)] mb-2">{title} <span className="text-[10px] font-normal text-[var(--text-muted)]">{sub}</span></h3>
      {stats.length === 0 ? (
        <p className="text-[11px] text-[var(--faint)] py-2">아직 태그가 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {stats.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">{s.emoji} {s.label}</span>
              <span className="text-[var(--text-muted)] tabular-nums w-10 text-right">{s.count}건</span>
              <span className="text-[var(--text-muted)] tabular-nums w-11 text-right">{s.winRate != null ? `${s.winRate.toFixed(0)}%` : '—'}</span>
              <span className="font-bold tabular-nums w-20 text-right" style={{ color: s.netSum > 0 ? 'var(--warn)' : s.netSum < 0 ? 'var(--accent-ink)' : 'var(--text)' }}>{fmtPnl(s.netSum)}</span>
            </div>
          ))}
          <p className="text-[10px] text-[var(--faint)] pt-1 leading-relaxed">한 매매에 태그가 여러 개면 각 태그에 모두 반영 · 순손익 USDT</p>
        </div>
      )}
    </div>
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
