import type { MetadataRoute } from 'next';

const BASE = 'https://kospi-lab.vercel.app';
const ROUTES = [
  '', '/brief', '/stock-analysis', '/coin-analysis', '/journal', '/growth', '/screener', '/krx', '/news',
  '/report', '/calendar', '/domestic', '/overseas', '/futures', '/my-stocks',
  '/assets', '/invest', '/tax', '/simulate', '/brokerage', '/principles', '/study', '/study/chart', '/study/indicators', '/study/fibonacci', '/study/macro',
  '/industry', '/ranking', '/indicators', '/theme-etf', '/research', '/coins', '/overseas-analysis',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((r) => ({
    url: `${BASE}${r}`,
    changeFrequency: 'daily' as const,
    priority: r === '' ? 1 : r.includes('analysis') ? 0.9 : 0.6,
  }));
}
