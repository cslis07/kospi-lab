import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 검색 노출 차단 — HTML이 아닌 응답(JSON·이미지 등)까지 noindex. 페이지는 layout metadata의 robots 메타도 함께.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
  // Nowflation 중계 폴백 스냅샷(seed/nf/)을 /api/nf 함수 트레이스에 포함(상류 차단 시에만 사용).
  outputFileTracingIncludes: {
    '/api/nf/*': ['./seed/nf/**/*'],
  },
};

export default nextConfig;
