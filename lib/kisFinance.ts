import { kisGet } from '@/lib/kis';

/**
 * 한국투자증권 국내주식 재무비율(FHKST66430300) 단건 조회.
 * Vercel에서 안정적으로 동작하므로 Yahoo/Naver가 차단됐을 때의 백업 소스로 쓴다.
 * 1회 호출로 ROE·부채비율·매출성장·EPS(흑자여부)를 얻는다. (영업이익률·FCF는 미제공)
 */

export interface KisFinancials {
  roe: number | null;            // 자기자본이익률 (연간)
  debtRatio: number | null;      // 부채비율 lblt_rate
  revenueGrowth: number | null;  // 매출액증가율 grs (YoY)
  eps: number | null;
  netIncomePositive: boolean | null;
  stacYymm: string | null;       // 기준 결산년월
}

interface RatioRow {
  stac_yymm?: string;
  grs?: string;        // 매출액증가율
  roe_val?: string;    // ROE
  lblt_rate?: string;  // 부채비율
  eps?: string;
}

function num(s: string | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* 재무 데이터는 분기마다 갱신되므로 성공 결과를 1시간 캐시한다.
 * (실패는 캐시하지 않아 일시적 초당제한이 결과를 오염시키지 않음) → 호출량·EGW00201 급감 */
const FIN_TTL = 60 * 60 * 1000;
const _finCache = new Map<string, { d: KisFinancials; ts: number }>();
const _opmCache = new Map<string, { d: number; ts: number }>();

export async function fetchKisFinancialRatio(code: string): Promise<KisFinancials | null> {
  const c = _finCache.get(code);
  if (c && Date.now() - c.ts < FIN_TTL) return c.d;
  try {
    const json = await kisGet(
      '/uapi/domestic-stock/v1/finance/financial-ratio',
      'FHKST66430300',
      { FID_DIV_CLS_CODE: '0', FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code },
    );
    const rows = (json.output as RatioRow[] | undefined) ?? [];
    if (!rows.length) return null;

    // 연간(12월 결산) 행 우선 — 분기 행은 ROE가 0으로 나오는 경우가 많다
    const annual = rows.filter((r) => r.stac_yymm?.endsWith('12'));
    const primary = annual[0] ?? rows[0];

    // ROE: 0이 아닌 가장 최근 연간 값 (최근 연간이 미확정이면 직전 연도)
    const roeRow = annual.find((r) => (num(r.roe_val) ?? 0) !== 0) ?? primary;

    const eps = num(primary.eps);
    const result: KisFinancials = {
      roe:               num(roeRow.roe_val),
      debtRatio:         num(primary.lblt_rate),
      revenueGrowth:     num(primary.grs),
      eps,
      netIncomePositive: eps != null ? eps > 0 : null,
      stacYymm:          primary.stac_yymm ?? null,
    };
    _finCache.set(code, { d: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

interface IncomeRow {
  stac_yymm?: string;
  sale_account?: string; // 매출액
  bsop_prti?: string;    // 영업이익
}

/**
 * 영업이익률(%) = 영업이익 / 매출액 × 100. 손익계산서(FHKST66430200) 1콜.
 * 분기 행은 왜곡되므로 가장 최근 연간(12월 결산) 행으로 계산. 실패 시 null.
 */
export async function fetchKisOpMargin(code: string): Promise<number | null> {
  const c = _opmCache.get(code);
  if (c && Date.now() - c.ts < FIN_TTL) return c.d;
  try {
    const json = await kisGet(
      '/uapi/domestic-stock/v1/finance/income-statement',
      'FHKST66430200',
      { FID_DIV_CLS_CODE: '0', FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code },
    );
    const rows = (json.output as IncomeRow[] | undefined) ?? [];
    const annual = rows.filter((r) => r.stac_yymm?.endsWith('12'));
    const row = annual[0] ?? rows[0];
    if (!row) return null;
    const sales = num(row.sale_account);
    const op = num(row.bsop_prti);
    if (sales == null || op == null || sales === 0) return null;
    const margin = Math.round((op / sales) * 1000) / 10;
    _opmCache.set(code, { d: margin, ts: Date.now() });
    return margin;
  } catch {
    return null;
  }
}

