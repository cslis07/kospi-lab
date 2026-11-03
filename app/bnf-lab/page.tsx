import BnfLabView from '@/components/bnf/BnfLabView';
import type { ExperimentIndexItem } from '@/lib/bnf/view';
import index from '@/data/bnf/index.json';

/** BNF형 이격도 역추세 선물 백테스트 연구실 — 독립 페이지(메뉴·사이트맵 미연결). 결과는 로컬에서 미리 계산(scripts/bnf-backtest.ts)한 정적 파일 */
export default function BnfLabPage() {
  return <BnfLabView index={index as ExperimentIndexItem[]} />;
}
