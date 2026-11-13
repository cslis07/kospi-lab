# KOSPI LAB — Macro & Crypto Intelligence Engine

버전: 초기 구현/설계 패키지 v0.1 · 기준: 2026-11-13 · **실거래 사용 금지, 연구용**

## 0. 프로젝트 미션

기존 KOSPI LAB(Next.js + TypeScript) 기술적 진입가 계산과 거시/온체인/선물/뉴스 데이터 소스를 **독립된 의사결정 계층**에서 합성한다. 출력은 `롱/숏 단정`이 아니라 **조건부 후보 가격 구간 + 손절 + 목표 + 순손익비 + 트리거 + 관망·무효화 사유 + 데이터 출처/시각**. 방향 정렬 점수는 승률이 아니다. 수익 우위 미검증 상태로 자동 주문 금지.

기존 저장소: `https://github.com/cslis07/kospi-lab` (확인한 파일: `lib/coinAnalysis.ts`, `lib/entryRec.ts`, `lib/macroData.ts`, `lib/coinMacroContext.ts`, `lib/coinRegime.ts`, `lib/stablecoinCap.ts`, `lib/coinEnvLive.ts`, `lib/releaseReaction.ts`, `app/api/coin-analysis/route.ts`, `app/coin-analysis/page.tsx`, `tests/entryRec.test.ts`). 실제 최신 HEAD와 소스 구조를 Claude가 먼저 재확인할 것. **기존 엔진 코드를 삭제하지 말 것.**

## 1. 출력 계약

```ts
{
  symbol: 'ETHUSDT', asOf: 'ISO 8601 UTC',
  status: 'BLOCKED'|'NO_SETUP'|'WATCH'|'READY',
  bias: 'LONG_CONTEXT'|'SHORT_CONTEXT'|'MIXED'|'UNAVAILABLE',
  alignment: number|null, // -1..1, 정렬도/휴리스틱. 확률 아님.
  coverage: number, // 0..1, 제공 그룹 가중치 합
  selected: {
    side: 'long'|'short', strategy: 'pullback'|'breakout_retest'|'range',
    entry: number, zoneLow: number, zoneHigh: number,
    stop: number, target1: number, target2: number,
    rr1Net: number, rr2Net: number,
    triggerConfirmed: boolean, triggerDescription: string,
    maxNotionalUsd: number, modeledMaxLossUsd: number
  }|null,
  groupScores: {macro, liquidity, derivatives, news, technical},
  blocks: string[], reasons: string[], staleIds: string[], ignoredIds: string[],
}
```

`READY`는 오직 **모든 설정된 조건**이 형식상 충족된 상태. 높은 승률/수익성을 뜻하지 않는다. `BLOCKED` 중에도 후보를 참고자료로 보일 수 있지만 **거래 가능 표시 또는 알림 금지**. 비용·펀딩은 추정이므로 실제 최대 손실은 갭/청산/슬리피지로 더 커질 수 있다.

## 2. 데이터 취합 계획 (요청한 지표 전반)

| 계층 | 우선 지표 | 주기/시간 기준 | 우선 데이터 소스·주의 |
|---|---|---|---|
| 거시-물가 | CPI, Core CPI, PPI, Core PPI, Core PCE | **공식 발표 시각**에 갱신 | BLS/BEA, FRED(이력·리비전), 컨센서스는 계약된 데이터 제공자 필요 |
| 거시-고용 | 실업률, NFP, 주간 신규 실업수당 청구, ADP 참고 | 고용·청구 발표시간 | BLS/DOL, ADP는 NFP와 별개 |
| 거시-성장 | GDP, GDPNow, ISM 제조/서비스 PMI, 소매판매, 소비자심리 | 발표 시각 | BEA/ISM/Fed 연구 데이터, 전망과 확정치 분리 |
| 거시-통화정책 | FOMC, 기준금리, 점도표, Fed 발언, 미국채 2Y/10Y/30Y, 10Y TIPS 실질금리, 장단기차 | 시세: 거래일/수분, 이벤트: 즉시 | Fed, FRED/증권 시세. 발표/수치의 **실제 사용 가능 시각** 보관 |
| 거시-시장 | 달러인덱스 DXY, 광의 달러지수, USD/KRW, USD/JPY, 나스닥/나스닥100, VIX | 시세 출처별 지연표시 | DXY와 FRED 광의 달러지수는 다른 지수; 혼합 금지 |
| 거시-에너지 | WTI, 브렌트유, 유가 변동성 | 실시간/지연/일간 구분 | EIA 공식 일별 현물, 유료 선물 시세 등. WTI↔브렌트 중복가중 금지 |
| 코인-유동성 | 전체 스테이블코인 유통시총, USDT/USDC 7d/30d 순변화, 발행/상환, 온체인 공급 | 일간/시간 | DefiLlama, 공식 발행사. 시총 증가 = 즉시 매수 아님 |
| 코인-거래소 잔고 | BTC/ETH 거래소 보유량, 순변화(거래소 내/외), 거래소별 편차 | 시간/일 | CoinGlass API 등 허가된 온체인 데이터. **현물 테이커 순매수와 다른 지표** |
| 코인-현물 수급 | BTC/ETH 현물 거래량, 테이커 매수·매도, CVD, Coinbase 프리미엄, 한국 프리미엄 | 초/분 | 거래소·데이터업체, API 사용범위 및 거래량 단위 확인 |
| 코인-파생 | OI·OI변화, 펀딩, 선물 베이시스, 롱숏 계정 비율, 청산, 오더북 유동성 | 초/분 | 기존 Bitget/Bybit/Binance 연동 재사용, 거래소별 의미 구분 |
| 코인-ETF | BTC/ETH ETF 순유입·순유출, 발행사별 흐름 | 거래일 | 발행사/허가된 집계 제공자. 일중 추정치 ≠ 확정치 |
| 뉴스 | 전쟁·휴전·유가 공급 차질, 해킹, SEC·미 의회·재무부·백악관·Fed 발언 | 속보 및 공식 확인 시각 | 1차 공식 자료 우선. 출처 링크·원문·문맥·복수 보도·루머 여부 기록 |

### 구체적인 출처

- BLS 공식 일정(미 동부 표준/서머타임 자동 변환): https://www.bls.gov/schedule/2026/home.htm
- FRED API(일반 발표값): https://fred.stlouisfed.org/docs/api/fred/series_observations.html
- FRED/ALFRED 당시에 알 수 있던 데이터(리비전 누출 방지): https://fred.stlouisfed.org/docs/api/fred/realtime_period.html
- Fed 공식 연설·보도자료: https://www.federalreserve.gov/newsevents.htm
- EIA(APIv2, WTI/브렌트 등): https://www.eia.gov/opendata/documentation.php
- DefiLlama 스테이블코인: https://api-docs.defillama.com/ (`stablecoincharts/all`)
- CoinGlass 거래소 잔고: https://docs.coinglass.com/reference/exchange-balance-chart
- CoinGlass **현물 테이커 순흐름**: https://docs.coinglass.com/reference/spot-coin-netflow (거래소 지갑 입출금과 다름)

### 수집 우선순위

1. **기존 재사용 우선**: `macroData`, `stablecoinCap`, `coinEnvLive`, `coinAnalysis`, `coinMacroContext`, `coinRegime`, `entryRec`, Bitget 기능, 경제 캘린더. 동일 API 중복 요청 금지.
2. 없는 항목만 신규 수집기 추가. 제공자가 유료이거나 계약이 불확실하면 **null + 출처/결측 표시**, 0으로 대체하거나 다른 지표로 위장하지 말 것.
3. 모든 레코드에 `value`, `unit`, `source`, `availableAt`, `observedAt`, `ingestedAt`, `isDelayed`, `quality`, `revision`, `vintage`, `symbol`, `family` 보관. 발표 전에 실제값이 알려진 것처럼 보이지 않게.
4. 직전/실제/컨센서스/나우캐스트를 구분. **CPI·PPI 등 실제−예상 서프라이즈**는 비교 기준과 단위(전월비/전년비/계절조정)를 일치시킬 것.
5. 고정 UTC 저장, 렌더만 KST/ET 변환. EDT/EST는 시간대 DB로 변환; 미국 지표를 항상 13:30 UTC로 고정 금지.

## 3. 뉴스·영향력 있는 인물 발언 처리 규칙

A. 수집: 원문/발언자의 공식 자료가 최우선. Fed 연설/성명, SEC 공식 발표, 정부 문서. 언론은 2차 확인.

B. 정규화 구조: `{eventId, exactQuote, title, speaker, roleAtEvent, sourceUrl, publishedAt, firstSeenAt, credibility, topic, policyStance, surpriseVsMarketExpectation, likelyTransmission, verificationStatus, affectedAssets, invalidatedBy}`.

C. 예시: "월러가 금리를 올려야 한다"는 발언을 기사에서 발견해도 **시점/정확한 문맥/실제 발언**을 확인할 때까지 방향 점수 부여 금지. 사실이어도 시장이 이미 예상했는지, 국채금리/달러/나스닥이 이미 움직였는지 확인. 추정 발언을 사실로 쓰지 않기.

D. 사건 분류: `hawkish`, `dovish`, `inflation_shock`, `growth_shock`, `war_oil_supply`, `risk_panic`, `crypto_policy`, `exchange_outage`. 부호는 고정하지 않고 조건부(예: 유가 상승은 물가압력·위험회피로 작동하지만 산유국/특정 충격·경기 호황 때는 해석이 달라짐).

E. 중복 기사 50개라도 사건 하나로 묶어야 함. 하나의 사건이 DXY·10Y·나스닥에 연쇄 반영된 경우 뉴스+시장지표로 **같은 충격을 여러 번 세지 않도록** 공통 `eventId`/`family` 활용.

F. 위기 속보(전쟁 발발, 거래소 파산/중단, 전례 없는 통화정책 발표 등)는 우선 안전모드/거래 보류. 속보가 확정되어도 즉시 롱/숏 명령으로 변환하지 않는다.

## 4. 엔진 설계

1. **Collector/Normalizer**: 출처별 데이터 → 값/단위/타임스탬프/결측/지연/품질 포함. 장애 시 데이터 없음으로 처리.
2. **Features**: 1일·7일·30일 추세, 정규화된 경제지표 서프라이즈, 안정적인 수급 비율, 변동성·상관·시장체제. 동일 그룹 내 상관계열 패밀리 중복 제거.
3. **Macro Regime**: 물가·성장·금리·달러·주식·유가의 조합으로 순풍/맞바람/혼조. 큰 금리 인하가 **침체 공포** 때문에 나온 상황은 자동 롱으로 처리하지 않는다.
4. **Positioning/Flow**: BTC·ETH 현물 거래/거래소 잔고/ETF/스테이블코인/OI/펀딩으로 자금 유입의 양과 질을 구분. OI 상승은 롱 증가와 동의어가 아님.
5. **Event Guard**: 중요 발표 60분 전~30분 후(초기 보수적 예시; 검증 후 조정), 미확인 중대 속보, 데이터 결측 등은 BLOCKED.
6. **Price Setup Engine**: 기존 `entryRec.ts`의 구체적 **진입 구간·손절·목표**를 재사용하되 1H/4H/1D 추세+15m/5m 진입 트리거(닫힌 봉)/스프레드/체결비용/바로 앞 지지·저항·슬리피지 조건을 검사.
7. **Risk & Validation**: 비용 반영 목표손익비, 최대 허용 계좌손실, 최대 명목 포지션/증거금 상한, 청산가격과 손절 사이 안전 여유. 실제 손익은 스탑 미체결과 갭 리스크로 계산보다 나빠질 수 있음.
8. **Decision**: READY/WATCH/NO_SETUP/BLOCKED + 근거/결측/반대 근거. 상태는 주문 명령이 아님.
9. **Evidence Log**: `decision_id`, 입력 데이터 스냅샷 해시, 모델/가중치 버전, 가격 후보 및 이유, 실제 알림 시각, 이후 미리 정한 판정 정책에 따른 체결·미체결/손익을 append-only 저장.

### v0.1 프로토타입의 제한

`lib/decisionEngine.ts`는 네트워크 없는 **순수 평가 함수**. 샘플 신호의 `direction`, `strength`, `reliability`를 **실제 지표에서 만들어 주는 정규화 수집기/Feature/상황 분석 모델은 아직 연결되지 않음**. 가중치 (거시 23%, 유동성 19%, 파생 17%, 뉴스 11%, 기술 30%)와 임계값(±0.20, R≥1.6 등)은 임시값이며 통계 검증 없이 생산에 사용 금지. 한 그룹 점수는 선행 근거의 품질이나 적중률이 아닌 **해당 그룹에서 유효한 데이터의 방향 정렬도**다.

평가 결과에는 계좌 규모 기준 **예상 손실액**이 나오지만, 이는 사전에 정한 스탑이 체결된다는 가정이다. 강제청산·갭·주문 실패·실제 수수료·변동 펀딩 모두 별도 검사해야 한다. API 오류 시 과거 값을 재활용해 `READY`를 생성해서는 안 된다.

## 5. 데이터 저장과 백그라운드 스케줄링

`raw_observations`(immutable source events), `features`(버전관리), `market_snapshots`, `news_events`, `economic_events`, `decision_snapshots`, `paper_orders`, `paper_fills`, `outcomes`, `calibration_reports`, `provider_health` 테이블 후보.

- API 키/시크릿 **서버에만**, 로깅 금지. 공급자별 요금·라이선스·지연을 확인하고 제한에 맞춰 캐시.
- 시장 캔들은 거래소 WS/REST 수초~분, 미 국채/유가/나스닥은 라이선스와 지연 상태에 따라 분~일, 온체인 시간~일, CPI/PPI 실제값은 **발표 때만** 갱신. 모두 동일한 '실시간'으로 표시하지 않기.
- 기존 Vercel Hobby Cron 할당량이 포화되었다면 임의로 크론을 늘리지 말고, **기존 스케줄러/GitHub Actions/승인된 별도 잡/호출 기반 갱신** 중 비용·제한을 검토한다.
- 가능하면 거래 신호는 서버에서 평가해 기록하고 웹은 읽기 전용으로 조회, 재검증 결과와 계산 설정을 저장한다.

## 6. 검증과 합격 조건

**우선 통과해야 할 사항:**

- 유효하지 않은 가격, 미래 시점 데이터, 오래된 가격 데이터, 제공자 장애, 승인되지 않은 뉴스, 중대 이벤트 직전에는 `READY` 생성 금지.
- WTI/브렌트 동일 유가 충격, DXY/달러지수 동일 통화 충격, 한 발언 복수 기사 등의 중복 신호 가중 제한.
- 온체인 거래소 입출금과 현물 매수/매도 체결 규모를 혼동하지 않기.
- `entryRec.ts` 기존 테스트 유지, `decisionEngine` 신규 테스트, 불변식(롱: 손절 < 진입 < 목표, 숏은 반대), UTC↔KST/ET/DST, 비용·포지션 상한 검사.
- **Point-in-time 백테스트**: 경제자료 리비전 이전 값(빈티지), 지표 컨센서스 당시 값, 이벤트 원문 게시 최초 시각, 지연, 수수료·펀딩·슬리피지, 스톱 미체결, 상관/시퀀스 반영.
- Walk-forward 검증: 개발 구간/독립 평가 구간 분리, 코인/장세/롱숏/전략별 통계, 순 기대 R·최대 낙폭·PF·비용. BTC·ETH 여러 신호가 같은 거시 이벤트를 공유하므로 독립 표본 아님.
- **무작위·단순 베이스라인**과 비교, 관망의 기회비용 포함, 전략 가중치 변경 전후 지표는 같은 독립 구간에서 비교하지 않기.
- 실시간 시그널 생성→최초 등록값 고정→진입 후보 도달·트리거 검증·미체결 기록→지정한 판정 시점의 R 계산.
- 사전 등록된 평가 계획에서 실제 거래 비용 차감 후 안정적 순 기대값과 허용 가능한 낙폭이 확인될 때만 실전 매매 활용을 별도 결정.

## 7. 구현 단계 및 작업 순서

**Phase 0 (현황 점검):** 최신 HEAD/기존 API/변경 파일 확인, 이전 엔진의 엣지 없음 결과 유지, 어떤 데이터가 실제 실시간인지 목록 작성.

**Phase 1 (이번 작업 범위):** 독립 `decisionEngine.ts`, `bridgeEntryRec.ts`, 신규 테스트 통합 → 기존 `entryRec` 후보를 연결한 진입 플랜 출력 및 기본 관망/이벤트 위험 게이트. 수집기 미완료는 필드 null; mock 입력으로 `READY` 되어도 실제 UI에 실전 신호로 표시하지 말 것.

**Phase 2 (데이터 연결):** 기존 경제/코인 데이터의 신뢰성·시점 표준화, 실제 공급원 커넥터, Fed·지정학 뉴스 이벤트 검증, 공급자별 상태 패널. 데이터 없는 그룹/미계약 API는 우회하지 말 것.

**Phase 3 (검증):** point-in-time + forward paper, 거래소 슬리피지·거래비용 계측, 동적 시장체제 모델과 가중치 보정. 과거 결과가 음수면 '관망 우선' 유지.

**Phase 4 (전체 KOSPI LAB 통합):** 코인 홈 진입가 카드, 뉴스 충격 보드, 데이터 건강 상태, 성과 검증, 모바일 UI, 백그라운드 알림. 기존 주식/경제 캘린더/매매일지/시뮬레이터 보존.

## 8. Claude에게 중요한 구현 주의

1. 패키지에는 Next 라우트와 DB/외부 API 키가 없음. **실제 데이터 연동·배포 완료라고 주장하지 말 것.**
2. 최신 KOSPI LAB `AGENTS.md`: Next.js 버전이 일반적인 지식과 다름. 로컬 node_modules의 `next/dist/docs/` 확인 후 라우트 추가.
3. 기존 `lib/entryRec.ts`는 UI 표시용 가격 후보이고 기존 정확도/연구 결과는 엣지 없음. 진입가가 구체적이어도 신뢰도·승률 부여 금지.
4. 실제 서비스에서는 `READY` 대신 '조건 충족(실험)'처럼 표현하고, 외부 주문 API는 건드리지 말 것.
5. 분석 실패 시 기존 앱은 정상 작동해야 함. Feature flag `CRYPTO_DECISION_ENGINE_V1` 추천. 오류/배포 시 롤백 가능.
