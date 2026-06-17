import { NextRequest, NextResponse } from 'next/server';
import { fetchKisFinancialRatio } from '@/lib/kisFinance';

export const maxDuration = 30;

/**
 * 투자성향별 대표 국내 우량주(참고용). 실시간 KIS 펀더멘털(ROE·부채·매출성장·PER)로 보강한다.
 * 종목 추천이 아니라 "각 성향이 실제로 어떤 지표의 종목인지" 보여주는 교육적 예시.
 */
const PICKS: Record<string, { code: string; name: string; tag: string }[]> = {
  safe: [
    { code: '005930', name: '삼성전자',   tag: '대형 우량' },
    { code: '105560', name: 'KB금융',     tag: '고배당 금융' },
    { code: '033780', name: 'KT&G',       tag: '경기방어' },
    { code: '000810', name: '삼성화재',   tag: '안정 보험' },
  ],
  neutral: [
    { code: '005930', name: '삼성전자',   tag: '대형 우량' },
    { code: '005380', name: '현대차',     tag: '대형 경기민감' },
    { code: '035420', name: 'NAVER',      tag: '플랫폼 성장' },
    { code: '012450', name: '한화에어로스페이스', tag: '방산 성장' },
  ],
  aggressive: [
    { code: '000660', name: 'SK하이닉스', tag: 'AI 반도체' },
    { code: '042700', name: '한미반도체', tag: 'HBM 장비' },
    { code: '035720', name: '카카오',     tag: '플랫폼' },
    { code: '247540', name: '에코프로비엠', tag: '2차전지' },
  ],
  ultra: [
    { code: '196170', name: '알테오젠',   tag: '바이오 고성장' },
    { code: '086520', name: '에코프로',   tag: '2차전지 고변동' },
    { code: '042700', name: '한미반도체', tag: 'HBM 장비' },
    { code: '003670', name: '포스코퓨처엠', tag: '양극재' },
  ],
};

export async function GET(req: NextRequest) {
  const risk = req.nextUrl.searchParams.get('risk') ?? 'neutral';
  const list = PICKS[risk] ?? PICKS.neutral;

  // 재무비율 1콜/종목만 사용 (시세는 클라이언트가 KRX 배치로 별도 조회 → KIS 초당제한 회피)
  const out = await Promise.all(
    list.map(async (p) => {
      const ratio = await fetchKisFinancialRatio(p.code);
      return {
        code:          p.code,
        name:          p.name,
        tag:           p.tag,
        roe:           ratio?.roe ?? null,
        debtRatio:     ratio?.debtRatio ?? null,
        revenueGrowth: ratio?.revenueGrowth ?? null,
        eps:           ratio?.eps ?? null,
      };
    }),
  );

  return NextResponse.json(out);
}
