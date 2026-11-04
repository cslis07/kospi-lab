/**
 * 계절성 쉬운 해석 — 한 달의 과거 통계(lib/seasonality SeasonStat)를 초보자용 문장으로. 순수 함수(테스트: tests/seasonInsight.test.ts).
 * 통계 해석 지원이지 매매 신호가 아니다: '상승 확률'은 '과거 n회 중 k회 상승(과거 상승 비율)'로만 말하고,
 * 평균·중앙값 차이는 '영향을 받았을 수 있다'로만 쓴다(원인 단정 금지). 최저 월 수익률은 MDD 가 아니다.
 */
import type { SeasonStat } from './seasonality';

export interface SeasonalityInsight {
  shortText: string;       // 차트 아래 안내 문구에 붙는 한두 문장
  sampleCaution: string;   // 표본 수에 따른 정보량 안내(신뢰도 점수 아님)
  riskDetail: string;      // 하락 횟수·최저·최고 월 수익률(툴팁용)
  isHistoricalOnly: true;
}

/** 화면과 같은 표기: +0.4% / −1.2% (U+2212) */
const sp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
/** 표시 단위(소수 1자리)에서 0으로 보이는 값은 부호 판단에서 0으로 본다 */
const sign = (v: number) => (Math.abs(v) < 0.05 ? 0 : v > 0 ? 1 : -1);

export function sampleCaution(n: number): string {
  if (n <= 0) return '분석 가능한 과거 기록이 없습니다.';
  if (n < 5) return '과거 사례가 너무 적어 패턴을 판단할 수 없습니다.';
  if (n < 10) return '표본이 적어 해석에 각별한 주의가 필요합니다.';
  if (n < 20) return '참고할 기록은 있으나 미래 예측 근거로는 제한적입니다.';
  return '과거 패턴 참고 자료이며 미래 방향을 보장하지 않습니다.';
}

/** 평균·중앙값·과거 상승 비율의 관계 한 문장 */
function relation(avg: number, median: number, up: number, down: number, n: number): string {
  const a = sign(avg), m = sign(median);
  const ratio = (up / n) * 100;
  if (a > 0 && m < 0) return `평균 ${sp(avg)}지만 중앙값은 ${sp(median)}라 일부 큰 상승의 영향을 받았을 수 있습니다.`;
  if (a < 0 && m > 0) return `중앙값은 ${sp(median)}지만 평균은 ${sp(avg)}라 일부 큰 하락의 영향을 받았을 수 있습니다.`;
  if (a > 0 && m > 0 && ratio >= 50) return `평균 ${sp(avg)}·중앙값 ${sp(median)}로 상승한 해가 조금 더 많았지만 하락한 해도 ${down}회 있었습니다.`;
  if (a < 0 && m < 0 && ratio <= 50) return `평균 ${sp(avg)}·중앙값 ${sp(median)}로 하락한 해가 더 많았지만 올해 하락을 뜻하지 않습니다.`;
  return `평균 ${sp(avg)}·중앙값 ${sp(median)}로 일관된 방향을 단정하기 어렵습니다.`;
}

export function buildSeasonalityInsight(assetName: string, s: SeasonStat | null | undefined, opts: { btc?: boolean } = {}): SeasonalityInsight {
  const label = `${assetName} ${s?.month ?? '?'}월`;
  const n = s?.n ?? 0;
  const caution = sampleCaution(n);
  if (!s || n <= 0 || s.avg == null || s.median == null) {
    return { shortText: `${label}: ${caution}`, sampleCaution: caution, riskDetail: '', isHistoricalOnly: true };
  }
  const up = s.up ?? Math.round(((s.upPct ?? 0) / 100) * n);
  const down = s.down ?? n - up;
  const pct = s.upPct ?? Math.round((up / n) * 100);
  const head = `${label}: 과거 ${n}회 중 ${up}회 상승(${pct}%)`;
  const risk = [
    `하락 ${down}회`,
    s.worst ? `최저 ${sp(s.worst.pct)}(${s.worst.year}년)` : '',
    s.best ? `최고 ${sp(s.best.pct)}(${s.best.year}년)` : '',
  ].filter(Boolean).join(', ') + (opts.btc ? ' · 월간 기록이라 일중 급락·레버리지 청산 위험은 담지 않습니다' : '');
  // 표본이 너무 적으면 관계 해석 대신 표본 부족을 먼저 말한다. 10회 이상이면 표본 수(n)가 이미 보이고
  // 바로 뒤 기존 안내가 '예측·신호 아님'을 말하므로, 화면 높이를 지키려 표본 안내는 툴팁(riskDetail 앞)으로 보낸다
  const body = n < 5 ? caution : n < 10 ? `${relation(s.avg, s.median, up, down, n)} ${caution}` : relation(s.avg, s.median, up, down, n);
  return { shortText: `${head}. ${body}`, sampleCaution: caution, riskDetail: n >= 10 ? `${caution} ${risk}` : risk, isHistoricalOnly: true };
}
