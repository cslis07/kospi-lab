# KOSPI LAB — Project Status

> 마지막 업데이트: 2026-07-07
> 위치: `C:\Users\GB\Documents\kospi-lab`
> 배포: [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · GitHub `cslis07/kospi-lab`

---

## 1. 프로젝트 목적

**국내·해외 주식 + 코인 + 선물 통합 투자 대시보드.**

한 곳에서 실시간 시세·재무지표·뉴스·공시·계좌 잔고·시장 랭킹을 보고, 본인 성향에 맞춘 투자 설계와 절세·시뮬레이션까지 끝낼 수 있게 하는 개인용 도구. 로그인 없이 동작(보유·관심 데이터는 localStorage), Bitget만 API 키로 본인 계좌 조회.

- 스택: **Next.js 16 App Router** · React 19 · TypeScript · Tailwind · Recharts · SWR
- 데이터: Naver Finance(주력 시세), **KRX 공식 오픈API**, KIS Open API(VTS), DART, Yahoo Finance(폴백), Bitget(코인·선물)
- 배포: Vercel(자동), git push origin main → 자동 빌드 → 30~40초 후 Ready

---

## 2. 현재 구현된 기능

### 시장 (Markets)
- **국내주식** `/domestic` — KOSPI·KOSDAQ 관심 리스트, 일별 시세, 종목 상세 모달
- **해외주식** `/overseas` — 미국 등 글로벌
- **코인** `/my-stocks?market=crypto` + `/crypto/[symbol]` — Bitget 시세, 일봉, 선물 프리미엄·펀딩비
- **선물** `/futures` — Bitget USDT-Perp 649종, 검색·필터·정렬, 펀딩비

### 내 자산 (Holdings)
- **통합 자산** `/portfolio` — 국내 보유 + 비트겟 잔고 KRW 환산 합계, 자산군 비중, 손익률, 관심종목 카운트
- **내 주식** `/my-stocks` — 관심·보유·알림(localStorage)
- **비트겟 포트폴리오** `/bitget` — 실시간 잔고·총평가·체결·이체 (읽기전용 키)

### 분석 (Analysis)
- **코인선물 분석** `/coin-analysis` — 🆕 BTC·ETH·XRP·SOL 단타 분석. 1H→15m→5m 다중 타임프레임(EMA·VWAP·RSI·MACD·볼린저·ATR·시장구조), 지지저항·피보나치, 펀딩비·OI·**롱숏 계정비율**, 뉴스(Google→Bing RSS), 룰 엔진 롱/숏/관망 + 권장 레버리지·손절·익절 + 포지션 계산기 + AI 브리핑(ANTHROPIC_API_KEY 필요)
  - **캔들 차트**(5m/15m/1H 토글, 각 60봉, Recharts 커스텀 shape) — EMA20/60·지지저항·피보나치·진입/손절/익절 레벨 오버레이
  - **자동갱신**(1분 토글) · **조건 알림**(진입충족/롱숏 전환 시 브라우저 Notification, 페이지 열림+자동갱신 시 동작) · **매매일지**(localStorage, 익절/손절/본전 + 실현R 기록·승률·평균R 통계)
  - **"지금 왜 오르/내리나"** — BTC 동조·급변 캔들(청산 추정)·거래량·펀딩 변화·롱숏비율 추이·RSI 다이버전스·뉴스 감성·공포탐욕·김프 룰 기반 드라이버 + AI 브리핑 【지금 왜 움직이나】 섹션
  - **시장 심리 지표** — 공포탐욕지수(alternative.me)·김치 프리미엄(업비트 vs 글로벌×USD/KRW)·펀딩 히스토리(6회)·BTC DVOL(Deribit 옵션 내재변동성)·BTC 도미넌스(CoinGecko) 헤더 표시, 뉴스 호재/악재 키워드 태깅
  - **파생 수급 정밀** — 테이커 매수/매도 불균형+주문흐름 다이버전스(Bitget taker-buy-sell), OI 1시간 변화 4분면 해석(Bybit open-interest), 계정 vs 포지션 금액 롱숏 격차(개미 vs 큰손) — 모두 룰 엔진 점수 반영
  - **룰 엔진 성적표** — 과거 5m×1000봉 자동 백테스트(신호→1R 익절 vs 손절 판정, 10분 캐시), 승률·기대값·최근 트레이드 표시
  - **경제 이벤트 경고** — lib/calendarEvents(FOMC·CPI·NFP) 재활용, 12시간 내 이벤트 시 진입 자동 차단 + 배너
  - **매매일지 자동 채점** — 기록된 손절/1차 익절가를 이후 캔들과 대조해 자동 승패 판정('자동판정' 배지)
- **버핏 스크리너** `/screener` — 7기준 4-소스 폴백(Yahoo→Naver→KIS→DART)
- **KRX 시장** `/krx` — 🆕 주요지수 + 전종목 랭킹(5탭) + ETF 랭킹(3탭) + 상품(금·유가)
- **뉴스** `/news` · **공시** `/dart` · **리포트** `/report` · **캘린더** `/calendar`

### 설계 (Planning)
- **투자설계** `/invest` — 마법사 → 추천 계좌·자산배분 + 성향별 KIS 우량주(우량 점수)
- **세제혜택** `/tax` — ISA·IRP·연금저축 세액공제 계산
- **시뮬레이션** `/simulate` — 복리 FV 계산기 + 프리셋
- **증권사비교** `/brokerage` — 7증권사 + 7은행 수수료·CMA

### 종목 상세 `/stock/[ticker]` (국내)
- 실시간가·차트(MA5/20/60·BB·RSI·거래량 토글), **비교 차트(이름 검색)**
- **투자자별 수급 동향** (개인·외국인·기관)
- **상장 정보 (KRX)** — 🆕 상장주식수·액면가·소속부·상장일·영문명
- **DART** — 기업개요·재무요약·배당
- KIS 투자지표(모달), AI 분석(Anthropic), 포트폴리오·알림

### 공통 UX
- **Header:** 글로벌 검색(⌘K, 모바일에서도 표시), KOSPI/USD/JPY 환율, 시장 개·폐장
- **NavTabs:** 데스크탑 4그룹 드롭다운 / 모바일 햄버거 패널
- **이용가이드** `/guide.html` — 정적 단일 페이지(사이드바 TOC·모바일 드로어)
- 다크/라이트 토글, 모바일 반응형

---

## 3. 수정한 주요 파일

### 라이브러리 (`lib/`)
| 파일 | 용도 |
|---|---|
| `lib/coinAnalysis.ts` | 🆕 **코인선물 분석 엔진** — EMA·RSI·MACD·BB·ATR·VWAP·스윙·지지저항·피보나치·룰 기반 종합판정(buildVerdict) |
| `lib/krx.ts` | **KRX 공식 API 중앙 클라이언트** — 일별매매·랭킹·지수·ETF·상품·종목기본정보 |
| `lib/kis.ts` | KIS 토큰 자가치유 + throttle·kisGet |
| `lib/kisFinance.ts` | KIS 재무비율·영업이익률 (1h 캐시) |
| `lib/bitget.ts` | 스팟·선물 티커 + HMAC 서명 |
| `lib/dartClient.ts` | DART corpCode·기업·재무·배당·주주 |
| `lib/naverFinance.ts` · `naver.ts` | Naver 시세·지수 |

### 페이지 (`app/`)
| 경로 | 비고 |
|---|---|
| `app/krx/page.tsx` | 🆕 KRX 시장 종합 |
| `app/portfolio/page.tsx` | 통합 자산 |
| `app/futures/page.tsx` · `app/bitget/page.tsx` | 선물·비트겟 |
| `app/invest`·`tax`·`simulate`·`brokerage` | 설계 4종 |
| `app/stock/[ticker]/page.tsx` | 상장정보 섹션 추가 |
| `public/guide.html` | 이용가이드 |

### 컴포넌트
`components/NavTabs.tsx`(드롭다운/햄버거) · `Header.tsx` · `GlobalSearch.tsx` · `StockDetailModal.tsx`

---

## 4. 남은 작업

### 사용자 조치 필요
- [ ] **AI 종목 분석 + 코인선물 AI 브리핑** — `ANTHROPIC_API_KEY` Vercel env 미설정 시 비활성 (코인선물 분석의 룰 기반 판정은 키 없이도 동작)

### 확장 여지 (KRX 추가 API — 활용신청·승인 필요)
- [ ] **채권(bon)** — kts/bnd/smb_bydd_trd (현재 미승인 401)
- [ ] **파생(drv)** — 선물·옵션 (미승인)
- [ ] **ESG** — 사회책임투자채권 (미승인)
- → data.krx.co.kr에서 활용신청·승인하면 `lib/krx.ts`에 빠르게 추가 가능

### 기타
- [ ] 해외/코인 portfolio 수기 입력 (현재 통합자산은 국내주식+Bitget만)
- [ ] DART 배당 `payoutRatio` 서브필드 매칭 개선 (dps·수익률은 정상)
- [ ] 스크리너 FCF (KIS 현금흐름표 미제공 — Yahoo만)

### 보류 (구조적 한계)
- ❌ Bitget 카피트레이딩(trace 권한)·WebSocket(서버리스)·Place-Order(안전)
- ❌ 토스증권 API(공개 API 없음)
- ❌ KRX MDC 공개엔드포인트(anti-bot LOGOUT 차단 → 공식 API만)

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\kospi-lab
npm run dev              # localhost:3000 (또는 3001)
npx tsc --noEmit         # 타입체크
npm run build            # 프로덕션 빌드 확인
git push origin main     # = Vercel 자동 배포
vercel --prod            # 즉시 배포 (env 변경 후 필수)
vercel ls kospi-lab      # 배포 상태
vercel env ls production # env 목록
gh auth switch --user cslis07 && gh auth setup-git  # push 403 시
```

---

## 6. 배포 관련 주의사항

### GitHub 인증
- gh CLI에 두 계정: `cslis07`(소유자), `histobio0302-oss`
- push 403 시: `gh auth switch --user cslis07 && gh auth setup-git`

### Vercel 환경변수 (변경 후 **반드시 재배포**)
| 키 | 용도 | 위치 |
|---|---|---|
| `KRX_API_KEY` | 🆕 KRX 공식 API (2026-07-07 승인) | Vercel + `.env.local` |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART 공시·재무 | 양쪽 |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기전용 | 양쪽 |
| `ANTHROPIC_API_KEY` | (미설정) AI 분석 | - |

### API별 특이사항
- **KRX**: 인증키 발급만으론 부족 — **각 API "활용신청" 승인** 필요(미승인 시 401). 헤더 `AUTH_KEY`, base `data-dbg.krx.co.kr/svc/apis`. **MKTCAP은 원 단위**(×1e6 금지). 승인 15종=주식3·종목기본3·ETP3·지수4·상품2.
- **KIS**: 앱키가 모의(VTS)라 도메인 `openapivts...:29443`. 실전 도메인 호출 시 EGW02004. 토큰 1분1회 제한 → throttle. VTS도 시세는 실데이터.
- **DART**: `list.json`은 corp_code 없이 조회 시 **검색기간 3개월 제한**. 배당은 `alotMatter.json`(alotDvdnd 아님).
- **Bitget**: 읽기전용 키, IP 화이트리스트 비워두기(Vercel 유동 IP).

### 시크릿
- `.env.local`은 `.gitignore` — 절대 커밋 금지.

---

## 7. 최근 발생한 에러와 해결

### KRX
| 증상 | 원인 | 해결 |
|---|---|---|
| 전 엔드포인트 401 Unauthorized | 인증키는 있으나 **API별 활용신청 미승인** | data.krx.co.kr에서 각 API 활용신청·승인 (2026-07-07 완료) |
| 시가총액 1e6 과다(e21) | MKTCAP을 백만원으로 오인해 ×1e6 | 원 단위 그대로 사용 (삼성 1,859조 정상) |
| MDC 공개 API "LOGOUT" | anti-bot 차단(세션·OTP 무관) | 공식 오픈API로만 접근 |

### 외부 API 스펙 변경 (로컬 타입체크로 안 잡힘)
| 증상 | 원인 | 해결 |
|---|---|---|
| 투자자 수급 502 | 네이버 `investorTrend` 폐지 | `/trend` + `*PureBuyQuant` 필드로 교체 |
| DART 기업/재무 404 | list.json 5년 범위가 3개월 제한 초과 | 88일 범위로 축소 |
| DART 배당 404 | 없는 엔드포인트 `alotDvdnd` | `alotMatter.json`로 수정 |

### KIS
| 코드 | 해결 |
|---|---|
| EGW00133(1분1회) | env 사전토큰 우선 + JWT exp 검사 + 메모리캐시 |
| EGW02004(도메인) | VTS 도메인(`:29443`)으로 전환 |
| EGW00201(초당제한) | throttle 700ms + 재시도 3회 + 재무 1h 캐시 |

### Git/Vercel/UI
| 증상 | 해결 |
|---|---|
| push 403 (histobio) | gh auth switch cslis07 |
| env 변경 미반영 | vercel --prod 재배포 |
| Yahoo 502 | 4-소스 체인 / 코인은 Bitget |
| 종목비교 이름검색 안 됨 | 자동완성으로 코드 해소 |
| 모바일 15탭 스크롤 | 4그룹 드롭다운 + 햄버거 |

---

## 8. API 구조

### `/api/krx/*` — 🆕 한국거래소 공식 (AUTH_KEY 필요, 없으면 configured:false)
- `GET /api/krx/ranking` — 전종목 랭킹(상승·하락·거래대금·거래량·시총 Top30)
- `GET /api/krx/market` — 주요 지수 6종 + 상품(금·유가)
- `GET /api/krx/etf` — ETF 랭킹(거래대금·상승·하락)
- `GET /api/krx/stock-info?code=` — 종목 상장정보(상장주식수·액면가·소속부·상장일)
- `GET /api/krx/daily?codes=` — 특정 종목 일별매매
- 클라이언트: `lib/krx.ts` (전종목 1콜·최근6영업일 재시도·1~24h 캐시)

### `/api/stock/*` — 국내주식 (Naver)
- `[ticker]` 단일 · `[ticker]/chart` 일봉 · `[ticker]/investor` 수급(/trend) · `batch` 다종목

### `/api/crypto/*` · `/api/futures/*` — Bitget
- `crypto/batch`(스팟) · `crypto/chart/[symbol]`(일봉) · `futures/tickers`(선물 649)

### `/api/bitget/*` — 개인 (HMAC 서명)
- `bitget/account`(잔고) · `bitget/activity`(체결+이체)

### `/api/kis/*` — 한국투자증권 (VTS)
- `kis/token`(자가치유) · `kis/price?ticker=`(PER/PBR/EPS/52주, throttle)

### `/api/dart/*` — 전자공시
- `dart`(공시목록) · `dart/company` · `dart/financials` · `dart/dividends` · `dart/shareholders`

### `/api/coin-analysis?symbol=` — 🆕 코인선물 단타 분석 (BTC/ETH/XRP/SOL, `maxDuration:30`)
- Bitget 캔들(1H·15m·5m ×200) + 펀딩비·OI + 뉴스 RSS(Google→Bing 폴백) 병렬 수집
- 룰 엔진: 1H 방향 필터 → 15m 구조 → 5m 트리거, 점수 -100~+100 → 롱/숏/관망
- AI 브리핑: claude-haiku-4-5, 3분 캐시, 키 없으면 룰 기반만 반환(aiError)

### `/api/screener` — 4-소스 폴백 (Yahoo→Naver→KIS→DART), `maxDuration:30`
### `/api/invest/picks?risk=` — 성향별 우량주 + KIS 재무
### `/api/market` — KOSPI/KOSDAQ + USD·JPY 환율(Frankfurter)
### `/api/search`·`stock-search`·`overseas/search` — 종목 검색 (Naver+로컬)
### `/api/analyze` — Claude AI (ANTHROPIC_API_KEY 필요)

---

## 부록: 디렉토리

```
kospi-lab/
├── app/
│   ├── api/        # 33 routes (krx 6개 포함)
│   ├── *.tsx       # 21 pages
│   └── layout.tsx
├── components/     # Header, NavTabs, GlobalSearch, StockDetailModal, KospiBar, ...
├── hooks/          # usePortfolio, useWatchlist×3, useAlerts, useVirtualPortfolio
├── lib/            # krx, kis, kisFinance, bitget, dartClient, naver, naverFinance, krStocks
├── public/guide.html
├── .env.local      # gitignore (KRX/KIS/DART/BITGET 키)
├── .vercel/
└── PROJECT_STATUS.md
```
