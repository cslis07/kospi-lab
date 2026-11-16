import type { NextConfig } from "next";

// 새 배포 감지용 빌드 버전(lib/appVersion) — 커밋 SHA, 없으면 배포 ID. 로컬은 빈 값(감시 끔)
const KL_BUILD = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || '';

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_KL_BUILD: KL_BUILD },
  // 검색 노출 차단 — HTML이 아닌 응답(JSON·이미지 등)까지 noindex. 페이지는 layout metadata의 robots 메타도 함께.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
  // 2026-10-27 메뉴 정리로 없앤 화면 — 옛 링크·북마크·텔레그램 링크 보호(임시 307: 나중에 주소를 다시 쓸 수 있게)
  async redirects() {
    const gone: [string, string][] = [
      ['/report', '/tools'], ['/growth', '/screener'], ['/invest', '/tools'], ['/tax', '/tools'], ['/brokerage', '/tools'],
      ['/virtual', '/tools#backup'], ['/macro', '/indicators'],
      ['/inflation/cart', '/inflation'], ['/inflation/my', '/inflation'], ['/inflation/calculator', '/inflation'],
      ['/inflation/prices', '/inflation'], ['/inflation/methodology', '/inflation'],
    ];
    return gone.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  // Nowflation 중계 폴백 스냅샷(seed/nf/)을 /api/nf 함수 트레이스에 포함(상류 차단 시에만 사용).
  outputFileTracingIncludes: {
    '/api/nf/*': ['./seed/nf/**/*'],
  },
};

export default nextConfig;
