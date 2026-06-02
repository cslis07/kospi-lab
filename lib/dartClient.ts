/**
 * DART (금융감독원 전자공시) API Client
 * Base URL: https://opendart.fss.or.kr/api
 */

const DART_BASE = 'https://opendart.fss.or.kr/api';
const DART_KEY = () => process.env.DART_API_KEY ?? '';

// ── Module-level caches ───────────────────────────────────────────────────────
interface CacheEntry<T> { value: T; ts: number }

const corpCodeCache = new Map<string, CacheEntry<string | null>>();
const financialsCache = new Map<string, CacheEntry<DartFinancials | null>>();
const dividendsCache = new Map<string, CacheEntry<DartDividend | null>>();
const shareholdersCache = new Map<string, CacheEntry<DartShareholder[]>>();

const TTL_CORP_CODE   = 24 * 60 * 60 * 1000; // 24h
const TTL_FINANCIALS  =  1 * 60 * 60 * 1000; // 1h

// ── Type definitions ──────────────────────────────────────────────────────────
export interface DartCompany {
  corpCode:    string;
  corpName:    string;
  stockCode:   string;
  ceoNm:       string;
  corpCls:     string; // Y=유가, K=코스닥
  jurirNo:     string;
  bizrNo:      string;
  adres:       string;
  hm_url:      string;
  ir_url:      string;
  phNo:        string;
  faxNo:       string;
  industryCode: string;
  estDt:       string; // 설립일 YYYYMMDD
  accMt:       string; // 결산월 MM
}

export interface DartFinancials {
  ticker:          string;
  year:            number;
  fsDiv:           'CFS' | 'OFS';
  revenue:         number | null;
  operatingIncome: number | null;
  netIncome:       number | null;
  totalAssets:     number | null;
  totalLiabilities: number | null;
  totalEquity:     number | null;
  debtRatio:       number | null; // totalLiabilities/totalEquity * 100
  roe:             number | null; // netIncome/totalEquity * 100
  opMargin:        number | null; // operatingIncome/revenue * 100
}

export interface DartDividend {
  ticker:     string;
  year:       number;
  dps:        number | null; // 주당 배당금
  yieldPct:   number | null; // 배당수익률
  payoutRatio: number | null; // 배당성향
}

export interface DartShareholder {
  name:         string;
  shares:       number;
  ownershipPct: number;
}

// ── Helper: safe fetch with timeout ──────────────────────────────────────────
async function dartFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const key = DART_KEY();
  if (!key) throw new Error('DART_API_KEY not set');

  const qs = new URLSearchParams({ crtfc_key: key, ...params });
  const url = `${DART_BASE}/${endpoint}?${qs}`;
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DART HTTP ${res.status}`);
  return res.json();
}

// ── getCorpCode ───────────────────────────────────────────────────────────────
/**
 * Get 8-digit DART corp_code from 6-digit KR stock code.
 */
export async function getCorpCode(ticker: string): Promise<string | null> {
  const code = ticker.replace(/\.(KS|KQ)$/, '');
  const cached = corpCodeCache.get(code);
  if (cached && Date.now() - cached.ts < TTL_CORP_CODE) return cached.value;

  try {
    const data = await dartFetch('list.json', {
      stock_code: code,
      page_no:    '1',
      page_count: '1',
    }) as { status: string; list?: Array<{ corp_code: string }> };

    if (data.status !== '000' || !data.list?.length) {
      corpCodeCache.set(code, { value: null, ts: Date.now() });
      return null;
    }

    const corpCode = data.list[0].corp_code;
    corpCodeCache.set(code, { value: corpCode, ts: Date.now() });
    return corpCode;
  } catch {
    return null;
  }
}

// ── fetchDartCompany ──────────────────────────────────────────────────────────
/**
 * Fetch company profile from DART company.json
 */
export async function fetchDartCompany(ticker: string): Promise<DartCompany | null> {
  try {
    const corpCode = await getCorpCode(ticker);
    if (!corpCode) return null;

    const data = await dartFetch('company.json', { corp_code: corpCode }) as {
      status: string;
      corp_code: string;
      corp_name: string;
      stock_code: string;
      ceo_nm: string;
      corp_cls: string;
      jurir_no: string;
      bizr_no: string;
      adres: string;
      hm_url: string;
      ir_url: string;
      phn_no: string;
      fax_no: string;
      induty_code: string;
      est_dt: string;
      acc_mt: string;
    };

    if (data.status !== '000') return null;

    return {
      corpCode:     data.corp_code,
      corpName:     data.corp_name,
      stockCode:    data.stock_code,
      ceoNm:        data.ceo_nm,
      corpCls:      data.corp_cls,
      jurirNo:      data.jurir_no,
      bizrNo:       data.bizr_no,
      adres:        data.adres,
      hm_url:       data.hm_url,
      ir_url:       data.ir_url,
      phNo:         data.phn_no,
      faxNo:        data.fax_no,
      industryCode: data.induty_code,
      estDt:        data.est_dt,
      accMt:        data.acc_mt,
    };
  } catch {
    return null;
  }
}

// ── fetchDartFinancials ───────────────────────────────────────────────────────
/**
 * Fetch annual financial statements (fnlttSinglAcnt.json, reprt_code=11011).
 * Prefers CFS (연결재무제표) over OFS (개별재무제표).
 */
export async function fetchDartFinancials(
  ticker: string,
  year: number
): Promise<DartFinancials | null> {
  const code = ticker.replace(/\.(KS|KQ)$/, '');
  const cacheKey = `${code}:${year}`;
  const cached = financialsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_FINANCIALS) return cached.value;

  try {
    const corpCode = await getCorpCode(ticker);
    if (!corpCode) {
      financialsCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    const data = await dartFetch('fnlttSinglAcnt.json', {
      corp_code:   corpCode,
      bsns_year:   String(year),
      reprt_code:  '11011', // 사업보고서(연간)
    }) as {
      status: string;
      list?: Array<{
        fs_div:     string;
        account_nm: string;
        thstrm_amount: string;
      }>;
    };

    if (data.status !== '000' || !data.list?.length) {
      financialsCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    // Prefer CFS, fallback to OFS
    const cfsItems = data.list.filter((i) => i.fs_div === 'CFS');
    const ofsItems = data.list.filter((i) => i.fs_div === 'OFS');
    const items    = cfsItems.length ? cfsItems : ofsItems;
    const fsDiv    = cfsItems.length ? 'CFS' : 'OFS';

    const parseAmount = (s: string): number | null => {
      const n = Number(s?.replace(/,/g, ''));
      return isFinite(n) ? n : null;
    };

    const findAccount = (...names: string[]): number | null => {
      for (const name of names) {
        const item = items.find((i) => i.account_nm === name);
        if (item) return parseAmount(item.thstrm_amount);
      }
      return null;
    };

    const revenue          = findAccount('매출액', '매출(수익)');
    const operatingIncome  = findAccount('영업이익', '영업이익(손실)');
    const netIncome        = findAccount('당기순이익', '당기순이익(손실)');
    const totalAssets      = findAccount('자산총계');
    const totalLiabilities = findAccount('부채총계');
    const totalEquity      = findAccount('자본총계');

    const debtRatio = (totalLiabilities != null && totalEquity != null && totalEquity !== 0)
      ? Math.round((totalLiabilities / totalEquity) * 1000) / 10
      : null;
    const roe = (netIncome != null && totalEquity != null && totalEquity !== 0)
      ? Math.round((netIncome / totalEquity) * 1000) / 10
      : null;
    const opMargin = (operatingIncome != null && revenue != null && revenue !== 0)
      ? Math.round((operatingIncome / revenue) * 1000) / 10
      : null;

    const result: DartFinancials = {
      ticker:          code,
      year,
      fsDiv,
      revenue,
      operatingIncome,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      debtRatio,
      roe,
      opMargin,
    };

    financialsCache.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  } catch {
    financialsCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

// ── fetchDartDividends ────────────────────────────────────────────────────────
/**
 * Fetch dividend info from DART alotDvdnd.json
 */
export async function fetchDartDividends(
  ticker: string,
  year: number
): Promise<DartDividend | null> {
  const code = ticker.replace(/\.(KS|KQ)$/, '');
  const cacheKey = `${code}:${year}`;
  const cached = dividendsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_FINANCIALS) return cached.value;

  try {
    const corpCode = await getCorpCode(ticker);
    if (!corpCode) {
      dividendsCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    const data = await dartFetch('alotDvdnd.json', {
      corp_code:  corpCode,
      bsns_year:  String(year),
      reprt_code: '11011',
    }) as {
      status: string;
      list?: Array<{
        se:           string; // 구분
        stock_knd:    string; // 주식 종류
        thstrm:       string; // 당기
      }>;
    };

    if (data.status !== '000' || !data.list?.length) {
      dividendsCache.set(cacheKey, { value: null, ts: Date.now() });
      return null;
    }

    const parseNum = (s: string): number | null => {
      const n = Number(s?.replace(/,/g, '').replace(/%/, ''));
      return isFinite(n) && n !== 0 ? n : null;
    };

    // Look for common stock (보통주) rows
    const ordinaryRows = data.list.filter(
      (r) => r.stock_knd.includes('보통주') || r.stock_knd === ''
    );

    const dpsRow     = ordinaryRows.find((r) => r.se.includes('주당 현금배당금') || r.se.includes('주당배당금'));
    const yieldRow   = ordinaryRows.find((r) => r.se.includes('현금배당수익률') || r.se.includes('배당수익률'));
    const payoutRow  = ordinaryRows.find((r) => r.se.includes('현금배당성향') || r.se.includes('배당성향'));

    const result: DartDividend = {
      ticker:      code,
      year,
      dps:         dpsRow   ? parseNum(dpsRow.thstrm)   : null,
      yieldPct:    yieldRow  ? parseNum(yieldRow.thstrm) : null,
      payoutRatio: payoutRow ? parseNum(payoutRow.thstrm): null,
    };

    dividendsCache.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  } catch {
    dividendsCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
  }
}

// ── fetchDartShareholders ─────────────────────────────────────────────────────
/**
 * Fetch major shareholders from DART hyslrSttus.json
 */
export async function fetchDartShareholders(
  ticker: string,
  year: number
): Promise<DartShareholder[]> {
  const code = ticker.replace(/\.(KS|KQ)$/, '');
  const cacheKey = `${code}:${year}`;
  const cached = shareholdersCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_FINANCIALS) return cached.value;

  try {
    const corpCode = await getCorpCode(ticker);
    if (!corpCode) {
      shareholdersCache.set(cacheKey, { value: [], ts: Date.now() });
      return [];
    }

    const data = await dartFetch('hyslrSttus.json', {
      corp_code:  corpCode,
      bsns_year:  String(year),
      reprt_code: '11011',
    }) as {
      status: string;
      list?: Array<{
        nm:            string; // 주주명
        relate:        string; // 관계
        stock_knd:     string;
        bsis_posesn_stock_co:  string; // 기초 보유주식수
        trmend_posesn_stock_co: string; // 기말 보유주식수
        trmend_posesn_stock_qota_rt: string; // 기말 지분율
      }>;
    };

    if (data.status !== '000' || !data.list?.length) {
      shareholdersCache.set(cacheKey, { value: [], ts: Date.now() });
      return [];
    }

    const parseNum = (s: string): number => {
      const n = Number(s?.replace(/,/g, '').replace(/%/, ''));
      return isFinite(n) ? n : 0;
    };

    // De-duplicate by name, prefer ordinary stock
    const seen = new Set<string>();
    const result: DartShareholder[] = [];

    for (const r of data.list) {
      if (!r.stock_knd.includes('보통주') && r.stock_knd !== '') continue;
      if (seen.has(r.nm)) continue;
      seen.add(r.nm);
      const shares = parseNum(r.trmend_posesn_stock_co);
      const pct    = parseNum(r.trmend_posesn_stock_qota_rt);
      if (shares > 0) {
        result.push({ name: r.nm, shares, ownershipPct: pct });
      }
    }

    shareholdersCache.set(cacheKey, { value: result, ts: Date.now() });
    return result;
  } catch {
    shareholdersCache.set(cacheKey, { value: [], ts: Date.now() });
    return [];
  }
}
