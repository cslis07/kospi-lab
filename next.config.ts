import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 검색 노출 차단 — HTML이 아닌 응답(JSON·이미지 등)까지 noindex. 페이지는 layout metadata의 robots 메타도 함께.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default nextConfig;
