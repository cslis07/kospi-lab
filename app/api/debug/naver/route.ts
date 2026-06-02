/**
 * Naver Finance 응답 디버그 엔드포인트
 * 사용법: GET /api/debug/naver?code=005930
 * 실제 응답 구조를 확인하여 필드명을 파악하는 용도
 */
import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://m.stock.naver.com/api/stock';
const HDR: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://m.stock.naver.com/',
  Origin: 'https://m.stock.naver.com',
};

async function tryFetch(url: string) {
  try {
    const res = await fetch(url, {
      headers: HDR,
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    const text = await res.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep raw text */ }
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return { status: 0, ok: false, error: String(e) };
  }
}

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') ?? '005930').replace(/\D/g, '').slice(0, 6);

  const endpoints = [
    'basic',
    'finance/annual',
    'finance/summary',
    'finance/financial',
    'finance/info',
    'finance/ratio',
    'finance/detail',
    'indicator',
  ];

  const results: Record<string, unknown> = {
    code,
    testedAt: new Date().toISOString(),
    serverLocation: process.env.VERCEL_REGION ?? 'local',
  };

  await Promise.all(
    endpoints.map(async (ep) => {
      results[ep] = await tryFetch(`${BASE}/${code}/${ep}`);
    })
  );

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store, no-cache' },
  });
}
