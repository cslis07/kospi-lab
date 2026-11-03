import { NextResponse } from 'next/server';
import { bitgetKeysConfigured, bitgetSignedGet, fetchBitgetTickers } from '@/lib/bitget';
import { PRIVATE } from '@/lib/cdn';

export const dynamic = 'force-dynamic';

interface AssetRow {
  coin: string;
  available: string;
  frozen: string;
  locked?: string;
}

export async function GET() {
  if (!bitgetKeysConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const [json, tickers] = await Promise.all([
      bitgetSignedGet('/api/v2/spot/account/assets'),
      fetchBitgetTickers().catch(() => null),
    ]);

    const rows = (json.data as AssetRow[] | undefined) ?? [];
    let totalUsdt = 0;

    const assets = rows
      .map((r) => {
        const amount = Number(r.available) + Number(r.frozen) + Number(r.locked ?? 0);
        if (amount <= 0) return null;
        const price =
          r.coin === 'USDT' ? 1 : Number(tickers?.get(`${r.coin}USDT`)?.lastPr ?? 0);
        const usdtValue = amount * price;
        totalUsdt += usdtValue;
        return {
          coin: r.coin,
          amount,
          available: Number(r.available),
          frozen: Number(r.frozen) + Number(r.locked ?? 0),
          price,
          usdtValue,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => b.usdtValue - a.usdtValue);

    // 브라우저만 25초 보관(30초 폴링·탭 이동 재요청 흡수) — 게이트 뒤라 CDN 공유 캐시 금지
    return NextResponse.json({ configured: true, totalUsdt, assets }, { headers: { 'Cache-Control': PRIVATE(25) } });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: String(e) },
      { status: 502 },
    );
  }
}
