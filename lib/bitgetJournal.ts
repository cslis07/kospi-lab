/**
 * 거래소 청산 이력 ↔ 매매일지 대조(reconcile) — 순수 함수.
 *
 * 이 함수가 푸는 문제: 손으로 적는 매매일지는 이긴 매매만 남기 쉽다(생존 편향).
 * 거래소가 아는 사실을 정본으로 삼아
 *   (a) 계획해 둔 기록에는 **실제 실현손익**을 채워 닫고,
 *   (b) 계획 없이 친 매매는 **새 기록으로 드러낸다**.
 * (b)를 굳이 만드는 이유가 핵심이다 — "계획하고 들어간 매매 vs 충동 매매"의
 * 성적 차이가 보여야 저널이 거울 노릇을 한다. 조용히 버리면 성적표가 예뻐질 뿐이다.
 *
 * 순수 함수로 둔 이유: 돈이 걸린 판정이라 tests/engine.test.ts 로 고정한다.
 */

export interface ClosedPositionLike {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  openAvg: number;
  closeAvg: number;
  netProfit: number;
  openTs: number;
  closeTs: number;
  size?: number;          // 청산 수량 — 거래소 손절로 R 환산할 때 필요
  stop?: number;          // SL 주문에서 복구한 손절가(있을 때)
}

export interface SlOrder { symbol: string; triggerPrice: number; ts: number }

/**
 * SL(스탑로스) 주문 트리거가를 청산 포지션에 매칭해 stop 을 채운다.
 * 거래소 side/plan 필드가 버전마다 달라 신뢰가 낮으므로 "심볼 + 시간창 + 손절 방향(진입 대비 손해쪽)"으로만 매칭한다.
 * 롱은 트리거가 < 진입가, 숏은 > 진입가. 진입 시각에 가장 가까운 주문을 채택.
 */
export function attachStops<T extends ClosedPositionLike>(positions: T[], sl: SlOrder[]): T[] {
  const H = 3_600_000;
  return positions.map((p) => {
    const cands = sl.filter((o) =>
      o.triggerPrice > 0 &&
      normSymbol(o.symbol) === normSymbol(p.symbol) &&
      o.ts >= p.openTs - 2 * H && o.ts <= p.closeTs + H &&
      (p.side === 'long' ? o.triggerPrice < p.openAvg : o.triggerPrice > p.openAvg));
    if (!cands.length) return p;
    const best = cands.sort((a, b) => Math.abs(a.ts - p.openTs) - Math.abs(b.ts - p.openTs))[0];
    return { ...p, stop: best.triggerPrice };
  });
}

/** 거래소 데이터로 1R(USDT) 역산: |진입−손절| × 수량. 손절가·수량 없으면 null. */
export function exchangeRiskUsdt(p: ClosedPositionLike): number | null {
  if (p.stop != null && p.stop > 0 && p.size != null && p.size > 0 && p.openAvg > 0) return Math.abs(p.openAvg - p.stop) * p.size;
  return null;
}

export interface JournalLike {
  id: string;
  ts: number;
  symbol: string;
  direction: 'long' | 'short' | 'wait';
  entry: number;
  stop: number;
  result: 'open' | 'win' | 'loss' | 'even';
  resultR?: number | null;
  realizedUsdt?: number | null;
  seedUsdt?: number | null;
  riskPct?: number | null;
  notionUsdt?: number | null;
  exchangePositionId?: string | null;
  memo?: string;
}

export interface JournalPatch {
  result: 'win' | 'loss' | 'even';
  resultR: number | null;
  realizedUsdt: number;
  exchangePositionId: string;
  memo: string;
}

export interface ReconcileResult {
  /** 계획 기록에 실제 결과를 채운다 */
  updates: { id: string; patch: JournalPatch }[];
  /** 계획 없이 친 매매 — 새 기록으로 드러낸다 */
  additions: {
    id: string; ts: number; symbol: string; name: string;
    direction: 'long' | 'short'; state: string; score: number;
    price: number; entry: number; stop: number; target1: number; target2: number;
    leverage: number; reasonsTop: string[];
    result: 'win' | 'loss' | 'even'; resultR: number | null; realizedUsdt: number;
    exchangePositionId: string; memo: string;
  }[];
  /** 이미 반영돼 건너뛴 건수 — UI 가 "새로 반영 0건"을 정직하게 말할 수 있게 */
  skipped: number;
}

/** 계획 기록에 적힌 사이징으로 1R 이 몇 USDT 였는지 역산한다. 알 수 없으면 null. */
export function plannedRiskUsdt(e: JournalLike): number | null {
  // 1순위: 사용자가 리스크 패널에서 실제로 설정한 "1회 허용손실"
  if (e.seedUsdt != null && e.riskPct != null && e.seedUsdt > 0 && e.riskPct > 0) {
    return (e.seedUsdt * e.riskPct) / 100;
  }
  // 2순위: 계획 노션 × 손절거리(%)
  if (e.notionUsdt != null && e.notionUsdt > 0 && e.entry > 0 && e.stop > 0) {
    const dist = Math.abs(e.entry - e.stop) / e.entry;
    if (dist > 0) return e.notionUsdt * dist;
  }
  return null;
}

const outcome = (net: number): 'win' | 'loss' | 'even' => (net > 0 ? 'win' : net < 0 ? 'loss' : 'even');

/** 심볼 표기 차이 흡수 (BTCUSDT / BTCUSDT_UMCBL / btcusdt) */
export function normSymbol(s: string): string {
  return (s || '').toUpperCase().replace(/_.*$/, '').replace(/[^A-Z0-9]/g, '');
}

/**
 * @param closed 거래소 청산 포지션 (최신순·무순 상관없음)
 * @param journal 현재 매매일지
 * @param nameOf 심볼 → 표시 이름 (없으면 심볼 그대로)
 */
export function reconcileClosedPositions(
  closed: ClosedPositionLike[],
  journal: JournalLike[],
  nameOf: (symbol: string) => string = (s) => s,
): ReconcileResult {
  const updates: ReconcileResult['updates'] = [];
  const additions: ReconcileResult['additions'] = [];
  let skipped = 0;

  // 이미 반영된 포지션 id — 갱신분·자동생성분 양쪽에서 수집
  const seen = new Set<string>();
  for (const e of journal) {
    if (e.exchangePositionId) seen.add(e.exchangePositionId);
    if (e.id.startsWith('bitget-')) seen.add(e.id.slice('bitget-'.length));
  }
  // 같은 계획 기록이 두 포지션에 중복 매칭되지 않도록 소진 표시
  const consumed = new Set<string>();

  // 오래된 청산부터 처리해야 시간순 매칭이 자연스럽다
  for (const p of [...closed].sort((a, b) => a.closeTs - b.closeTs)) {
    if (seen.has(p.positionId)) { skipped++; continue; }

    const sym = normSymbol(p.symbol);
    // 매칭: 같은 심볼·같은 방향·열린 상태·진입이 청산보다 앞선 기록 중 가장 최근 것
    const cand = journal
      .filter((e) =>
        e.result === 'open' &&
        e.direction === p.side &&
        normSymbol(e.symbol) === sym &&
        e.ts <= p.closeTs &&
        !consumed.has(e.id))
      .sort((a, b) => b.ts - a.ts)[0];

    if (cand) {
      consumed.add(cand.id);
      const riskUsdt = plannedRiskUsdt(cand) ?? exchangeRiskUsdt(p);
      updates.push({
        id: cand.id,
        patch: {
          result: outcome(p.netProfit),
          // 계획 리스크를 알 때만 R 로 환산한다 — 모르면 null(추측 금지)
          resultR: riskUsdt && riskUsdt > 0 ? Math.round((p.netProfit / riskUsdt) * 100) / 100 : null,
          realizedUsdt: p.netProfit,
          exchangePositionId: p.positionId,
          memo: `거래소 자동판정 · 실현 ${p.netProfit >= 0 ? '+' : ''}${p.netProfit.toFixed(2)} USDT (평단 ${p.openAvg} → ${p.closeAvg})`,
        },
      });
    } else {
      const exRisk = exchangeRiskUsdt(p);
      additions.push({
        id: `bitget-${p.positionId}`,
        ts: p.openTs || p.closeTs,
        symbol: p.symbol,
        name: nameOf(p.symbol),
        direction: p.side,
        state: '거래소 기록',
        score: 0,
        price: p.openAvg,
        entry: p.openAvg,
        stop: p.stop != null && p.stop > 0 ? p.stop : 0,   // 계획 없어도 SL주문에서 복구되면 채운다(지어내진 않음)
        target1: 0,
        target2: 0,
        leverage: 0,
        reasonsTop: [p.stop != null && p.stop > 0 ? '계획 없이 체결 · 거래소 SL주문에서 손절가 복구' : '계획 기록 없이 체결된 매매 — 거래소 이력에서 자동 수집'],
        result: outcome(p.netProfit),
        // 손절가를 복구했으면 거래소 데이터로 R 환산, 아니면 null(추측 금지)
        resultR: exRisk != null && exRisk > 0 ? Math.round((p.netProfit / exRisk) * 100) / 100 : null,
        realizedUsdt: p.netProfit,
        exchangePositionId: p.positionId,
        memo: `계획 없이 진입 · 실현 ${p.netProfit >= 0 ? '+' : ''}${p.netProfit.toFixed(2)} USDT (평단 ${p.openAvg} → ${p.closeAvg})${p.stop != null && p.stop > 0 ? ` · 손절 ${p.stop}(SL주문 복구)` : ''}`,
      });
    }
    seen.add(p.positionId);
  }

  return { updates, additions, skipped };
}
