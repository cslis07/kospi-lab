import { NextRequest, NextResponse } from 'next/server';
import { kisGet } from '@/lib/kis';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  try {
    const json = await kisGet(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: ticker },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = json.output as any;
    if (!o) return NextResponse.json({ error: 'KIS no data' }, { status: 502 });

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
