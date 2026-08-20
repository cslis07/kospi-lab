import { NextResponse } from 'next/server';
import { bitgetKeysConfigured, bitgetSignedGet } from '@/lib/bitget';

/**
 * Bitget USDT 선물 — 열린 포지션 + 선물 계좌.
 *
 * 기존 /api/bitget/account 는 spot 만 봤다. 실제 자금은 선물에 있으므로
 * 리스크 도구로서 실제 청산가·실제 레버리지·미실현손익을 보여주려면 mix 가 필요하다.
 * 읽기 전용 키로 조회만 한다(주문·출금 없음). 게이트 뒤(/api/bitget/*).
 *
 * ⚠ 키에 선물(read) 권한이 없으면 Bitget 이 에러를 반환한다 → error 필드로 폴백.
 */
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET() {
  if (!bitgetKeysConfigured()) return NextResponse.json({ configured: false });

  try {
    const [posJson, accJson] = await Promise.all([
      bitgetSignedGet('/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT'),
      bitgetSignedGet('/api/v2/mix/account/accounts?productType=USDT-FUTURES').catch(() => null),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (posJson.data as any[] | undefined) ?? [];
    const positions = rows
      .filter((r) => num(r.total) !== 0 || num(r.available) !== 0)   // 수량 있는 것만
      .map((r) => {
        const side: 'long' | 'short' = r.holdSide === 'short' ? 'short' : 'long';
        const mark = num(r.markPrice);
        const liq = num(r.liquidationPrice);
        // 청산까지 남은 거리(%) — 리스크 도구의 핵심 수치
        const liqDistPct = mark > 0 && liq > 0 ? (Math.abs(mark - liq) / mark) * 100 : null;
        return {
          symbol: r.symbol,
          side,
          size: num(r.total),                 // 계약 수량
          openAvg: num(r.openPriceAvg),
          markPrice: mark,
          leverage: num(r.leverage),
          marginMode: r.marginMode ?? null,   // isolated / crossed
          marginSize: num(r.marginSize),
          unrealizedPL: num(r.unrealizedPL),
          liquidationPrice: liq,
          liqDistPct,
        };
      })
      .sort((a, b) => Math.abs(b.unrealizedPL) - Math.abs(a.unrealizedPL));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = (accJson?.data as any[] | undefined)?.[0] ?? null;
    const account = acc ? {
      equity: num(acc.accountEquity ?? acc.usdtEquity),
      available: num(acc.available ?? acc.crossedMaxAvailable),
      unrealizedPL: num(acc.unrealizedPL),
      marginCoin: acc.marginCoin ?? 'USDT',
    } : null;

    return NextResponse.json({ configured: true, positions, account });
  } catch (e) {
    // 선물 권한 없음/조회 실패 — spot 은 별개 라우트라 영향 없음
    return NextResponse.json({ configured: true, error: String(e), positions: [], account: null }, { status: 200 });
  }
}
