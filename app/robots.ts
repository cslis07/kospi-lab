import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 개인 계좌·API 프록시는 색인 제외
      disallow: ['/api/', '/bitget'],
    },
    sitemap: 'https://kospi-lab.vercel.app/sitemap.xml',
  };
}
