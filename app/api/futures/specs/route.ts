import { NextRequest, NextResponse } from 'next/server';
import { fetchContractSpecs } from '@/lib/bitget';
import { withCdn } from '@/lib/cdn';

/**
 * 공개 상품 규격 — GET /api/futures/specs?symbols=BTCUSDT,ETHUSDT → { BTCUSDT: { qtyStep, minQty, minNotional, ... } }
 * Bitget 공개 데이터(개인 정보 없음). 사이징(lib/positionSizing.sizeByRisk)이 수량을 거래소 단위로 '내림'하고
 * 최소 수량·최소 주문금액 미달을 막는 데 쓴다(KL-001). 거의 안 바뀌어 CDN 6시간 + 만료 후 1일 직전 값.
 */
async function handler(req: NextRequest) {
  const want = (req.nextUrl.searchParams.get('symbols') ?? '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9]{2,20}USDT$/.test(x)).slice(0, 20);
  const map = await fetchContractSpecs();
  if (!map.size) return NextResponse.json({ error: 'specs unavailable' }, { status: 502 });
  const out: Record<string, unknown> = {};
  for (const s of want) { const r = map.get(s); if (r) out[s] = r; }
  return NextResponse.json(out);
}

export const GET = withCdn(handler, 21600, 86400);
