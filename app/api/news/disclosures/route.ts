import { NextRequest, NextResponse } from 'next/server';

const DART_BASE = 'https://opendart.fss.or.kr/api';

export interface DisclosureItem {
  title:   string;
  company: string;
  ticker:  string;
  url:     string;
  time:    string;
  source:  'DART' | 'KIND';
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

// ── DART 공시 목록 ────────────────────────────────────────────────────────────
async function fetchDartDisclosures(ticker?: string): Promise<DisclosureItem[]> {
  const dartKey = process.env.DART_API_KEY ?? '';
  if (!dartKey) return [];

  try {
    const today = todayStr();
    const params = new URLSearchParams({
      crtfc_key:  dartKey,
      bgn_de:     today,
      end_de:     today,
      sort:       'date',
      sort_mth:   'desc',
      page_no:    '1',
      page_count: '50',
    });
    if (ticker) params.set('stock_code', ticker);

    const res = await fetch(`${DART_BASE}/list.json?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = await res.json() as {
      status: string;
      list?: Array<{
        rcept_no:   string;
        corp_name:  string;
        stock_code: string;
        report_nm:  string;
        rcept_dt:   string;
      }>;
    };

    if (data.status !== '000' || !data.list?.length) return [];

    return data.list.map((d) => ({
      title:   d.report_nm,
      company: d.corp_name,
      ticker:  d.stock_code,
      url:     `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${d.rcept_no}`,
      time:    d.rcept_dt,
      source:  'DART' as const,
    }));
  } catch {
    return [];
  }
}

// ── KIND 공시 목록 (DART key 없을 때 fallback) ────────────────────────────────
async function fetchKindDisclosures(): Promise<DisclosureItem[]> {
  try {
    const res = await fetch('https://kind.krx.co.kr/disclosure/todaydisclosure.do', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent':   'Mozilla/5.0 (compatible; KOSPILab/1.0)',
        Referer:        'https://kind.krx.co.kr/disclosure/todaydisclosure.do',
      },
      body: 'method=searchTodayDisclosureSub&currentPageSize=50&marketType=&searchType=today',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const items: DisclosureItem[] = [];

    // Parse table rows: extract company, title, time, link via regex
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tdRegex  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const hrefRegex = /href=['"]([^'"]+)['"]/i;
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const tds: string[] = [];
      let tdMatch: RegExpExecArray | null;
      tdRegex.lastIndex = 0;
      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        tds.push(tdMatch[1]);
      }
      if (tds.length < 3) continue;

      // KIND table structure: [time, company, title, ...]
      const time    = stripTags(tds[0] ?? '');
      const company = stripTags(tds[1] ?? '');
      const titleCell = tds[2] ?? '';
      const title   = stripTags(titleCell);
      const hrefMatch = hrefRegex.exec(titleCell);
      const href    = hrefMatch ? hrefMatch[1] : '';

      if (!title || !company || !time.match(/^\d{2}:\d{2}/)) continue;

      const url = href.startsWith('http')
        ? href
        : href.startsWith('/')
          ? `https://kind.krx.co.kr${href}`
          : `https://kind.krx.co.kr/disclosure/todaydisclosure.do`;

      items.push({
        title,
        company,
        ticker: '',
        url,
        time,
        source: 'KIND',
      });
    }

    return items;
  } catch {
    return [];
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? undefined;

  const dartKey = process.env.DART_API_KEY ?? '';
  let items: DisclosureItem[];

  if (dartKey) {
    items = await fetchDartDisclosures(ticker);
    // If DART returns nothing (holiday / empty), also try KIND
    if (!items.length && !ticker) {
      items = await fetchKindDisclosures();
    }
  } else {
    items = await fetchKindDisclosures();
  }

  return NextResponse.json(items, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
