/**
 * 코인 거시 배경 — 미국 10년물·실질금리·DXY 를 "같은 방향인지"로 읽는 프레임.
 *
 * 출처: 사용자 제공 교육자료 "미국 10년물·DXY·코인 채팅정리".
 *   핵심 = 하나만 보지 말고 10년물·실질금리·DXY 가 같은 방향을 가리키는지 확인한다.
 *     - 10Y↓ + 실질금리↓ + DXY↓ → 위험자산(코인)에 순풍 → 롱에 우호적 환경
 *     - 10Y↑ + 실질금리↑ + DXY↑ → 위험자산에 맞바람 → 숏에 우호적 환경
 *     - 엇갈리면 '방향 확인 필요'(뚜렷한 거시 바람 없음)
 *
 * ⚠ 앱 원칙(엣지 없음): 이것은 **배경 환경**일 뿐 단독 매수·매도 신호가 아니다.
 *   그래서 룰 엔진(buildVerdict) 점수에는 넣지 않는다 — 사이즈·레버리지 조절용 맥락으로만 쓴다.
 *   순수 함수라 tests/coinMacroContext.test.ts 로 고정한다.
 */

export type MacroDir = 'up' | 'down' | 'flat';
export type MacroBias = 'long' | 'short' | 'mixed';

export interface MacroRatesInput {
  /** 10년물 국채금리 일간 변화(%p) */
  us10ChangePp: number | null;
  /** 달러인덱스(DXY) 일간 변화(%) */
  dxyChangePct: number | null;
  /** 10년 실질금리(TIPS, FRED DFII10) 일간 변화(%p). 없으면 null */
  realYieldChangePp: number | null;
}

export interface MacroContext {
  dirs: { us10: MacroDir; dxy: MacroDir; realYield: MacroDir };
  /** 위험자산에 유리한 방향: long=순풍 / short=맞바람 / mixed=엇갈림 */
  bias: MacroBias;
  strength: '강' | '보통' | '약';
  /** 한 줄 요약(화면·AI 프롬프트 공용) */
  headline: string;
  /** 해석 + "신호 아님" 경고 */
  note: string;
  /** 위험회피(riskOff) vs 위험선호(riskOn) 표 수 */
  votes: { riskOff: number; riskOn: number; known: number };
}

/* 일간 변화의 '방향'으로 볼 최소 문턱 — 노이즈 제거용(배경 지표라 넉넉히) */
const RATE_PP = 0.02;   // 금리는 %p
const DXY_PCT = 0.15;   // DXY 는 %

function rateDir(pp: number | null): MacroDir {
  if (pp == null) return 'flat';
  if (pp >= RATE_PP) return 'up';
  if (pp <= -RATE_PP) return 'down';
  return 'flat';
}
function dxyDir(pct: number | null): MacroDir {
  if (pct == null) return 'flat';
  if (pct >= DXY_PCT) return 'up';
  if (pct <= -DXY_PCT) return 'down';
  return 'flat';
}

const ARROW: Record<MacroDir, string> = { up: '↑', down: '↓', flat: '→' };

/**
 * 10년물·실질금리·DXY 의 방향을 모아 거시 배경을 판정한다.
 * - up(=금리↑/달러↑)은 위험자산에 '맞바람' 한 표(riskOff),
 *   down 은 '순풍' 한 표(riskOn)로 센다.
 */
export function readMacroBias(input: MacroRatesInput): MacroContext {
  const dirs = {
    us10: rateDir(input.us10ChangePp),
    realYield: rateDir(input.realYieldChangePp),
    dxy: dxyDir(input.dxyChangePct),
  };
  const all: MacroDir[] = [dirs.us10, dirs.realYield, dirs.dxy];
  const riskOff = all.filter((d) => d === 'up').length;    // 금리·달러 상승 = 맞바람
  const riskOn = all.filter((d) => d === 'down').length;   // 금리·달러 하락 = 순풍
  const known = all.filter((d) => d !== 'flat').length;

  let bias: MacroBias;
  if (riskOff >= 2 && riskOn === 0) bias = 'short';
  else if (riskOn >= 2 && riskOff === 0) bias = 'long';
  else bias = 'mixed';

  const lead = Math.max(riskOff, riskOn);
  const strength: MacroContext['strength'] =
    bias === 'mixed' ? '약' : lead >= 3 ? '강' : lead >= 2 ? '보통' : '약';

  // 사람이 읽는 방향 나열 (알려진 것만)
  const parts: string[] = [];
  if (dirs.us10 !== 'flat') parts.push(`10년물${ARROW[dirs.us10]}`);
  if (dirs.dxy !== 'flat') parts.push(`달러${ARROW[dirs.dxy]}`);
  if (dirs.realYield !== 'flat') parts.push(`실질금리${ARROW[dirs.realYield]}`);
  const dirStr = parts.length ? parts.join('·') : '금리·달러 큰 변화 없음';

  let headline: string;
  let note: string;
  if (bias === 'short') {
    headline = `${dirStr} 동반 — 위험자산에 맞바람(숏에 우호적 환경)`;
    note =
      '금리·달러가 같이 오르면 이자 없는 코인의 기회비용·유동성 부담이 커진다. ' +
      '배경 환경일 뿐 매매 신호 아님 — 맞바람이면 롱은 레버리지·사이즈를 줄이는 쪽으로 본다.';
  } else if (bias === 'long') {
    headline = `${dirStr} 동반 — 위험자산에 순풍(롱에 우호적 환경)`;
    note =
      '금리·달러가 같이 내리면 위험자산에 돈이 돌기 쉬운 환경이 된다. ' +
      '배경 환경일 뿐 매매 신호 아님 — 순풍이어도 차트·수급·손절은 그대로 확인한다.';
  } else {
    headline =
      known === 0
        ? '금리·달러 큰 변화 없음 — 뚜렷한 거시 바람 없음'
        : `${dirStr} — 신호 엇갈림(방향 확인 필요)`;
    note =
      '10년물·실질금리·DXY 가 같은 방향이 아니라 거시 바람이 뚜렷하지 않다. ' +
      '같은 하락이라도 완화 기대면 우호, 경기침체 공포면 코인도 급락할 수 있어 "왜 움직이나"를 함께 본다.';
  }

  return { dirs, bias, strength, headline, note, votes: { riskOff, riskOn, known } };
}

/** AI 프롬프트에 넣을 거시 배경 블록(수치 라인 + 판정). 수치는 호출부에서 넘긴다. */
export function macroPromptBlock(ctx: MacroContext, valueLines: string[]): string {
  const lines = valueLines.length ? valueLines.join('\n') : '(수치 수집 실패)';
  return (
    `${lines}\n` +
    `판정: ${ctx.headline} (강도 ${ctx.strength}).\n` +
    `읽는 법: 10년물·실질금리·DXY 가 같은 방향이면 그 방향이 위험자산에 뚜렷한 바람(같이 오르면 맞바람·숏 우호, 같이 내리면 순풍·롱 우호). ` +
    `단, 이것은 배경 환경일 뿐 단독 진입 신호가 아님.`
  );
}
