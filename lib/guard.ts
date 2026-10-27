/**
 * 포지션 가드 — 매매 **도중에** 규율 위반을 텔레그램으로 알린다(다음 날 아침 복기로는 늦다).
 *
 * 왜 필요한가: 실측(2026-10) 7일 19건 중 18건이 거래소 손절 주문 없이 진입했고, 매매는 대개 1~4시간 안에 끝났다.
 * 기존 감시는 GitHub 크론(설정 15분, 실제 3~5시간 간격)이라 매매가 끝난 뒤에야 돌았다.
 * → Supabase pg_cron 이 5분마다 /api/guard 를 부르고, coin-track 도 같은 runGuard 를 돌린다.
 *   발화 기록은 Supabase kl_sync 의 `guard-state` 한 줄(접두사가 kospi-lab- 가 아니라 기기 동기화엔 안 섞임)을 공유해 중복 없음.
 *
 * 알림(고정 규칙):
 *   🚧 손절 주문 없음 — 진입 3분 뒤에도 거래소 SL(플랜 주문)도, 매매일지 계획 손절도 없으면. 2시간마다 다시.
 *   ↩️ 1H 추세 역행 진입 — 진입 시점에 완성된 1H 봉 기준 EMA 역배열+EMA20 아래에서 롱(반대도). 포지션당 1회.
 *   🔁 복구 매매 — 손실 청산 30분 안에 새 진입. 포지션당 1회.
 *   🛑/🚨 청산가까지 15%/8% — 6시간/1시간마다.
 *   ⚠/🔔/🎯 매매일지 계획 손절 도달·근접(0.7%)·목표 도달 — 6시간마다.
 *   🛑/🟡 서킷브레이커 — 연속 손절·오늘 손실 한도. 사용자가 한도를 안 정했으면 **오늘 손실 한도 = 계좌 평가금의 3%**(가정, 메시지에 명시). 하루 1회.
 *   💸 손절폭 대비 왕복 수수료 큼(1R의 25%↑) — 손절가마다 1회. ⏱ 오늘(KST) 1시간 미만 매매 3건째부터 건수마다 1회.
 *   알림마다 해당 화면 링크(👉). 🚨·⚡ 경보는 보낸 뒤 결과를 guard-alert-log 에 쌓는다(lib/alertLog — 실전 성적).
 * 방향 예측은 하지 않는다 — "지금 규칙을 어기고 있다"만 알린다.
 */
import { bitgetSignedGet, bitgetKeysConfigured } from './bitget';
import { fetchClosedPositions, type ClosedPosition } from './bitgetPositions';
import { evaluateBreaker, DEFAULT_LIMITS, type BreakerLimits } from './circuitBreaker';
import { analyzeTimeframe, tfTrend, atr } from './coinAnalysis';
import { latestShock, type Bar } from './crashPrecursor';
import precursorStats from '../public/data/precursor-stats.json';
import warningStats from '../public/data/crash-warning-stats.json';
import { fetchLiveFlags, type Flags } from './crashWarning';
import { FEE_RISK_WARN } from './positionSizing';
import { appendAlerts, dueAt, resolveWarn, resolveShock, summarizeAlertLog, type AlertLog, type AlertLogEntry, type AlertLogSummary } from './alertLog';

export interface OpenPos {
  symbol: string; side: 'long' | 'short'; openTs: number; entry: number;
  mark: number; liq: number;
  /** 진입 시점 1H 추세(모르면 null) */
  h1Trend: 'up' | 'down' | 'flat' | null;
  /** 보유 수량(코인) — 손절 제안의 리스크 계산용 */
  size?: number;
  /** 지금 1H ATR(14) — 손절 제안용 */
  atr1h?: number | null;
  /** 최근 30분 안 하락 충격봉(lib/crashPrecursor.latestShock) — 롱 보유 중 경고용 */
  shock?: { ts: number; dir: 'down' | 'up'; rangePct: number; volX: number } | null;
  /** 폭락 조기 경보 체크리스트(lib/crashWarning, 롱일 때만 조회) */
  warn?: Flags | null;
}

/**
 * 손절 제안: ATR 배수. 근거(2026-10-23 실측, 60일 108건 전부, lib/counterfactual.stopSweep 사전 규칙):
 * 손절+자본 1% 수량 방식에서 ×1.2/1.8/2.5/3.0 모두 앞·뒤 절반 플러스였고 ×1.2가 두 절반 모두 최고(+87/+63, 비용 제외).
 * 단 최근 30일(72건)만 보면 두 절반 모두 플러스인 배수가 없다 — 기간에 따라 갈리므로 '×1.2가 낫다'는 근거는 약하고, 바꿀 근거도 없어 유지.
 * 같은 수량 그대로 손절만 거는 건 어느 배수·기간에서도 실제보다 못했다 → 손절과 수량을 같이 제안한다. 매매일지 '손절 배수 비교'가 꾸준히 다른 배수를 고르면 재검토.
 */
export const SL_ATR_MULT = 1.2;
/**
 * 넓은 대안 배수 — 최근 30일 '규칙대로였다면'에서 ×1.2 손절이 회복할 매매를 9건 끊었다(PROJECT_STATUS 대기 항목).
 * 기본 제안은 바꾸지 않고(바꿀 측정 근거 없음) 같은 1% 리스크로 넓게 거는 선택지를 나란히 보여 준다 — 넓히면 수량이 줄어 손실 크기는 같다.
 */
export const SL_ALT_MULT = 1.8;
/** 수량 제안: 평가금 대비 1회 리스크 % */
export const RISK_PCT = 1;

export interface StopSuggestion { stop: number; fromMark: boolean; qtyAtRisk: number | null; curRiskPct: number | null }
/**
 * 순수 — 손절 미설정 포지션에 걸 손절가·수량 제안. 진입가 ∓ 1.2×ATR(1H)이 원칙이고,
 * 가격이 이미 그 자리를 지나 있으면(손실이 더 깊으면) 현재가 ∓ 1.2×ATR 로 바꿔 제안한다(fromMark).
 * qtyAtRisk = 평가금 1% 를 그 손절 폭으로 나눈 수량, curRiskPct = 지금 수량으로 그 손절에 닿으면 평가금 대비 손실 %.
 */
export function suggestStop(p: Pick<OpenPos, 'side' | 'entry' | 'mark' | 'size' | 'atr1h'>, equity: number | null, mult = SL_ATR_MULT): StopSuggestion | null {
  const a = p.atr1h;
  if (!a || !(a > 0) || !(p.entry > 0)) return null;
  const long = p.side === 'long';
  const fromEntry = long ? p.entry - mult * a : p.entry + mult * a;
  const passed = p.mark > 0 && (long ? p.mark <= fromEntry : p.mark >= fromEntry);
  const stop = passed ? (long ? p.mark - mult * a : p.mark + mult * a) : fromEntry;
  const risk = Math.abs(p.entry - stop);
  const qtyAtRisk = equity && equity > 0 && risk > 0 ? (equity * RISK_PCT) / 100 / risk : null;
  const curRiskPct = equity && equity > 0 && p.size && p.size > 0 ? ((p.size * risk) / equity) * 100 : null;
  return { stop, fromMark: passed, qtyAtRisk, curRiskPct };
}

/**
 * 왕복 수수료 경고 — 손절폭이 좁으면 수수료가 1R(손절 시 손실)의 큰 몫이 된다. 산수이지 측정된 신호가 아니다.
 * 요율: 이 계정 실측 테이커 0.040%(2026-10-26, 30일 체결 238건 청산 기준 — lib/feeDiag). 진입·청산 모두 시장가 가정.
 * 비율 c = 왕복 수수료 ÷ 1R 이면 1:1 매매의 본전 승률 = (1 + c) / 2 (c 0.25 → 62.5%).
 * 참고(10-26, 60일 중 손절가 복구된 16건): 비율 중앙값 0.23, ≥0.25 인 6건 순손익 −151 — 표본이 작아 기준값 근거는 아님.
 */
export const FEE_TAKER_RATE = 0.0004;
export { FEE_RISK_WARN };
export interface FeeRisk { cost: number; risk: number; ratio: number; stopPct: number; breakEvenWinPct: number }
/** 순수 — 손절가가 진입가의 손실 쪽에 있을 때만 계산(본전 위로 올린 추적 손절은 null) */
export function feeRisk(p: Pick<OpenPos, 'side' | 'entry' | 'size'>, stop: number, rate = FEE_TAKER_RATE): FeeRisk | null {
  if (!(p.entry > 0) || !(stop > 0) || !p.size || !(p.size > 0)) return null;
  if (p.side === 'long' ? stop >= p.entry : stop <= p.entry) return null;
  const risk = Math.abs(p.entry - stop) * p.size;
  const cost = p.entry * p.size * rate * 2;
  const ratio = cost / risk;
  return { cost, risk, ratio, stopPct: (Math.abs(p.entry - stop) / p.entry) * 100, breakEvenWinPct: ((1 + ratio) / 2) * 100 };
}

const px = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : v >= 1 ? v.toFixed(3) : v.toPrecision(4));
const qty = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toPrecision(2));

export interface PlanStop { symbol: string; side: 'long' | 'short'; id: string; name?: string; stop: number; target1: number; target2: number }
export interface GuardInput {
  now: number;
  positions: OpenPos[];
  /** 거래소 SL/TP 플랜 주문이 걸린 심볼(정규화). 조회 실패면 null → 손절 경고 생략(오탐 방지) */
  slSymbols: Set<string> | null;
  /** 거래소 손절 주문 트리거가 — 키 `${심볼}:${long|short}` (먼저 닿는 것). 왕복 수수료 경고용, 없으면 일지 계획 손절만 */
  slStops?: Record<string, number>;
  journal: PlanStop[];
  /** openTs·fee·grossPnl 은 단타 횟수 경고용(없으면 그 경고만 생략) */
  closed: (Pick<ClosedPosition, 'symbol' | 'netProfit' | 'closeTs'> & Partial<Pick<ClosedPosition, 'openTs' | 'fee' | 'grossPnl'>>)[];
  limits: BreakerLimits | null;
  equity: number | null;
}
export interface GuardState { fired: Record<string, number> }
export interface GuardAlert { key: string; text: string }

export const SL_GRACE_MS = 3 * 60_000;
export const DEFAULT_DAILY_LOSS_PCT = 3;
const KST = 9 * 3600e3;
const H = 3600e3;
export const normSym = (x: string) => (x || '').toUpperCase().replace(/_.*$/, '').replace(/[^A-Z0-9]/g, '');
const kstDayStart = (ts: number) => Math.floor((ts + KST) / 86_400_000) * 86_400_000 - KST;
const base = (s: string) => s.replace('USDT', '');
const ago = (ms: number) => (ms < 90 * 60_000 ? `${Math.round(ms / 60_000)}분` : `${(ms / H).toFixed(1)}시간`);
const fmt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
/** 알림에서 바로 해당 화면으로 — 텔레그램 HTML 링크 */
export const APP_BASE = 'https://kospi-lab.vercel.app';
const link = (path: string, label: string) => `\n👉 <a href="${APP_BASE}${path}">${label}</a>`;
const coinLink = (sym: string) => link(`/coin-analysis?symbol=${normSym(sym)}`, `${base(normSym(sym))} 분석`);
/** 단타(보유 1시간 미만) 경고 — 오늘(KST) 이 건수째부터 한 건 늘 때마다 */
export const SCALP_MAX_MS = 3600e3;
export const SCALP_WARN_N = 3;

/** 순수 — 이번 회차에 보낼 알림과 갱신된 상태 */
export function evaluateGuard(inp: GuardInput, state: GuardState): { alerts: GuardAlert[]; state: GuardState } {
  const fired = { ...state.fired };
  const alerts: GuardAlert[] = [];
  const fire = (key: string, every: number, text: string) => {
    if (fired[key] && inp.now - fired[key] < every) return;
    fired[key] = inp.now; alerts.push({ key, text });
  };
  const ONCE = Number.POSITIVE_INFINITY;

  for (const p of inp.positions) {
    // 🚨 폭락 조기 경보(사용자 문서 체크리스트) + 롱 보유 — 이 코인에서 측정상 유의했던 경보만. 6시간에 1번
    if (p.side === 'long' && p.warn) {
      const cards = (warningStats.coins as Record<string, { key: string; verdict: string; precision: number; base: number; lift: number; warnings: number; falseAlarms: number }[]>)[normSym(p.symbol)] ?? [];
      const w = p.warn;
      const on = [w.checklist >= 4 ? 'check4' : null, w.core ? 'core' : null, w.failReclaim ? 'failReclaim' : null, w.h1VolBreak ? 'h1VolBreak' : null, w.btcBreak ? 'btcBreak' : null, w.mtf ? 'mtf' : null]
        .map((k) => cards.find((c) => c.key === k && c.verdict === 'significant')).filter((c): c is NonNullable<typeof c> => !!c);
      if (on.length) {
        const best = on.sort((a, b) => b.lift - a.lift)[0];
        const NAME: Record<string, string> = { check4: `30초 체크리스트 ${w.checklist}개`, core: '상위 약세 + 지지 이탈 + 거래량', failReclaim: '반등 실패 + 새 저점', h1VolBreak: '1H 거래량 4배 + EMA20 아래', btcBreak: 'BTC 15분 지지 이탈', mtf: '일봉·4H·1H 약세' };
        fire(`warn:${normSym(p.symbol)}`, 6 * H, `🚨 <b>${base(p.symbol)} 폭락 조기 경보 — 롱 보유 중</b>
${on.map((c) => NAME[c.key]).join(' · ')}
과거 2년: 60분 안 −3% ${best.precision.toFixed(1)}% (평소 ${best.base.toFixed(1)}%, ${best.lift.toFixed(1)}배) · 오경보 ${Math.round((best.falseAlarms / Math.max(1, best.warnings)) * 100)}%
신규 롱·물타기 보류, 손절 위치부터 확인. <i>과거 빈도 · 숏 신호 아님</i>${coinLink(p.symbol)}`);
      }
    }
    // ⚡ 하락 충격봉 + 롱 보유 — 측정상 2시간 안 추가 하락이 반등보다 잦았다(scripts/precursor-stats.ts). 충격봉당 1회
    if (p.side === 'long' && p.shock?.dir === 'down') {
      const s = precursorStats.pooledShockDown, m = s.n || 1;
      fire(`shock:${normSym(p.symbol)}:${p.shock.ts}`, Number.POSITIVE_INFINITY, `⚡ <b>${base(p.symbol)} 하락 충격봉 — 롱 보유 중</b>
15분봉 거래량 ${p.shock.volX.toFixed(0)}배 · 변동 ${p.shock.rangePct.toFixed(2)}% · 저점 마감
과거 2년 4코인 ${s.n}건: 2시간 안 추가 하락 ${Math.round((s.cont / m) * 100)}% vs 반등 ${Math.round((s.rev / m) * 100)}%
손절 없이 버티거나 물타기 전에 계획부터 확인하세요. <i>과거 빈도 · 방향 예측 아님</i>${coinLink(p.symbol)}`);
    }
    const pid = `${normSym(p.symbol)}:${p.side}:${p.openTs}`;
    const long = p.side === 'long';
    const plan = inp.journal.find((e) => normSym(e.symbol) === normSym(p.symbol) && e.side === p.side);

    // 손절 주문 없음
    if (inp.slSymbols && inp.now - p.openTs >= SL_GRACE_MS && !inp.slSymbols.has(normSym(p.symbol)) && !(plan && plan.stop > 0)) {
      const sg = suggestStop(p, inp.equity);
      const alt = sg ? suggestStop(p, inp.equity, SL_ALT_MULT) : null;
      const hint = sg
        ? `\n💡 제안 손절 <b>${px(sg.stop)}</b> (${sg.fromMark ? '진입가 기준 자리는 이미 지남 → 현재가' : '진입가'} ∓ ${SL_ATR_MULT}×1H ATR)`
          + (sg.qtyAtRisk != null ? `\n평가금 ${RISK_PCT}% 리스크면 수량 ${qty(sg.qtyAtRisk)}${sg.curRiskPct != null ? ` · 지금 수량이면 손절 시 평가금의 ${sg.curRiskPct.toFixed(sg.curRiskPct < 1 ? 2 : 1)}%` : ''}` : '')
          + (alt ? `\n넓게: ${SL_ALT_MULT}×ATR 손절 <b>${px(alt.stop)}</b>${alt.qtyAtRisk != null ? ` · 같은 ${RISK_PCT}% 리스크 수량 ${qty(alt.qtyAtRisk)}` : ''} <i>(흔들기에 덜 털림 · 수량↓)</i>` : '')
        : '';
      fire(`nosl:${pid}`, 2 * H, `🚧 <b>${base(p.symbol)} ${long ? '롱' : '숏'} 손절 주문 없음</b>\n진입 ${ago(inp.now - p.openTs)}째 · 진입가 ${p.entry} · 현재 ${p.mark}${hint}\n거래소 SL(또는 일지 계획 손절)부터 거세요. <i>제안은 변동성 기준 자리일 뿐 방향 판단 아님</i>${coinLink(p.symbol)}`);
    }

    // 💸 왕복 수수료가 1R 대비 큼 — 손절가(거래소 SL 우선, 없으면 일지 계획)마다 1회
    const stopPx = inp.slStops?.[`${normSym(p.symbol)}:${p.side}`] ?? (plan && plan.stop > 0 ? plan.stop : 0);
    const fr = stopPx > 0 ? feeRisk(p, stopPx) : null;
    if (fr && fr.ratio >= FEE_RISK_WARN)
      fire(`fee:${pid}:${stopPx}`, ONCE, `💸 <b>${base(p.symbol)} ${long ? '롱' : '숏'} — 손절폭 대비 수수료 큼</b>
손절 ${px(stopPx)}까지 ${fr.stopPct.toFixed(2)}% · 1R ${fr.risk.toFixed(1)} USDT vs 왕복 수수료 ${fr.cost.toFixed(1)} USDT(<b>${Math.round(fr.ratio * 100)}%</b>)
1:1 매매면 본전 승률 ${fr.breakEvenWinPct.toFixed(1)}% — 손절을 넓히고 수량을 줄이거나, 진입·익절을 지정가로. <i>시장가 ${(FEE_TAKER_RATE * 100).toFixed(2)}% 가정 산수 · 방향 판단 아님</i>${link('/simulate', '계산기에서 손절·수량 다시 보기')}`);

    // 1H 추세 역행
    if (p.h1Trend === (long ? 'down' : 'up'))
      fire(`trend:${pid}`, ONCE, `↩️ <b>${base(p.symbol)} ${long ? '롱' : '숏'} — 1H 추세 역행 진입</b>\n진입 때 1H가 ${long ? '하락' : '상승'} 추세(EMA 역배열)였습니다. 계획한 역추세 매매가 아니라면 크기·손절을 다시 보세요.${coinLink(p.symbol)}`);

    // 복구 매매
    const lastLoss = inp.closed.filter((c) => c.closeTs <= p.openTs && c.netProfit < 0).sort((a, b) => b.closeTs - a.closeTs)[0];
    const lastAny = inp.closed.filter((c) => c.closeTs <= p.openTs).sort((a, b) => b.closeTs - a.closeTs)[0];
    if (lastLoss && lastAny === lastLoss && p.openTs - lastLoss.closeTs <= 30 * 60_000)
      fire(`revenge:${pid}`, ONCE, `🔁 <b>${base(p.symbol)} — 손실 청산 ${Math.max(1, Math.round((p.openTs - lastLoss.closeTs) / 60_000))}분 뒤 재진입</b>\n직전 ${base(lastLoss.symbol)} ${fmt(lastLoss.netProfit)} USDT 손실. 복구 매매가 아닌지 확인하세요.${link('/journal?tab=discipline', '규율 탭')}`);

    // 청산가 근접
    const dist = p.mark > 0 && p.liq > 0 ? (Math.abs(p.mark - p.liq) / p.mark) * 100 : null;
    if (dist != null) {
      if (dist < 8) fire(`liqCrit:${normSym(p.symbol)}`, H, `🚨 <b>${base(p.symbol)} 청산 임박 ${dist.toFixed(1)}%</b>\n마크 ${p.mark} · 청산 ${p.liq} — 지금 증거금 추가하거나 줄이세요${coinLink(p.symbol)}`);
      else if (dist < 15) fire(`liq:${normSym(p.symbol)}`, 6 * H, `🛑 <b>${base(p.symbol)} 청산까지 ${dist.toFixed(1)}%</b>\n마크 ${p.mark} · 청산 ${p.liq} — 레버리지/증거금 확인${coinLink(p.symbol)}`);
    }

    // 매매일지 계획 손절·목표
    if (plan) {
      const nm = plan.name || base(p.symbol), m = p.mark;
      if (plan.stop > 0) {
        if (long ? m <= plan.stop : m >= plan.stop) fire(`${plan.id}:stop`, 6 * H, `⚠ <b>${nm} 계획 손절선 도달</b> (${plan.stop}) · 현재 ${m} — 계획대로 정리하세요`);
        else {
          const near = long ? (m - plan.stop) / plan.stop : (plan.stop - m) / plan.stop;
          if (near > 0 && near <= 0.007) fire(`${plan.id}:near`, 6 * H, `🔔 <b>${nm} 손절선 근접</b> (손절 ${plan.stop} · 현재 ${m}) — 대응 준비`);
        }
      }
      if (plan.target1 > 0 && (long ? m >= plan.target1 : m <= plan.target1)) fire(`${plan.id}:t1`, 6 * H, `🎯 <b>${nm} 목표1 도달</b> (${plan.target1}) · 현재 ${m}`);
      if (plan.target2 > 0 && (long ? m >= plan.target2 : m <= plan.target2)) fire(`${plan.id}:t2`, 6 * H, `🎯 <b>${nm} 목표2 도달</b> (${plan.target2}) · 현재 ${m}`);
    }
  }

  // ⏱ 단타 횟수 — 비용 누수 진단상 1시간 미만 매매가 수수료의 가장 큰 몫. 오늘(KST) 3건째부터 한 건 늘 때마다 1회
  {
    const day = kstDayStart(inp.now);
    const scalps = inp.closed.filter((c) => c.closeTs >= day && c.closeTs <= inp.now && c.openTs != null && c.openTs > 0 && c.closeTs - c.openTs < SCALP_MAX_MS);
    if (scalps.length >= SCALP_WARN_N) {
      const fee = scalps.reduce((s, c) => s + Math.abs(c.fee ?? 0), 0);
      const gross = scalps.reduce((s, c) => s + (c.grossPnl ?? 0), 0);
      const net = scalps.reduce((s, c) => s + c.netProfit, 0);
      fire(`scalp:${day}:${scalps.length}`, ONCE, `⏱ <b>오늘 1시간 미만 매매 ${scalps.length}건째</b>
수수료 ${fee.toFixed(1)} USDT · 가격손익 ${fmt(gross)} → 순손익 ${fmt(net)} USDT
비용 누수 진단에서 가장 큰 구멍이 이 구간입니다. 다음 진입은 계획(손절·목표)을 일지에 먼저 적고, 지정가로.${link('/journal?tab=cost', '비용 탭')}`);
    }
  }

  // 서킷브레이커 — 사용자 한도 없으면 오늘 손실 한도 = 평가금 3%(가정)
  if (inp.closed.length) {
    const userDaily = inp.limits?.dailyLossLimitUsdt ?? null;
    const assumed = userDaily == null && inp.equity != null && inp.equity > 0 ? Math.round(inp.equity * DEFAULT_DAILY_LOSS_PCT) / 100 : null;
    const limits: BreakerLimits = { ...DEFAULT_LIMITS, ...(inp.limits ?? {}), dailyLossLimitUsdt: userDaily ?? assumed };
    const cb = evaluateBreaker(inp.closed.map((c) => ({ ts: c.closeTs, result: c.netProfit > 0 ? 'win' : c.netProfit < 0 ? 'loss' : 'even', realizedUsdt: c.netProfit })), limits, inp.now);
    const day = kstDayStart(inp.now);
    const note = assumed != null ? `\n<i>오늘 손실 한도 ${assumed} USDT = 평가금 ${Math.round(inp.equity!)}의 ${DEFAULT_DAILY_LOSS_PCT}% (기본값 — 앱 리스크 한도에서 직접 정할 수 있음)</i>` : '';
    if (cb.status === 'blocked') fire(`cb:blocked:${day}`, ONCE, `🛑 <b>서킷브레이커 — 오늘 신규 진입 멈춤</b>\n${cb.reasons.join('\n')}\n오늘 ${fmt(cb.todayRealized ?? 0)} USDT · 연속 손절 ${cb.lossStreak}${note}${link('/journal', '오늘 매매 보기')}`);
    else if (cb.status === 'warn') fire(`cb:warn:${day}`, ONCE, `🟡 <b>서킷브레이커 경고</b>\n${cb.reasons.join('\n')}${note}${link('/journal', '오늘 매매 보기')}`);
  }

  for (const k of Object.keys(fired)) if (fired[k] !== Number.POSITIVE_INFINITY && inp.now - fired[k] > 8 * 24 * H) delete fired[k];
  return { alerts, state: { fired } };
}

/* ── 로더·발송(네트워크) ───────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const STATE_ID = 'guard-state';
/** 실행 기록(매 회차 덮어씀) — pg_cron 5분 실행이 실제로 도는지 확인·앱 표시용. kospi-lab- 접두사가 아니라 기기 동기화엔 안 섞임 */
const HEARTBEAT_ID = 'guard-heartbeat';
/** 보낸 🚨·⚡ 경보와 그 뒤 결과(lib/alertLog) — 실전 성적 */
const ALERT_LOG_ID = 'guard-alert-log';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}
async function sbGet<T>(id: string): Promise<T | null> {
  const url = process.env.SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const r = await fetch(`${url}/rest/v1/kl_sync?id=eq.${encodeURIComponent(id)}&select=data`, { headers: sbHeaders(), signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const rows = (await r.json()) as { data: unknown }[];
    const d = rows?.[0]?.data;
    return (typeof d === 'string' ? JSON.parse(d) : d) as T ?? null;
  } catch { return null; }
}
async function sbPut(id: string, data: unknown): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const r = await fetch(`${url}/rest/v1/kl_sync?on_conflict=id`, {
    method: 'POST', headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id, data, updated_at: Date.now(), device: 'guard' }]), signal: AbortSignal.timeout(8000),
  });
  return r.ok;
}

async function h1TrendAt(symbol: string, openTs: number): Promise<OpenPos['h1Trend']> {
  try {
    const u = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&endTime=${openTs}&limit=200`;
    const j = await (await fetch(u, { signal: AbortSignal.timeout(8000), cache: 'no-store' })).json();
    if (j?.code !== '00000') return null;
    const cs = (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +(r[6] ?? 0) }))
      .sort((a, b) => a.ts - b.ts).filter((c) => c.ts + H <= openTs);
    return cs.length >= 60 ? tfTrend(analyzeTimeframe('1H', cs)) : null;
  } catch { return null; }
}

/** 최근 마감된 15분봉 2개(30분) 안 충격봉 */
async function shock15m(symbol: string): Promise<OpenPos['shock']> {
  try {
    const j = await (await fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=15m&limit=40`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })).json();
    if (j?.code !== '00000') return null;
    const bars: Bar[] = (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).sort((a, b) => a.ts - b.ts).filter((b) => b.ts + 900_000 <= Date.now());
    return latestShock(bars, 2);
  } catch { return null; }
}

async function atr1hNow(symbol: string): Promise<number | null> {
  try {
    const j = await (await fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&limit=60`, { signal: AbortSignal.timeout(8000), cache: 'no-store' })).json();
    if (j?.code !== '00000') return null;
    const cs = (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], qv: +(r[6] ?? 0) })).sort((x, y) => x.ts - y.ts);
    const v = cs.length >= 20 ? atr(cs.slice(0, -1)) : 0;   // 진행 중인 마지막 봉 제외
    return v > 0 ? v : null;
  } catch { return null; }
}

/** 걸린 TP/SL 플랜 주문 — 심볼 집합(손절 없음 경고) + 손절 트리거가(왕복 수수료 경고, 롱은 가장 높은 것·숏은 가장 낮은 것 = 먼저 닿는 것) */
async function slOrders(): Promise<{ symbols: Set<string>; stops: Record<string, number> } | null> {
  try {
    const j = await bitgetSignedGet('/api/v2/mix/order/orders-plan-pending?productType=USDT-FUTURES&planType=profit_loss');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = j.data as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list: any[] = d?.entrustedList ?? d?.list ?? (Array.isArray(d) ? d : []);
    const stops: Record<string, number> = {};
    for (const o of list) {
      const sym = normSym(String(o.symbol ?? '')), side = String(o.posSide ?? o.holdSide ?? '').toLowerCase();
      const trig = num(o.triggerPrice ?? o.stopLossTriggerPrice);
      if (!sym || !/loss/i.test(String(o.planType ?? '')) || (side !== 'long' && side !== 'short') || !(trig > 0)) continue;
      const k = `${sym}:${side}`;
      stops[k] = stops[k] == null ? trig : side === 'long' ? Math.max(stops[k], trig) : Math.min(stops[k], trig);
    }
    return { symbols: new Set(list.map((o) => normSym(String(o.symbol ?? ''))).filter(Boolean)), stops };
  } catch { return null; }
}

async function equityUsdt(): Promise<number | null> {
  try {
    const j = await bitgetSignedGet('/api/v2/mix/account/accounts?productType=USDT-FUTURES');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = ((j.data as any[]) ?? []).find((x) => String(x.marginCoin).toUpperCase() === 'USDT');
    const v = num(a?.usdtEquity ?? a?.accountEquity);
    return v > 0 ? v : null;
  } catch { return null; }
}

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.KL_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.KL_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return !!((await r.json().catch(() => ({}))) as { ok?: boolean }).ok;
}

export interface GuardRun { ok: boolean; skipped?: string; positions: number; alerts: GuardAlert[]; sent: boolean; stateSaved: boolean }

/** 한 회차: 조회 → 판정 → (dry 아니면) 발송 → 상태 저장. 발송 실패면 상태를 저장하지 않아 다음 회차에 다시 시도 */
export async function runGuard(opts: { dry?: boolean; now?: number; ignoreState?: boolean } = {}): Promise<GuardRun> {
  if (!bitgetKeysConfigured()) return { ok: false, skipped: 'Bitget 키 없음', positions: 0, alerts: [], sent: false, stateSaved: false };
  const now = opts.now ?? Date.now();
  const posJson = await bitgetSignedGet('/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = ((posJson.data as any[]) ?? []).filter((r) => num(r.total) !== 0);
  const [sl, journalRaw, limits, equity, closedRes, state] = await Promise.all([
    slOrders(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sbGet<any[]>('kospi-lab-coin-journal'),
    sbGet<Partial<BreakerLimits>>('kospi-lab-risk-limits'),
    equityUsdt(),
    fetchClosedPositions(now - 7 * 86_400_000, now).catch(() => ({ positions: [] as ClosedPosition[] })),
    sbGet<GuardState>(STATE_ID),
  ]);
  const positions: OpenPos[] = [];
  for (const r of raw) {
    const openTs = num(r.cTime ?? r.ctime);
    positions.push({
      symbol: String(r.symbol), side: r.holdSide === 'short' ? 'short' : 'long', openTs,
      entry: num(r.openPriceAvg ?? r.averageOpenPrice), mark: num(r.markPrice), liq: num(r.liquidationPrice),
      h1Trend: openTs > 0 ? await h1TrendAt(String(r.symbol), openTs) : null,
      size: num(r.total), atr1h: await atr1hNow(String(r.symbol)),
      shock: (r.holdSide === 'short') ? null : await shock15m(String(r.symbol)),
      warn: (r.holdSide === 'short') ? null : await fetchLiveFlags(String(r.symbol)).catch(() => null),
    });
  }
  const journal: PlanStop[] = (Array.isArray(journalRaw) ? journalRaw : [])
    .filter((e) => e?.result === 'open' && (e.direction === 'long' || e.direction === 'short'))
    .map((e) => ({ symbol: String(e.symbol), side: e.direction, id: String(e.id), name: e.name, stop: num(e.stop), target1: num(e.target1), target2: num(e.target2) }));
  const { alerts, state: next } = evaluateGuard(
    { now, positions, slSymbols: sl?.symbols ?? null, slStops: sl?.stops, journal, closed: closedRes.positions, limits: limits ? { ...DEFAULT_LIMITS, ...limits } : null, equity },
    (opts.ignoreState ? null : state) ?? { fired: {} },
  );
  if (opts.dry) return { ok: true, positions: positions.length, alerts, sent: false, stateSaved: false };
  await sbPut(HEARTBEAT_ID, { at: now, positions: positions.length, alerts: alerts.map((a) => a.key) }).catch(() => false);
  let sent = false, stateSaved = false;
  if (alerts.length) {
    sent = await sendTelegram(alerts.map((a) => a.text).join('\n\n'));
    if (sent) stateSaved = await sbPut(STATE_ID, next);
  } else if (JSON.stringify(next) !== JSON.stringify(state ?? { fired: {} })) stateSaved = await sbPut(STATE_ID, next);
  await updateAlertLog(sent ? sentEntries(alerts, positions, now) : [], now).catch(() => null);
  return { ok: true, positions: positions.length, alerts, sent, stateSaved };
}

/* ── 경보 실전 성적(lib/alertLog) ─────────────── */
/** 이번에 보낸 알림 중 🚨 폭락 조기 경보·⚡ 하락 충격봉만 기록 항목으로 */
function sentEntries(alerts: GuardAlert[], positions: OpenPos[], now: number): AlertLogEntry[] {
  const out: AlertLogEntry[] = [];
  for (const a of alerts) {
    const [kind, sym] = a.key.split(':');
    const p = positions.find((x) => normSym(x.symbol) === sym && x.side === 'long');
    if (kind === 'warn' && p?.warn) out.push({ kind: 'warn', sym, ts: p.warn.ts, px: p.warn.close, at: now });
    if (kind === 'shock' && p?.shock) out.push({ kind: 'shock', sym, ts: p.shock.ts, at: now });
  }
  return out;
}

async function candlesRange(symbol: string, gran: '5m' | '15m', start: number, end: number): Promise<Bar[]> {
  const u = `https://api.bitget.com/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${gran}&startTime=${start}&endTime=${end}&limit=200`;
  const j = await (await fetch(u, { signal: AbortSignal.timeout(8000), cache: 'no-store' })).json();
  if (j?.code !== '00000') return [];
  return (j.data as string[][]).map((r) => ({ ts: +r[0], o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).sort((a, b) => a.ts - b.ts);
}

/** 새 경보 추가 + 판정 시각이 지난 미판정 건을 회차당 최대 3건 판정. 바뀐 게 있을 때만 저장 */
async function updateAlertLog(add: AlertLogEntry[], now: number): Promise<void> {
  const prev = await sbGet<AlertLog>(ALERT_LOG_ID);
  if (!add.length && !prev?.entries?.some((e) => !e.outcome && !e.gaveUp && dueAt(e) <= now)) return;
  const log = appendAlerts(prev, add);
  let n = 0;
  for (const e of log.entries) {
    if (e.outcome || e.gaveUp || dueAt(e) > now || n >= 3) continue;
    n++;
    const o = e.kind === 'warn'
      ? resolveWarn(e, await candlesRange(e.sym, '5m', e.ts - 5 * 60_000, dueAt(e) + 5 * 60_000).catch(() => []))
      : resolveShock(e, await candlesRange(e.sym, '15m', e.ts - 15 * 60_000, dueAt(e) + 15 * 60_000).catch(() => []));
    if (o) e.outcome = o;
    else if (now - dueAt(e) > 86_400_000) e.gaveUp = true;   // 하루 지나도 캔들이 없으면 판정 포기(다음 회차를 막지 않게)
  }
  await sbPut(ALERT_LOG_ID, log);
}

/** 앱 표시용 — /api/bitget/alert-log */
export async function alertLogSummary(): Promise<AlertLogSummary> {
  return summarizeAlertLog(await sbGet<AlertLog>(ALERT_LOG_ID));
}

/* ── 냉각 타이머(앱 상단 배너) ─────────────────── */
/** 손실 청산 뒤 다음 진입까지 쉬는 시간 — 복구 매매 판정(30분)과 같은 기준 */
export const COOLDOWN_AFTER_LOSS_MS = 30 * 60_000;

export interface Cooldown { until: number; kind: 'loss' | 'breaker'; reason: string }
/**
 * 순수 — 지금 쉬어야 하나. 서킷브레이커 차단이면 다음 KST 자정까지, 아니면 마지막 청산이 손실일 때 그 뒤 30분.
 * 거래소 주문을 막지는 못한다(리마인더). 한도 미설정 시 오늘 손실 한도 = 평가금 3%(가드와 같은 가정).
 */
export function cooldownState(closed: Pick<ClosedPosition, 'netProfit' | 'closeTs'>[], limits: BreakerLimits | null, equity: number | null, now: number): Cooldown | null {
  if (!closed.length) return null;
  const userDaily = limits?.dailyLossLimitUsdt ?? null;
  const assumed = userDaily == null && equity != null && equity > 0 ? Math.round(equity * DEFAULT_DAILY_LOSS_PCT) / 100 : null;
  const cb = evaluateBreaker(closed.map((c) => ({ ts: c.closeTs, result: c.netProfit > 0 ? 'win' : c.netProfit < 0 ? 'loss' : 'even', realizedUsdt: c.netProfit })),
    { ...DEFAULT_LIMITS, ...(limits ?? {}), dailyLossLimitUsdt: userDaily ?? assumed }, now);
  if (cb.status === 'blocked') return { until: kstDayStart(now) + 86_400_000, kind: 'breaker', reason: cb.reasons[0] ?? '서킷브레이커' };
  const last = [...closed].sort((a, b) => b.closeTs - a.closeTs)[0];
  if (last.netProfit < 0 && now - last.closeTs < COOLDOWN_AFTER_LOSS_MS)
    return { until: last.closeTs + COOLDOWN_AFTER_LOSS_MS, kind: 'loss', reason: `직전 손실 청산 ${fmt(last.netProfit)} USDT — 복구 매매 방지` };
  return null;
}

export async function cooldownNow(now: number = Date.now()): Promise<Cooldown | null> {
  const [{ positions }, limits, equity] = await Promise.all([
    fetchClosedPositions(now - 7 * 86_400_000, now),
    sbGet<Partial<BreakerLimits>>('kospi-lab-risk-limits'),
    equityUsdt(),
  ]);
  return cooldownState(positions, limits ? { ...DEFAULT_LIMITS, ...limits } : null, equity, now);
}

/* ── 홈 '지금 내 상태' 한 줄(/api/bitget/status) ─────────────────── */
export interface MyStatus {
  heartbeatAt: number | null;            // 마지막 가드 실행(pg_cron 5분)
  positions: { symbol: string; side: 'long' | 'short'; slSet: boolean | null; pnlPct: number | null }[];
  cooldown: Cooldown | null;
}
export const HEARTBEAT_STALE_MS = 15 * 60_000;

export async function myStatus(now: number = Date.now()): Promise<MyStatus> {
  const [hb, posJson, sl, cd] = await Promise.all([
    sbGet<{ at: number }>(HEARTBEAT_ID),
    bitgetSignedGet('/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT').catch(() => null),
    slOrders().then((o) => o?.symbols ?? null),
    cooldownNow(now).catch(() => null),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = ((posJson?.data as any[]) ?? []).filter((r) => num(r.total) !== 0);
  return {
    heartbeatAt: hb?.at ?? null,
    positions: raw.map((r) => {
      const entry = num(r.openPriceAvg ?? r.averageOpenPrice), mark = num(r.markPrice), side = r.holdSide === 'short' ? 'short' : 'long';
      return {
        symbol: String(r.symbol), side,
        slSet: sl ? sl.has(normSym(String(r.symbol))) : null,
        pnlPct: entry > 0 && mark > 0 ? ((side === 'long' ? mark - entry : entry - mark) / entry) * 100 : null,
      };
    }),
    cooldown: cd,
  };
}
