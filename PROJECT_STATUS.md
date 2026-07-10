# KOSPI LAB — Project Status

> 마지막 업데이트: 2026-07-09
> 위치: `C:\Users\GB\Documents\kospi-lab`
> 배포: [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · GitHub `cslis07/kospi-lab`
> 규모: API 라우트 36 · 페이지 23 · lib 19 · hooks 8

---

## 1. 프로젝트 목적

**국내·해외 주식 + 코인 + 선물 통합 투자 대시보드.**

한 곳에서 실시간 시세·재무지표·뉴스·공시·계좌 잔고·시장 랭킹을 보고, 본인 성향에 맞춘 투자 설계와 절세·시뮬레이션까지 끝낼 수 있게 하는 개인용 도구.

**최근 방향성 — "오답률을 줄이는 검증 가능한 분석 도구"**
단순 시세 조회를 넘어, 주식·코인 각각에 **룰 엔진 + 자동 백테스트 + 다층 신호(수급·공시·정책·매크로)** 를 붙여 "지금 사도 되는가"를 근거와 함께 답하고, 그 신호가 최근 장세에서 실제로 맞았는지까지 데이터로 보여준다.

- 스택: **Next.js 16 App Router** · React 19 · TypeScript · Tailwind · Recharts · SWR
- 로그인 없이 동작(보유·관심·매매일지는 localStorage), Bitget만 API 키로 본인 계좌 조회
- 배포: Vercel(자동), `git push origin main` → 자동 빌드 → 30~40초 후 Ready

---

## 2. 현재 구현된 기능

### 🔬 분석 (Analysis) — 이 프로젝트의 핵심

#### **국내주식 분석** `/stock-analysis` ★ 신규
코인 분석과 동일한 철학을 한국 시장 특성(투자자 수급·공시·정책)에 맞춰 재구성. 개인은 공매도가 어려워 **매수우위 / 중립 / 비중축소** 3분류.

- **종목명 자동완성 검색** — "삼성전자", "카카오" 입력 시 드롭다운(우선주 후순위 정렬), 6자리 코드 직접 입력도 지원
- **룰 엔진 (점수 -100~+100)**
  - 일봉 추세: EMA20/60/200 배열, 시장구조(HH·HL / LH·LL), RSI, MACD, 거래량, 52주 위치
  - **투자자 수급 (한국 시장 핵심 신호, 최대 ±35 가중)**: 개인·외국인·기관 10일 순매수 + **외국인 보유율 추세**. "외국인 연속 순매도 + 개인만 매수 = 물량받기 약세구도" 자동 검출
  - 밸류에이션 품질 필터: PER·PBR·ROE·부채비율 → 재무 A~D 등급 (방향이 아닌 안전마진 검증)
  - **DART 공시 자동 분류**: 유상증자·CB/BW·감자·횡령(악재) / 자사주 매입·소각·수주·흑자전환(호재) / 잠정실적·최대주주변경(중요)
  - **정부정책·테마 감지**: 금리 인하/인상, 정부 지원·부양, 규제·제재, 반도체 특별법, 밸류업 정책 키워드 스캔
  - **메릴린치 CIO 업종의견** (2026.6.29 보고서): 종목→GICS 11업종 매핑 후 비중확대/중립 반영
- **"지금 왜 오르나/내리나"** — 수급 주체·보유율 변화·거래량·52주·코스피 동조·공시·정책·환율 급변동 드라이버
- **⭐ 필수 경제지표 패널 (전부 실측 자동수집, 6h 캐시)**
  | 지표 | 소스 |
  |---|---|
  | 미국 물가(CPI YoY) | FRED (BLS 폴백) |
  | 원-달러 / 엔화 | 라이브 (Frankfurter·업비트) |
  | 반도체 수출(HS 8542) | 관세청 |
  | 가계부채(가계신용) / 부동산(주택가격지수) | 한국은행 ECOS |
- **일봉 캔들차트** — EMA20/60·지지저항·피보나치·진입/손절/익절 레벨 오버레이 (X축 날짜)
- **룰 엔진 백테스트** — 과거 1년 일봉으로 매수신호 승률·기대값 자동 산출 (진입가·손절가 포함)
- **투자자 수급 10일 테이블** (보유율 추이) · **DART 공시 목록** · **종목뉴스 호재/악재 태깅**
- **AI 브리핑** — 【지금 왜 움직이나】【수급 해석】【공시·정책 체크】【업종·매크로】【종합 판단】
- 손절폭 3~15% 제한 (일봉 ATR 기반 + 구조 지지선)

#### **코인선물 분석** `/coin-analysis` (BTC·ETH·XRP·SOL)
- **다중 타임프레임 룰 엔진**: 1H 방향 → 15m 구조 → 5m 트리거 (EMA·VWAP·RSI·MACD·볼린저·ATR·시장구조)
- **파생 수급 정밀** — 테이커 매수/매도 불균형 + **주문흐름 다이버전스**, OI 1시간 변화 4분면 해석(신규롱/숏커버/신규숏/롱정리), **계정 vs 포지션 금액 롱숏 격차(개미 vs 큰손)**
- **"지금 왜 오르/내리나"** — BTC 동조, 급변 캔들(청산 연쇄 추정), 거래량, 펀딩 변화, 롱숏비율 추이, RSI 다이버전스, 뉴스 감성, 공포탐욕, 김프
- **시장 심리 지표** — 공포탐욕지수(alternative.me) · 김치 프리미엄 · 펀딩 히스토리 · BTC DVOL(Deribit) · BTC 도미넌스(CoinGecko)
- **룰 엔진 성적표** — 과거 5m×1000봉 자동 백테스트 (10분 캐시), 승률·기대값·진입가/손절가
- **경제 이벤트 자동 차단** — FOMC·CPI·NFP 12시간 내 진입 차단 + 배너
- **캔들 차트** 5m/15m/1H 토글 (Recharts 커스텀 shape)
- **자동갱신**(1분) · **조건 알림**(브라우저 Notification, 5분 쿨다운) · **매매일지 + 자동 채점**(캔들 대조 승패 판정)
- 권장 레버리지·손절·익절 + 포지션 사이징 계산기

#### 기타 분석
- **버핏 스크리너** `/screener` — 7기준 4-소스 폴백(Yahoo→Naver→KIS→DART)
- **KRX 시장** `/krx` — 주요지수 + 전종목 랭킹(5탭) + ETF 랭킹(3탭) + 상품(금·유가)
- **뉴스** `/news` · **공시** `/dart` · **리포트** `/report` · **캘린더** `/calendar`

### 시장 (Markets)
- **국내주식** `/domestic` · **해외주식** `/overseas`(레버리지 ETF 등 Yahoo 실시간 검색 폴백)
- **코인** `/my-stocks?market=crypto` + `/crypto/[symbol]` · **선물** `/futures` (Bitget USDT-Perp 649종)

### 내 자산 (Holdings)
- **통합 자산** `/portfolio` · **내 주식** `/my-stocks` · **비트겟 포트폴리오** `/bitget`

### 설계 (Planning)
- **투자설계** `/invest` · **세제혜택** `/tax` · **증권사비교** `/brokerage`
- **시뮬레이션** `/simulate` — 통화 토글
  - **원화 모드**: 복리 적립 시뮬 (FV 계산 + 프리셋 + 차트)
  - **USDT 모드**: **코인 선물 레버리지 손익 계산기** (BTC·ETH·XRP·SOL 탭, 증거금·배율·롱숏·**목표가 직접 입력** → 예상 손익 + **한화 환산** + 청산가 근사 + 가격 변동별 빠른 손익표)

### 종목 상세 `/stock/[ticker]`
실시간가·차트(MA/BB/RSI·비교차트) · 투자자 수급 · KRX 상장정보 · DART 기업개요/재무/배당 · KIS 투자지표 · AI 분석

### 공통 UX
- **Header:** 글로벌 검색(⌘K), KOSPI · **USD/USDT/JPY 환율** · 시장 개·폐장
- **NavTabs:** 데스크탑 4그룹 드롭다운 / 모바일 햄버거
- **이용가이드** `/guide.html` · 다크/라이트 토글 · 모바일 반응형

---

## 3. 수정한 주요 파일

### 분석 엔진 (`lib/`) — 이번 세션 신규
| 파일 | 용도 |
|---|---|
| `lib/stockAnalysis.ts` | ★ **주식 분석 엔진** — 투자자 수급(analyzeSupply)·재무등급(gradeFinancials)·DART 공시 분류(classifyDisclosure)·정책 감지(detectPolicy)·종합판정(buildStockVerdict) |
| `lib/stockBacktest.ts` | ★ 주식 일봉 백테스트 (매수신호 → 1R 익절 vs 손절) |
| `lib/marketReference.ts` | ★ **상시 참고자료** — 메릴린치 CIO 업종의견(2026.6.29) + 종목→GICS 업종 매핑 + 필수 경제지표 정의 |
| `lib/macroIndicators.ts` | ★ **경제지표 실측 수집** — FRED(CPI)·ECOS(가계부채·부동산)·관세청(반도체수출), 6h 캐시 |
| `lib/coinAnalysis.ts` | **코인 분석 엔진** — 지표·스윙·지지저항·피보나치·RSI 다이버전스·급변 캔들·buildVerdict |
| `lib/coinBacktest.ts` | 코인 5분봉 백테스트 |

### 기존 라이브러리
| 파일 | 용도 |
|---|---|
| `lib/krx.ts` | KRX 공식 API 클라이언트 (랭킹·지수·ETF·종목기본정보) |
| `lib/kis.ts` · `lib/kisFinance.ts` | KIS 토큰 자가치유·throttle / 재무비율·영업이익률(1h 캐시) |
| `lib/bitget.ts` | 스팟·선물 티커 + HMAC 서명 |
| `lib/dartClient.ts` · `lib/calendarEvents.ts` | DART / FOMC·CPI·NFP 일정 |
| `lib/naverFinance.ts` · `naver.ts` · `stockList.ts` · `krStocks.ts` | Naver 시세·지수 / 종목 목록 |

### 페이지 (`app/`)
| 경로 | 비고 |
|---|---|
| `app/stock-analysis/page.tsx` | ★ 국내주식 분석 (종목명 검색·수급·공시·정책·매크로) |
| `app/coin-analysis/page.tsx` | ★ 코인선물 분석 (다중 TF·파생수급·백테스트·매매일지) |
| `app/simulate/page.tsx` | 원화 복리 / USDT 레버리지 계산기 토글 |
| `app/overseas/page.tsx` | 정적목록 + Yahoo 실시간 검색 폴백 |
| `app/krx/page.tsx` · `app/portfolio` · `app/futures` · `app/bitget` | 기존 |

### 컴포넌트 · 훅
- `components/CoinCandleChart.tsx` — ★ Recharts 커스텀 캔들 shape (EMA·지지저항·피보나치·매매레벨, `xAxis` 시간/날짜 옵션 → 코인·주식 공용)
- `components/NavTabs.tsx` · `Header.tsx`(USDT 환율 pill) · `GlobalSearch.tsx`
- `hooks/useCoinJournal.ts` · `useCoinAlerts.ts` — ★ 매매일지·조건 알림

---

## 4. 남은 작업

### 개선 여지
- [ ] **DART 공시 목록 정렬** — "임원·주요주주 소유상황보고서" 등 정기 신고가 다수 노출. 의미 있는 공시(호재/악재/중요)를 상단 우선 정렬하거나 정기 신고 접기
- [ ] **주식 백테스트에 수급 미반영** — 과거 시점 투자자 수급 데이터가 없어 기술적 신호만 검증 (실전 판정은 수급 포함하므로 백테스트가 보수적)
- [ ] **가계부채 데이터 지연** — ECOS 가계신용은 분기 데이터라 최신 분기가 1~2분기 뒤처짐
- [ ] 해외/코인 portfolio 수기 입력 (현재 통합자산은 국내주식+Bitget만)
- [ ] DART 배당 `payoutRatio` 서브필드 매칭 개선 (dps·수익률은 정상)
- [ ] 스크리너 FCF (KIS 현금흐름표 미제공 — Yahoo만)

### 확장 여지 (KRX 추가 API — 활용신청·승인 필요)
- [ ] **채권(bon)** / **파생(drv)** / **ESG** — 현재 미승인 401. data.krx.co.kr에서 활용신청 후 `lib/krx.ts`에 추가

### 보류 (구조적 한계)
- ❌ **코인 청산 히트맵** — CoinGlass 유료. Binance/Bybit 청산 스트림은 무료지만 **웹소켓 상시 수신 필요 → Vercel 서버리스 불가**. 현재는 급변 캔들 감지가 무료 대안
- ❌ **온체인 고래·거래소 유입출** — CryptoQuant·Glassnode 유료
- ❌ Bitget 카피트레이딩(trace 권한)·WebSocket(서버리스)·Place-Order(안전)
- ❌ 토스증권 API(공개 API 없음) · KRX MDC 공개엔드포인트(anti-bot LOGOUT 차단)

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\kospi-lab

npm run dev                  # 개발서버 (localhost:3000, 점유 시 --port 3021 등)
npm run dev -- --port 3025   # 포트 지정 (.env.local 변경 시 반드시 재시작)
npx tsc --noEmit             # 타입체크 (커밋 전 필수)
npm run build                # 프로덕션 빌드 (lint 포함 — 미사용 변수도 실패 처리)

git push origin main         # = Vercel 자동 배포
vercel --prod --yes          # 즉시 배포 (env 변경 후 필수)
vercel env ls production     # env 목록 확인
echo "값" | vercel env add KEY_NAME production   # env 추가 (⚠ env pull 금지)

gh auth switch --user cslis07 && gh auth setup-git   # push 403 시
```

### 배포 확인 (프로덕션 전파 폴링)
```bash
# 새 필드가 배포됐는지 확인하는 패턴
until curl -s "https://kospi-lab.vercel.app/api/stock-analysis?ticker=005930" | grep -q '"macro"'; do sleep 15; done
```

---

## 6. 배포 관련 주의사항

### GitHub 인증
- gh CLI에 두 계정: `cslis07`(소유자), `histobio0302-oss`
- push 403 시: `gh auth switch --user cslis07 && gh auth setup-git`

### ⚠️ `vercel env pull` 절대 금지
`env pull`은 로컬 `.env.local`을 Vercel 값으로 덮어써서 **로컬 전용 키가 삭제**된다. env 추가는 반드시 `vercel env add`만 사용.

### Vercel 환경변수 (변경 후 **반드시 재배포**)
| 키 | 용도 | 상태 |
|---|---|---|
| `KRX_API_KEY` | KRX 공식 API | Vercel + `.env.local` |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART 공시·재무 | Vercel |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기전용 | 양쪽 |
| `ANTHROPIC_API_KEY` | AI 브리핑 (주식·코인) | Vercel |
| `ECOS_API_KEY` | 🆕 한국은행 (가계부채·부동산) | 양쪽 |
| `FRED_API_KEY` | 🆕 미국 CPI | 양쪽 |
| `CUSTOMS_API_KEY` | 🆕 관세청 (반도체 수출) | 양쪽 |

### 리전 고정 (`preferredRegion = 'icn1'`)
`/api/coin-analysis`, `/api/stock-analysis`는 **서울 리전 고정**. 이유:
- **Bybit·업비트가 미국 데이터센터 IP를 차단** (기본 iad1에선 실패)
- 네이버·KIS·ECOS·관세청 등 한국 API 응답속도 개선

### API별 특이사항
- **KRX**: 인증키만으론 부족 — **각 API "활용신청" 승인** 필요(미승인 401). 헤더 `AUTH_KEY`. **MKTCAP은 원 단위**(×1e6 금지)
- **KIS**: 앱키가 모의(VTS)라 도메인 `openapivts...:29443`. 실전 도메인 호출 시 EGW02004. 토큰 1분1회 제한 → throttle
- **DART**: `list.json`은 corp_code 없이 조회 시 **검색기간 3개월 제한**. 배당은 `alotMatter.json`
- **Bitget**: 읽기전용 키, IP 화이트리스트 비워두기(Vercel 유동 IP)
- **ECOS**: `sample` 키는 **10건 제한**. 실키 발급 시 해제. 응답 `foreignerHoldRatio`처럼 **"46.55%" 문자열** 주의
- **관세청**: 응답 **XML**(type=json 무시). 조회기간 **1년 이내**. 단월 조회 시 `hsCd="-"` 행이 총계 (전체 합산하면 이중계상)
- **FRED**: 최신월 미공표는 `value: "."` → 필터 후 13개 확보 위해 `limit=16`

### 시크릿
- `.env.local`은 `.gitignore` — 절대 커밋 금지

---

## 7. 최근 발생한 에러와 해결

### 이번 세션 (데이터 소스·정확도)
| 증상 | 원인 | 해결 |
|---|---|---|
| 프로덕션 OI 히스토리 0행 | **Bybit가 데이터센터 IP 전면 차단** (서울 리전으로도 회피 실패) | **OKX rubik API 폴백** 추가 (`open-interest-volume`) |
| 코인분석 Bybit/업비트 실패 | Vercel 기본 iad1(미국) 리전 | 라우트에 `preferredRegion = 'icn1'` |
| 외국인 보유율 `None` | ECOS/네이버가 **`"46.55%"` 문자열** 반환 → `Number()` = NaN | `parseFloat(replace(/[%,]/g,''))` |
| 재무등급 항상 `null` | KIS price는 PER/PBR만 제공, ROE 없음 | `lib/kisFinance.ts`의 `fetchKisFinancialRatio` 직접 호출 |
| FRED CPI가 BLS로 폴백 | 최신월 `value:"."` 필터 후 12개 → `<13` 조건 실패 | `limit=13` → `16` |
| 주택가격 MoM +4.96% (비정상) | ECOS `901Y062`에 **`총지수`(전국) + `총지수(서울)`** 혼재 → `includes()`가 둘 다 매칭 | `trim() === '총지수'` 정확 매칭 |
| 반도체 수출 588억달러 (과대) | 관세청 응답의 `hsCd="-"` **총계행 + 국가별 상세를 함께 합산** → 이중계상 | 총계행(`hsCd === '-'`)만 사용 |
| 반도체 수출 최근월 null | 관세청 데이터 확정 **~2개월 지연** | 최근 4개월 역순 탐색 + 전년동월 YoY |
| 관세청 `resultCode 99` | 조회기간 1년 초과 (202505~202605 = 13개월) | 단월 조회로 변경 |
| 손절가 22% (일봉) | 구조 지지선이 멀 때 `min(구조, ATR)`이 더 넓은 값 선택 | 가까운 하단 지지 우선 + **손절폭 3~15% 제한** |

### UI/입력
| 증상 | 원인 | 해결 |
|---|---|---|
| 목표가·증거금 입력 시 앞 숫자가 안 지워짐 | 컨트롤드 number input이 값을 강제 (빈칸→0→강제 복원) | **내부 문자열 버퍼** + blur 시에만 clamp 정규화 (`SimSlider` 전체 적용) |
| 해외주식 검색에 TSLL·CONL 안 나옴 | 하드코딩 86종목만 필터링 | Yahoo 실시간 검색 API 폴백 병합 (300ms 디바운스) |
| 일봉 차트 X축이 `09:00` | `CoinCandleChart`가 시간 포맷 고정 | `xAxis: 'time' \| 'date'` prop 추가 |
| 빌드 실패 (tsc는 통과) | 미사용 변수/import (`next build`의 eslint) | 커밋 전 `npm run build`까지 실행 |
| `useState` 리터럴 타입 추론 | `as const` 객체값으로 초기화 → `SetStateAction<10000000>` | `useState<number>(...)` 명시 |

### 기존 (KRX / 외부 API / KIS)
| 증상 | 원인 | 해결 |
|---|---|---|
| KRX 전 엔드포인트 401 | 인증키는 있으나 **API별 활용신청 미승인** | data.krx.co.kr에서 각 API 승인 |
| 시가총액 1e6 과다 | MKTCAP을 백만원으로 오인 | 원 단위 그대로 사용 |
| KRX MDC "LOGOUT" | anti-bot 차단 | 공식 오픈API로만 접근 |
| 투자자 수급 502 | 네이버 `investorTrend` 폐지 | `/trend` + `*PureBuyQuant` 필드 |
| DART 기업/재무 404 | list.json 5년 범위가 3개월 제한 초과 | 88일 범위로 축소 |
| KIS EGW00133 / EGW02004 / EGW00201 | 1분1회 / 도메인 / 초당제한 | 사전토큰+JWT exp / VTS `:29443` / throttle 700ms |
| Yahoo 502 | 차단 | 4-소스 체인 (코인은 Bitget) |
| push 403 (histobio) | 계정 혼선 | `gh auth switch cslis07` |
| env 변경 미반영 | 재배포 안 함 | `vercel --prod` |

---

## 8. API 구조

### ★ `/api/stock-analysis?ticker=` — 국내주식 분석 (`maxDuration:30`, `icn1`)
병렬 수집: 네이버 기본/일봉/투자자수급/뉴스 · KIS 재무비율 · DART 공시 · `/api/market`(코스피·환율) · 매크로 지표
```
→ 룰 엔진: 추세 + 투자자수급(±35) + 재무등급 + 공시촉매 + 정책 + CIO 업종의견 + 코스피 동조
→ 매수우위/중립/비중축소, 손절(3~15%)·목표, 백테스트(1년 일봉, 10분 캐시)
→ AI 브리핑: claude-haiku-4-5 (3분 캐시)
```
응답: `verdict` `supply` `investor[10]` `fin` `movement.drivers` `chart[60]` `zones` `fib` `backtest` `news` `disclosures` `policy` `cio` `indicators[5]` `aiBriefing`

### ★ `/api/coin-analysis?symbol=` — 코인선물 분석 (`maxDuration:30`, `icn1`)
BTC/ETH/XRP/SOL. Bitget 캔들(1H·15m·5m) · 펀딩·OI · 롱숏(계정/포지션) · 테이커 흐름 · 뉴스 RSS(Google→Bing) · 공포탐욕 · 김프 · DVOL · 도미넌스
```
→ 1H 방향 → 15m 구조 → 5m 트리거, 점수 -100~+100 → 롱/숏/관망
→ 백테스트(5m×1000봉, 10분 캐시) · 경제이벤트 12h 내 진입차단
```
- OI 히스토리: **Bybit → OKX 폴백** (Bybit 데이터센터 IP 차단)

### `/api/krx/*` — 한국거래소 공식 (AUTH_KEY 필요)
`ranking` · `market` · `etf` · `stock-info?code=` · `daily?codes=` · `stock-list`

### `/api/stock/*` — 국내주식 (Naver)
`[ticker]` · `[ticker]/chart` · `[ticker]/investor`(수급 10일 + 외국인 보유율) · `batch`

### `/api/crypto/*` · `/api/futures/*` · `/api/bitget/*` — Bitget
`crypto/batch` · `crypto/chart/[symbol]` · `futures/tickers` · `bitget/account` · `bitget/activity`(HMAC)

### `/api/kis/*` · `/api/dart/*`
`kis/token`(자가치유) · `kis/price?ticker=` / `dart`(공시목록) · `dart/company` · `financials` · `dividends` · `shareholders`

### 기타
- `/api/screener` — 4-소스 폴백 (`maxDuration:30`)
- `/api/invest/picks?risk=` — 성향별 우량주 + KIS 재무
- `/api/market` — KOSPI/KOSDAQ + USD·JPY 환율(Frankfurter) + **USDT/KRW(업비트, 김프 반영)**
- `/api/search` · `stock-search`(종목명→코드) · `overseas/search`(Yahoo 실시간)
- `/api/analyze` — Claude AI 종목 분석

### 외부 무료 데이터 소스 (키 없이 동작)
| 소스 | 용도 |
|---|---|
| BLS `publicAPI/v1` | 미국 CPI (FRED 폴백) |
| alternative.me `/fng` | 공포탐욕지수 |
| Deribit `get_volatility_index_data` | BTC DVOL |
| CoinGecko `/global` | BTC 도미넌스 |
| OKX `rubik/stat/contracts/open-interest-volume` | OI 히스토리(Bybit 폴백) |
| 업비트 `/v1/ticker` | USDT/KRW, 김치 프리미엄 |

---

## 부록: 디렉토리

```
kospi-lab/
├── app/
│   ├── api/                  # 36 routes
│   │   ├── stock-analysis/   # ★ 주식 분석 (icn1)
│   │   ├── coin-analysis/    # ★ 코인 분석 (icn1)
│   │   └── krx · stock · crypto · futures · bitget · kis · dart · ...
│   ├── stock-analysis/       # ★ 주식 분석 페이지
│   ├── coin-analysis/        # ★ 코인 분석 페이지
│   └── *.tsx                 # 23 pages
├── components/               # CoinCandleChart(공용 캔들) · NavTabs · Header · ...
├── hooks/                    # useCoinJournal · useCoinAlerts · usePortfolio · useWatchlist×3 · ...
├── lib/                      # 19 files
│   ├── stockAnalysis · stockBacktest      # ★ 주식 엔진
│   ├── coinAnalysis · coinBacktest        # ★ 코인 엔진
│   ├── marketReference · macroIndicators  # ★ CIO 의견 · 경제지표
│   └── krx · kis · kisFinance · bitget · dartClient · calendarEvents · naver · ...
├── public/guide.html
├── .env.local                # gitignore (KRX/KIS/DART/BITGET/ECOS/FRED/CUSTOMS)
└── PROJECT_STATUS.md
```
