/**
 * Bitget USDT 선물 체결 내역(fill-history) 조회 — 서명 GET, 읽기 전용. /api/bitget/fills 가 쓴다.
 *  - 한 요청 구간은 7일 이하(초과 시 Bitget 00001 거부) → timeWindows 로 잘라 최신 구간부터 순차 조회.
 *  - 구간 안에서는 limit=100, 응답 endId 를 다음 요청의 idLessThan 으로 넘겨 페이지를 넘긴다.
 *  - 구간 경계가 겹칠 수 있어 tradeId 로 중복 제거.
 */
import { bitgetSignedGet } from '@/lib/bitget';
import { parseFill, timeWindows, type Fill } from '@/lib/feeDiag';

/** 구간당 최대 페이지(= 2,000 체결). 넘으면 truncated=true */
const MAX_PAGES_PER_WINDOW = 20;

export async function fetchFills(startTime: number, endTime: number): Promise<{ fills: Fill[]; truncated: boolean }> {
  const seen = new Set<string>();
  const fills: Fill[] = [];
  let truncated = false;
  for (const [s, e] of timeWindows(startTime, endTime)) {
    let idLessThan: string | undefined;
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES_PER_WINDOW) { truncated = true; break; }
      const j = await bitgetSignedGet(
        `/api/v2/mix/order/fill-history?productType=USDT-FUTURES&startTime=${s}&endTime=${e}&limit=100${idLessThan ? `&idLessThan=${idLessThan}` : ''}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = j.data as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = d?.fillList ?? [];
      for (const r of rows) {
        const id = String(r?.tradeId ?? `${r?.symbol}-${r?.cTime}-${r?.price}-${r?.baseVolume}`);
        if (seen.has(id)) continue;
        seen.add(id);
        const f = parseFill(r);
        if (f) fills.push(f);
      }
      const next = d?.endId ? String(d.endId) : undefined;
      if (rows.length < 100 || !next || next === idLessThan) break;
      idLessThan = next;
    }
  }
  fills.sort((a, b) => a.ts - b.ts);
  return { fills, truncated };
}
