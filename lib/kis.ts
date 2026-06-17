/**
 * 한국투자증권 (KIS) Open API 공용 헬퍼
 *
 * 토큰 우선순위 (자가 치유 · 무인 운영):
 *  1) 메모리 캐시 — 동일 람다가 warm 상태일 때 재사용.
 *  2) KIS_ACCESS_TOKEN(env) — 사전 발급 토큰. 단, JWT exp를 직접 검사해
 *     "아직 유효할 때만" 사용한다. 만료되면 자동으로 3)으로 넘어간다.
 *  3) 라이브 발급 — env 토큰이 없거나 만료됐을 때. KIS는 동일 앱키에 대해
 *     24h 유효한 동일 토큰을 반환하므로(1분당 1회 제한), 메모리에 캐싱해 재사용한다.
 *
 * 이 구조 덕분에 KIS_ACCESS_TOKEN이 24h 뒤 만료돼도 cron 없이 라이브 발급으로
 * 자동 전환되어 영구 동작한다.
 */

/** JWT의 exp(만료 epoch초)를 ms로 디코딩. 실패 시 0. */
function decodeJwtExp(jwt: string): number {
  try {
    const payload = jwt.split('.')[1];
    const json = Buffer.from(payload, 'base64').toString('utf8');
    const exp = JSON.parse(json).exp as number | undefined;
    return exp ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

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
  const now = Date.now();

  // 1) warm 람다 메모리 캐시 (만료 5분 전까지 재사용)
  if (cached && now < cached.expiresAt - 5 * 60 * 1000) {
    return cached.token;
  }

  // 2) 사전 발급 env 토큰 — exp가 10분 이상 남았을 때만 신뢰
  const envToken = process.env.KIS_ACCESS_TOKEN;
  if (envToken && envToken.length > 20) {
    const exp = decodeJwtExp(envToken);
    if (exp > now + 10 * 60 * 1000) {
      cached = { token: envToken, expiresAt: exp };
      return envToken;
    }
  }

  // 3) 라이브 발급 (env 토큰 없음/만료)
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error('KIS keys not configured');
  }
  const { token, expiresIn } = await issueToken(appKey, appSecret);
  cached = { token, expiresAt: now + expiresIn * 1000 };
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

/* ── 호출 직렬화(throttle) ─────────────────────────────────────────────
 * KIS VTS 도메인은 "초당 거래건수" 제한(EGW00201)이 빡빡하다. 스크리너처럼
 * 한 요청에서 여러 종목을 조회할 때 동시 호출하면 즉시 막히므로, 모든 KIS
 * 데이터 호출을 한 줄로 세우고 최소 간격을 둔다. (모듈 스코프 = 같은 람다 내 공유)
 */
const KIS_MIN_GAP_MS = 700;
let _gate: Promise<void> = Promise.resolve();

export function kisThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _gate;
  let release!: () => void;
  _gate = new Promise<void>((res) => { release = res; });
  return (async () => {
    await prev;
    try {
      return await fn();
    } finally {
      setTimeout(release, KIS_MIN_GAP_MS);
    }
  })();
}

/** throttle·토큰·헤더·rt_cd 검사를 묶은 KIS GET 헬퍼. 실패 시 throw. */
export async function kisGet(
  path: string,
  trId: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const token = await getKisToken();
  const qs = new URLSearchParams(params).toString();
  const url = `${KIS_BASE}${path}?${qs}`;

  const doFetch = async () => {
    const res = await fetch(url, {
      headers: getKisHeaders(token, trId),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`KIS HTTP ${res.status}`);
    if (json.rt_cd != null && json.rt_cd !== '0') {
      throw new Error(`KIS ${json.msg_cd ?? ''}: ${json.msg1 ?? ''}`);
    }
    return json;
  };

  // 초당 제한(EGW00201)이면 throttle 간격을 두고 최대 3회 재시도
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await kisThrottle(doFetch);
    } catch (e) {
      lastErr = e;
      if (!String(e).includes('EGW00201')) throw e;
    }
  }
  throw lastErr;
}
