/**
 * Vercel CDN 캐시 헤더를 라우트 핸들러에 씌우는 감싸개.
 *
 * 개인용 앱이라 방문이 뜸해 캐시가 늘 만료돼 있다 → s-maxage(신선 구간)는 짧게,
 * stale-while-revalidate(만료 후에도 직전 값을 즉시 주고 뒤에서 갱신)는 길게 잡는 게 체감 속도의 핵심.
 * 정상(200) 응답에만 붙이고, 핸들러가 이미 Cache-Control을 정했으면 건드리지 않는다.
 * ⚠ 개인 데이터·게이트 라우트(bitget·sync·분석·코치)에는 쓰지 말 것 — CDN은 사용자 구분이 없다.
 */
export function withCdn<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
  sMaxAge: number,
  staleWhileRevalidate: number,
) {
  return async (...args: A): Promise<Response> => {
    const res = await handler(...args);
    if (res.status === 200 && !res.headers.has('Cache-Control')) {
      res.headers.set('Cache-Control', `s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`);
    }
    return res;
  };
}
