import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    // 검색 노출 차단은 noindex(layout metadata + X-Robots-Tag)로 한다. 여기서 Disallow: / 로 막으면
    // 크롤러가 noindex를 못 읽어 이미 색인된 주소가 '차단됨'으로 남는다 → 페이지 크롤링은 허용.
    // sitemap도 유지: 크롤러가 목록을 돌며 noindex를 확인해 기존 색인을 더 빨리 지운다.
    rules: {
      userAgent: '*',
      allow: '/',
      // 개인 계좌·API 프록시는 크롤링 자체 제외
      disallow: ['/api/', '/bitget'],
    },
    sitemap: 'https://kospi-lab.vercel.app/sitemap.xml',
  };
}
