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

export async function fetchKisFinancialRatio(code: string): Promise<KisFinancials | null> {
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
    return {
      roe:               num(roeRow.roe_val),
      debtRatio:         num(primary.lblt_rate),
      revenueGrowth:     num(primary.grs),
      eps,
      netIncomePositive: eps != null ? eps > 0 : null,
      stacYymm:          primary.stac_yymm ?? null,
    };
  } catch {
    return null;
  }
}
