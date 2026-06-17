import { NextResponse } from 'next/server';

const KIS_BASE = 'https://openapi.koreainvestment.com:9443';

// In-memory token cache (resets per serverless cold start)
let cached: { token: string; expiresAt: number } | null = null;

export async function GET() {
  const appKey    = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  if (!appKey || !appSecret) {
    return NextResponse.json({ error: 'KIS keys not configured' }, { status: 500 });
  }

  // Return cached token if still valid (buffer 5 min)
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    return NextResponse.json({ access_token: cached.token });
  }

  try {
    const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        appsecret: appSecret,
      }),
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `KIS auth failed: ${res.status} ${txt}` }, { status: 502 });
    }

    const data = await res.json();
    const token = data.access_token as string;
    const expiresIn = (data.expires_in as number) ?? 86400; // default 24h

    cached = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return NextResponse.json({ access_token: token });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
