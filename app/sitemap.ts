import type { MetadataRoute } from 'next';

const BASE = 'https://kospi-lab.vercel.app';
const ROUTES = [
  '', '/stock-analysis', '/coin-analysis', '/journal', '/growth', '/screener', '/krx', '/news', '/dart',
  '/report', '/calendar', '/domestic', '/overseas', '/futures', '/my-stocks',
  '/portfolio', '/invest', '/tax', '/simulate', '/brokerage',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((r) => ({
    url: `${BASE}${r}`,
    changeFrequency: 'daily' as const,
    priority: r === '' ? 1 : r.includes('analysis') ? 0.9 : 0.6,
  }));
}
