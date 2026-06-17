/**
 * 한국투자증권 (KIS) Open API 공용 헬퍼
 *
 * 토큰 발급 우선순위:
 *  1) KIS_ACCESS_TOKEN  — cron(GitHub Actions)이 매일 갱신해 주입하는 사전 발급 토큰.
 *     Vercel 서버리스는 cold start마다 메모리 캐시가 초기화되므로, 매 요청 토큰을
 *     새로 발급하면 KIS의 "1분당 1회" 제한(EGW00133)에 걸린다. 이를 우회하기 위함.
 *  2) 메모리 캐시 — 동일 람다가 warm 상태일 때 재사용.
 *  3) 라이브 발급 — env 토큰이 없을 때만(주로 로컬 dev). 1분당 1회 제한 있음.
 */

/**
 * 도메인 선택:
 *  - 실전투자: https://openapi.koreainvestment.com:9443  (실전 앱키 필요)
 *  - 모의투자: https://openapivts.koreainvestment.com:29443  (모의 앱키, 시세 조회는 실데이터)
 * 현재 발급된 앱키가 모의투자(VTS) 키이므로 VTS 도메인을 기본값으로 사용한다.
 * 실전 키로 교체 시 env KIS_API_BASE 만 실전 도메인으로 바꾸면 된다.
 */
export const KIS_BASE =
  process.env.KIS_API_BASE || 'https://openapivts.koreainvestment.com:29443';

let cached: { token: string; expiresAt: number } | null = null;

async function issueToken(appKey: string, appSecret: string) {
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`KIS auth failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return {
    token: data.access_token as string,
    expiresIn: (data.expires_in as number) ?? 86400,
  };
}

/** 유효한 KIS access token을 반환. 실패 시 throw. */
export async function getKisToken(): Promise<string> {
  // 1) cron이 주입한 사전 발급 토큰
  const envToken = process.env.KIS_ACCESS_TOKEN;
  if (envToken && envToken.length > 20) {
    return envToken;
  }

  // 2) warm 람다 메모리 캐시 (만료 5분 전까지 재사용)
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) {
    return cached.token;
  }

  // 3) 라이브 발급
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error('KIS keys not configured');
  }
  const { token, expiresIn } = await issueToken(appKey, appSecret);
  cached = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export function getKisHeaders(token: string, trId: string) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_APP_KEY ?? '',
    appsecret: process.env.KIS_APP_SECRET ?? '',
    tr_id: trId,
    custtype: 'P',
  };
}
