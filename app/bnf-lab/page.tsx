import BnfLabView from '@/components/bnf/BnfLabView';
import { toView } from '@/lib/bnf/view';
import binance from '@/data/bnf/binance/results.json';
import bitget from '@/data/bnf/bitget/results.json';

/** BNF형 25일 이격도 역추세 ETH 선물 백테스트 연구 — 독립 페이지(메뉴·사이트맵 미연결). 결과는 로컬에서 미리 계산(scripts/bnf-backtest.ts)해 정적으로 싣는다 */
export default function BnfLabPage() {
  return <BnfLabView data={[toView(binance, 'Binance (1차)'), toView(bitget, 'Bitget (별도)')]} />;
}
