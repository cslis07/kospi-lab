import { NextResponse } from 'next/server';
import { bitgetKeysConfigured, bitgetSignedGet } from '@/lib/bitget';

export const dynamic = 'force-dynamic';

interface Bill {
  billId: string;
  ts?: string;
  cTime?: string;
  coin: string;
  groupType: string;     // transfer | deposit | withdraw | trade | ...
  businessType: string;  // TRANSFER_IN | TRANSFER_OUT | ...
  size: string;          // 부호 포함 (음수 = 출금)
  balance?: string;
  fees?: string;
}

interface Fill {
  tradeId: string;
  symbol: string;
  side: string;
  priceAvg: string;
  size: string;
  amount?: string;
  fee?: string;
  cTime?: string;
  uTime?: string;
}

export async function GET() {
  if (!bitgetKeysConfigured()) {
    return NextResponse.json({ configured: false });
  }

  try {
    const [billsJson, fillsJson] = await Promise.all([
      bitgetSignedGet('/api/v2/spot/account/bills?limit=20').catch(() => null),
      bitgetSignedGet('/api/v2/spot/trade/fills?limit=20').catch(() => null),
    ]);

    const bills = ((billsJson?.data as Bill[] | undefined) ?? [])
      .map((b) => ({
        billId:       b.billId,
        ts:           Number(b.cTime ?? b.ts ?? 0),
        coin:         b.coin,
        groupType:    b.groupType,
        businessType: b.businessType,
        size:         Number(b.size),
        balance:      b.balance ? Number(b.balance) : null,
        fees:         b.fees ? Number(b.fees) : 0,
      }))
      .sort((a, b) => b.ts - a.ts);

    const fills = ((fillsJson?.data as Fill[] | undefined) ?? [])
      .map((f) => ({
        tradeId:  f.tradeId,
        ts:       Number(f.cTime ?? f.uTime ?? 0),
        symbol:   f.symbol,
        side:     f.side,
        priceAvg: Number(f.priceAvg),
        size:     Number(f.size),
        amount:   f.amount ? Number(f.amount) : null,
        fee:      f.fee ? Number(f.fee) : 0,
      }))
      .sort((a, b) => b.ts - a.ts);

    return NextResponse.json({ configured: true, bills, fills });
  } catch (e) {
    return NextResponse.json({ configured: true, error: String(e) }, { status: 502 });
  }
}
