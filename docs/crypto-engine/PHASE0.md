# Macro & Crypto Intelligence Engine — Phase 0: 기존 소스 분석·중복 기능 파악

작성 2026-11-13 · 기준 커밋 `7231b69` · 읽기 전용 분석(코드 변경 없음)

## 0. 요약

- 요구 데이터의 **대부분은 이미 수집 중**이다(FRED 거시·네이버 시세·스테이블코인·ETF 유입·현물/선물 수급·뉴스·경제 캘린더).
- 의사결정 계층도 이미 여러 개다: `coinAnalysis`(룰 엔진 판정) · `entryRec`(추천 진입가) · `coinSignalModes`(스캘프·스윙·포지션) · `coinRegime`(ETH 4레이어 체제) · `riskControl`(진입 허용/차단) · `crashPrecursor`/`crashWarning`(급변 전조).
- **비어 있는 것**: ① 연준 인사 발언 구조화(누가·언제·매파/비둘기) ② 지정학·전쟁 위험 분류 ③ 뉴스 중복 제거(같은 사건 여러 매체) ④ 데이터 누락 시 판정 보류를 한곳에서 관리하는 계층 ⑤ 위 모든 입력을 한 번에 합치는 **단일 결정 객체**(현재는 화면마다 따로 계산).
- 측정 사실: 엔진 방향 판정의 백테스트 적중 **49.7%(우위 없음)**. 새 엔진도 같은 기준(사전 기록 → 사후 판정)으로 검증해야 하며, 검증 전에는 "신호"로 표시하지 않는다.

## 1. 요구 항목 ↔ 기존 모듈

| 요구 항목 | 기존 모듈(파일) | 소스 | 상태 |
|---|---|---|---|
| 미국 경제지표(CPI·PPI·고용) 실제값 | `lib/macroData.ts`, `lib/macroIndicators.ts` | FRED | 있음 |
| 발표 일정(시각) | `lib/macroSchedule.ts`, `lib/calendarOfficial.ts`, `lib/calendarEvents.ts` | FRED release calendar·공식 일정 | 있음 |
| 시장 예상치(컨센서스) | `app/api/econ/alert` + `loadNf('econcal_window.json')`, `lib/macroEvents.ts` | Nowflation 중계·SoSoValue | 있음 |
| CPI·PPI 자체 예상치 | `lib/priceForecast.ts`, `lib/priceForecastData.ts` | FRED + AI 기사 보정 | 있음 |
| 발표 알림 | `lib/econAlert.ts` | FRED → 텔레그램 | 있음 |
| 국채금리·DXY·WTI·브렌트 | `lib/naverStock.ts` INDICATORS·EXTRA, `lib/coinEnvLive.ts`, `lib/coinMacroContext.ts` | 네이버·FRED | 있음 |
| 나스닥·S&P | `lib/homeIndices.ts`, `lib/naverIndex.ts` | 네이버 | 있음 |
| 스테이블코인 시총 | `lib/stablecoinCap.ts`, `lib/coinSupply.ts` | DefiLlama | 있음 |
| BTC·ETH 현물 ETF 유입·유출 | `lib/etfFlow.ts`, `lib/etfEdge.ts` | SoSoValue | 있음 |
| 거래소 리저브·고래 | `lib/coinSupply.ts`(cexs), `lib/whaleTracker.ts` | DefiLlama·공개 | 일부(ETH 단독 리저브 없음 — 유료) |
| 현물 수요(코인베이스 프리미엄·CVD) | `lib/coinPremium.ts` | Coinbase·Bitget | 있음 |
| 선물 수급(펀딩·OI·롱숏·체결·청산) | `app/api/coin-analysis/route.ts`, `lib/derivsMulti.ts` | Bitget·바이낸스·바이비트·OKX | 있음 |
| 옵션(맥스페인·DVOL) | `lib/coinOptions.ts`, coin-analysis dvol | Deribit | 있음 |
| 공포·탐욕 | `lib/fearGreed.ts`, `lib/coinEnvLive.ts` | alternative.me | 있음 |
| 뉴스 | `lib/newsFeeds.ts`, coin-analysis `fetchNews`·`classifyNews` | 네이버·Google/Bing RSS | 있음(제목 단어 분류만) |
| 정책·규제 이벤트 | `lib/cryptoCatalysts.ts`, `lib/marketEvents.ts` | 수동 큐레이션 | 수동 |
| **연준 인사 발언** | `lib/priceForecastData.ts`의 헤드라인 + AI 보정(물가 한정) | 뉴스 제목 | **구조화 없음** |
| **지정학·전쟁 위험** | `lib/brief.ts` 키워드 일부 | 뉴스 제목 | **분류 없음** |
| **뉴스 중복 제거** | — | — | **없음** |

## 2. 의사결정·위험관리 계층(중복 후보)

| 모듈 | 하는 일 | 새 엔진과의 관계 |
|---|---|---|
| `lib/coinAnalysis.ts` `computeVerdict` | 1H·15m·5m 지표 + 파생 + 상위 추세 → 점수·방향·진입 가능·손절/목표(지금 진입 가정) | **입력으로 사용**(방향·레짐·게이트). 판정 규칙은 바꾸지 않음(백테스트·모의 테스트 기준) |
| `lib/entryRec.ts` `recommendEntry` | 가격대 근거 겹침 + 상황 점수 → 롱·숏 대기 자리·손절·목표·시나리오 | **진입가 계산기로 재사용**. 상황 점수 입력을 새 엔진의 거시·뉴스 점수로 교체/확장 |
| `lib/coinSignalModes.ts` | 스캘프·스윙·포지션 3모드 신호(TRADE/WATCH/NO_TRADE) | 중복 — 통합 시 모드 구분만 차용 |
| `lib/coinRegime.ts` | ETH 공급·수요·포지셔닝·옵션 4레이어 체제 라벨 | 거시·수급 점수의 하위 입력으로 재사용 |
| `lib/coinMacroContext.ts` | 10년물·실질금리·DXY 같은 방향 투표 → bias | 거시 점수의 핵심 입력 |
| `lib/riskControl.ts` | 손절 기준 포지션 크기 + ALLOW/BLOCK | 관망 사유(차단 게이트)의 공용 판정으로 재사용 |
| `lib/crashPrecursor.ts`, `lib/crashWarning.ts` | 급변 전조·폭락 경보 | 관망 사유 입력 |
| `lib/positionSizing.ts` | 수수료(메이커·테이커)·슬리피지·청산가 | 거래비용 반영에 재사용 |
| `lib/coinBacktest.ts`, `scripts/backtest-*.ts` | 룰 엔진 백테스트 | Phase 4 검증 틀 |
| `lib/paperJudge.ts` + `모의매매테스트.md` + `paper-remind.yml` | 사전 기록 → Bitget 1시간봉 자동 판정(라운드 R1~R34) | **선행 테스트 기반** — 새 엔진 후보를 같은 장부에 기록 |
| `docs/bnf/FORWARD.md` + `bnf-forward.yml` | BNF 모의 검증 봇(청산 30회 전 규칙 변경 금지) | 건드리지 않음 |

## 3. 지켜야 할 기존 제약(새 엔진에도 적용)

1. 자동 주문 없음 — Bitget 키는 읽기 전용(조회만).
2. 엔진 판정 규칙·백테스트·모의 테스트 규칙·BNF 봇 규칙 변경 금지(검증 기준이 흔들림). 새 엔진은 **별도 계층**으로 얹는다.
3. 확인되지 않은 가격·뉴스를 만들지 않는다 — 소스가 비면 "데이터 없음 → 판정 보류".
4. 주기적 서버 깨우기·새 크론 금지(Vercel Hobby CPU 예산) — 수집은 화면 요청 시 + 기존 GitHub Actions 범위 안.
5. 공개 저장소 — 키는 환경변수, 로그·커밋 금지. 잠긴 개인 데이터는 공개 ISR HTML 에 넣지 않는다.
6. 유료 AI 호출은 사용자 실행 버튼으로만(자동 점검 때 호출 금지). Anthropic 크레딧 소진 상태 → Gemini 대체 경로(`lib/llmBriefing.ts geminiRaw`) 있음.

## 4. Phase 1 통합 방침(첨부 엔진 확인 후 확정)

- 새 엔진은 `lib/intel/` 아래 **순수 함수**(입력 스냅샷 → 결정 객체)로 두고, 수집은 기존 모듈을 어댑터로 감싼다(중복 수집기 만들지 않음).
- 결정 객체: `{ symbol, asOf, dataQuality(누락 목록), holds(관망 사유), macroScore, flowScore, newsScore, candidates[{side, zone, entry, stop, targets, rr, costAdjRR, conditions}] }`.
- 진입가 계산은 `entryRec` 재사용, 방향·게이트는 `coinAnalysis` 판정을 입력으로만 사용.
- 선행 테스트: 후보를 `data/paper-trades.json` 형식으로 사전 기록 → `paperJudge` 로 판정(별도 태그로 엔진별 성적 분리).

## 5. 미완료·확인 필요

- **첨부 `KOSPI_LAB_CRYPTO_ENGINE_STARTER.zip` 을 찾지 못함**(다운로드·바탕화면·문서·세션 임시 폴더 검색). Phase 1(첨부 엔진 통합)은 이 파일 확인 후 진행.
- 연준 발언·지정학 분류는 무료 구조화 소스가 없어 뉴스 제목 기반 분류(+선택적 AI 보정) 설계가 필요 — Phase 2.
