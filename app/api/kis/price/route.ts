import { NextRequest, NextResponse } from 'next/server';

const KIS_BASE = 'https://openapi.koreainvestment.com:9443';

async function getToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/kis/token`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    return d.access_token ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const appKey    = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    return NextResponse.json({ error: 'KIS keys not configured' }, { status: 500 });
  }

  const token = await getToken();
  if (!token) return NextResponse.json({ error: 'token fetch failed' }, { status: 502 });

  try {
    const res = await fetch(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price` +
      `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
      {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          appkey: appKey,
          appsecret: appSecret,
          tr_id: 'FHKST01010100',
          custtype: 'P',
        },
        next: { revalidate: 0 },
      }
    );

    if (!res.ok) return NextResponse.json({ error: `KIS ${res.status}` }, { status: 502 });

    const d = await res.json();
    const o = d.output;

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
