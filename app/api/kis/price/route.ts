import { NextRequest, NextResponse } from 'next/server';
import { KIS_BASE, getKisToken, getKisHeaders } from '@/lib/kis';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  let token: string;
  try {
    token = await getKisToken();
  } catch (e) {
    return NextResponse.json({ error: `token fetch failed: ${String(e)}` }, { status: 502 });
  }

  try {
    const res = await fetch(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
      {
        headers: getKisHeaders(token, 'FHKST01010100'),
        cache: 'no-store',
      }
    );

    if (!res.ok) return NextResponse.json({ error: `KIS ${res.status}` }, { status: 502 });

    const d = await res.json();
    const o = d.output;
    if (!o) return NextResponse.json({ error: `KIS no data: ${d.msg1 ?? ''}` }, { status: 502 });

    return NextResponse.json({
      ticker,
      name:       o.hts_kor_isnm,
      price:      Number(o.stck_prpr),
      change:     Number(o.prdy_vrss),
      changeRate: Number(o.prdy_ctrt),
      volume:     o.acml_vol,
      tradingValue: o.acml_tr_pbmn,
      marketCap:  o.hts_avls,
      market:     o.rprs_mrkt_kor_name,
      prevClose:  Number(o.stck_sdpr),
      high52w:    Number(o.d250_hgpr),
      low52w:     Number(o.d250_lwpr),
      per:        Number(o.per),
      pbr:        Number(o.pbr),
      eps:        Number(o.eps),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
