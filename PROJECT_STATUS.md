# KOSPI LAB — Project Status

> 마지막 업데이트: 2026-07-12
> 위치: `C:\Users\GB\Documents\kospi-lab`
> GitHub: `cslis07/kospi-lab` · 기본 브랜치 `main`
> 배포: [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel (git push → 자동 배포)
> 규모: API 라우트 39 · 페이지 23 · lib 21 · hooks 10 · components 17

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — 2026-07-12 세션 종료 시점에 모든 작업이 커밋·배포·검증 완료.

- 세션 마지막에 USDT/KRW 환율 pill(`app/api/market/route.ts`의 `fetchUsdtKrw()` + `components/Header.tsx`의 USDT pill)을 커밋해 배포함. **프로덕션 `/api/market` 응답에 `usdtkrw` 포함 확인.**
  - ⚠️ 교훈: 커밋 전 이 2파일은 오래 미커밋 상태였고, localhost 빌드에서 pill이 보여 "이미 프로덕션 반영"으로 오판할 뻔했음. 프로덕션 `/api/market`엔 실제로 없었음 → **UI 확인은 반드시 프로덕션 URL로**.
- 최근 커밋 순서(모두 배포·검증): 인증 게이트 → 브리핑 모델선택 → 버튼 실행 → 실시간시세+레버리지 → 코인선물 도구 → 문서·USDT pill.

---

## 1. 프로젝트 목적

**국내·해외 주식 + 코인 + 선물 통합 투자 대시보드.** 룰 엔진 + 자동 백테스트 + 다층 신호(수급·공시·정책·매크로)로 "지금 사도 되는가"를 근거와 함께 답하는 검증 가능한 분석 도구.

**최근 방향성 (2026-07-12) — 코인 선물 실투자 지원.** 사용자가 코인 선물로 실제 투자를 진행. 분석 정확도뿐 아니라 실전 도구(리스크 패널·청산가·포지션 감시·전체 스캔)에 무게. 분석은 이제 **버튼을 눌러야만 실행**(진입 자동실행 금지 — API·토큰 비용 절약), 시세는 별도 경량 폴링으로 실시간 표시.

- 스택: Next.js 16 App Router · React 19 · TypeScript · Tailwind · Recharts · SWR
- 로그인 없음(보유·관심·매매일지는 localStorage). **단, 민감 라우트는 토큰 게이트**(§6)
- Bitget만 API 키로 본인 계좌 조회

---

## 2. 현재 구현된 기능

### 🔬 분석 (핵심)

#### 국내주식 분석 `/stock-analysis`
- 종목명 자동완성 · 프리셋 · **분석 버튼으로만 실행**(진입 시 안내 카드, 실행 후 선택 변경 시 "이전 분석" 경고)
- **실시간 시세**(10초 폴링, 분석 스냅샷과 별개) — 헤더 가격 실시간 갱신·상승/하락 플래시, 분석시점 대비 1% 이상 이동 시 "손절·목표가 낡음" 경고
- 룰 엔진(-100~+100): 일봉 추세 + **투자자 수급(±35)** + 재무등급 + DART 공시 분류 + 정책 감지 + 메릴린치 CIO 업종의견 + 코스피 동조 → 매수우위/중립/비중축소
- 경제지표 패널(실측 자동수집, 6h 캐시): FRED CPI · ECOS 가계부채·부동산 · 관세청 반도체수출
- 캔들차트 · 룰엔진 백테스트(+**신뢰도 배지**) · 수급 10일 테이블 · 공시 목록 · **AI 브리핑(모델 선택 가능)**
- 🆕 **판정 기록(매매일지)** — 판정 스냅샷 저장, 실시간가로 목표1(+1.5R)/손절(-1R) 자동판정, 승률·평균R 통계

#### 코인선물 분석 `/coin-analysis` (BTC·ETH·XRP·SOL)
- **분석 버튼으로만 실행** · **실시간 시세**(5초 폴링, Bitget 티커)
- 다중 TF 룰 엔진(1H→15m→5m) · 파생 수급(테이커·OI 4분면·롱숏 격차) · 시장 심리(공포탐욕·김프·펀딩·DVOL·도미넌스)
- 🆕 **레버리지 3요소 동적 계산** — 손절폭(청산여유 3배) × 15m ATR 변동성 상한 × 신호 강도. 적극 최대 20배·보수 최대 10배·청산한계 별도 표기 (기존 3/5 고정 → 개선)
- 🆕 **⚡ 전체 스캔** — 4코인 룰엔진 신호 일괄 비교(경량, 3분 캐시), 클릭으로 선택
- 🆕 **리스크 패널**(구 포지션 계산기 교체) — 레버리지 슬라이더 · 격리 청산가 근사(MMR 0.5%) · 청산여유÷손절거리 안전배수(2배 미만 경고) · 손절 손실/목표 수익액(R) · 방향별 펀딩 지불/수취
- 🆕 **포지션 감시** — 열린 매매일지 항목의 손절·목표 도달을 실시간가로 감시해 브라우저 알림(항목·레벨당 1회)
- 매매일지 + 자동 채점 · 조건 알림 · 룰엔진 백테스트(+신뢰도 배지) · 경제이벤트 12h 차단

#### 기타 분석
- 버핏 스크리너 `/screener` · KRX 시장 `/krx` · 뉴스 `/news` · 공시 `/dart` · 리포트 `/report` · 캘린더 `/calendar`

### 시장 · 내 자산 · 설계
- `/domestic` · `/overseas` · `/my-stocks` · `/futures`
- **통합 자산 `/portfolio`** — 🆕 **신호 보기** 버튼: 보유 종목 매수우위/중립/비중축소 배지 + 손절 참고선 부근 경고 · 비트겟 포트폴리오 `/bitget`
- 투자설계 `/invest` · 세제혜택 `/tax` · 증권사비교 `/brokerage` · 시뮬레이션 `/simulate`(원화 복리 / USDT 레버리지 손익)

### 공통
- 글로벌 검색(⌘K) · 환율 pill(USD/USDT/JPY) · 다크/라이트 · 모바일 반응형 · 이용가이드 `/guide.html`
- 🆕 **AI 브리핑 모델 선택**(Haiku 4.5 / Sonnet 5 기본 / Opus 4.8) — localStorage 저장, `components/BriefingModelPicker.tsx`

---

## 3. 수정한 주요 파일

### 이번 세션 신규 (2026-07-10~12)
| 파일 | 역할 |
|---|---|
| `middleware.ts` | 🆕 민감 라우트 게이트 — `/api/bitget/*`·`/api/analyze`를 `APP_ACCESS_TOKEN`으로 보호(쿠키/헤더, fail-closed) |
| `lib/rateLimit.ts` | 🆕 IP 슬라이딩 윈도우 rate limit (인메모리) |
| `app/api/unlock/route.ts` | 🆕 토큰→HttpOnly 쿠키 발급 (IP당 5분 5회 제한) |
| `lib/anthropic.ts` | 🆕 AI 브리핑 공용 헬퍼 — 모델 화이트리스트(`BRIEFING_MODELS`)·에러 본문 로깅·친절 메시지 |
| `hooks/useBriefingModel.ts` | 🆕 브리핑 모델 선택(localStorage) |
| `components/BriefingModelPicker.tsx` | 🆕 모델 세그먼트 버튼 |
| `components/LivePriceTag.tsx` | 🆕 실시간 시세 표시(플래시·낡음 경고, 색상 주입) |
| `app/api/coin-scan/route.ts` | 🆕 4코인 룰엔진 신호 일괄 스캔(3분 캐시, icn1) |
| `app/api/portfolio-verdicts/route.ts` | 🆕 보유 종목 경량 판정(일봉+수급, 10분 캐시, icn1) |
| `hooks/useStockJournal.ts` | 🆕 주식 판정 기록 + 자동판정 |

### 이번 세션 변경
| 파일 | 변경 |
|---|---|
| `lib/stockAnalysis.ts` | `strongSupply` 수급 결측 시 매수판정 통과 버그 수정(결측→진입 불가) |
| `lib/coinAnalysis.ts` | 레버리지 3요소 동적 계산, `Verdict.leverage.max` 추가, 진입판정을 레버리지보다 먼저 계산 |
| `app/coin-analysis/page.tsx` | 버튼 실행·실시간시세·전체스캔·리스크패널·포지션감시·백테스트배지 |
| `app/stock-analysis/page.tsx` | 버튼 실행·실시간시세·판정기록·백테스트배지·모델선택 |
| `app/portfolio/page.tsx` | 신호 보기(판정 배지) |
| `app/api/stock-analysis/route.ts`·`coin-analysis/route.ts` | 공용 헬퍼로 브리핑 호출 일원화, `?model=` 수용, 캐시 키에 모델 포함 |
| `hooks/useCoinAlerts.ts` | `fire` export (포지션 감시용) |
| `app/domestic/page.tsx`·`components/StockCard.tsx` | 5초→15초 폴링 + dedupingInterval |

### 분석 엔진 (`lib/`) — 기존
`stockAnalysis`·`stockBacktest`·`marketReference`·`macroIndicators`·`coinAnalysis`·`coinBacktest`
### 기존 라이브러리
`krx`·`kis`·`kisFinance`·`bitget`·`dartClient`·`calendarEvents`·`naverFinance`·`naver`·`stockList`·`krStocks`·`indicators`·`types`

---

## 4. 남은 작업

### 우선순위 높음
- [ ] **미커밋 USDT pill 2건 커밋** — 별도 기능이라 이번 세션에 안 섞음(§0). 사용자 확인 후 커밋만 하면 됨
- [ ] **매매일지에 레버리지·실현손익(USDT) 기록** — "엔진 판정 vs 내 실제 성적" 비교. 사용자에게 다음 후보로 제안했으나 미착수

### 개선 여지
- [ ] **DART 공시 목록 정렬** — 정기 신고가 다수 노출. 아직 원본 순서 그대로(`slice(0,12)`) — 우선순위 로직 미구현
- [ ] **주식/코인 백테스트에 수급 미반영** — 과거 시점 수급·파생 데이터가 없어 기술적 신호만 검증. 배지·고지로 명시만 함(엔진 개선은 데이터 부재로 보류)
- [ ] **가계부채 데이터 지연** — ECOS 가계신용은 분기 데이터
- [ ] 해외/코인 portfolio 수기 입력 — 통합자산은 국내주식+Bitget만
- [ ] DART 배당 `payoutRatio` 서브필드 매칭 · 스크리너 FCF(KIS 미제공)

### 확장 여지 (KRX 추가 API — 활용신청·승인 필요)
- [ ] **채권(bon)** / **파생(drv)** / **ESG** — 현재 미승인 401. data.krx.co.kr에서 활용신청 후 `lib/krx.ts`에 추가

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\kospi-lab

npm run dev                  # 개발서버 (localhost:3000, 점유 시 --port 3021 등)
npm run dev -- --port 3025   # 포트 지정 (.env.local 변경 시 반드시 재시작)

# ── 커밋 전 검증 (반드시 순서대로) ──
npx tsc --noEmit             # 1) 타입체크
npm run build                # 2) 프로덕션 빌드 (lint 포함 — 미사용 변수도 실패 처리)
# 로컬 프로덕션 확인이 필요하면: npx next start --port 3033 (env는 프로세스에 주입)

git push origin main         # = Vercel 자동 배포
vercel env ls production     # env 목록 확인
echo "값" | vercel env add KEY_NAME production   # env 추가 (⚠ env pull 절대 금지 — §9)

gh auth switch --user cslis07 && gh auth setup-git   # push 403 시
```

### 배포 확인 (프로덕션 전파 폴링)
```bash
# 새 라우트/필드가 배포됐는지 폴링. React가 텍스트를 span으로 쪼개므로
# UI 문자열 전체를 grep하면 안 잡힘 → 응답 JSON 필드나 라우트 status로 확인할 것
until [ "$(curl -s -o /dev/null -w '%{http_code}' https://kospi-lab.vercel.app/api/coin-scan)" = "200" ]; do sleep 15; done
```

---

## 6. 배포 관련 주의사항

### GitHub 인증
- gh CLI에 두 계정: `cslis07`(소유자), `histobio0302-oss`
- push 403 시: `gh auth switch --user cslis07 && gh auth setup-git`

### ⚠️ `vercel env pull` 절대 금지
`env pull`은 로컬 `.env.local`을 Vercel 값으로 덮어써서 **로컬 전용 키가 삭제**된다. env 추가는 반드시 `vercel env add`만 사용. (§9 참고)

### Vercel 환경변수 (변경 후 **반드시 재배포**)
| 키 | 용도 | 상태 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 🆕 민감 라우트 게이트(bitget·analyze). **미설정 시 프로덕션은 503 fail-closed** | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX 공식 API | Vercel + `.env.local` |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART 공시·재무 | Vercel |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기전용 | 양쪽 |
| `ANTHROPIC_API_KEY` | AI 브리핑 (주식·코인) | Vercel |
| `ECOS_API_KEY` | 한국은행 (가계부채·부동산) | 양쪽 |
| `FRED_API_KEY` | 미국 CPI | 양쪽 |
| `CUSTOMS_API_KEY` | 관세청 (반도체 수출) | 양쪽 |

### 🔒 인증 게이트 사용법 (신규)
- 브라우저에서 `/bitget`·`/portfolio`가 "🔒 잠긴 페이지"로 보이면 정상.
  `https://kospi-lab.vercel.app/api/unlock?token=<APP_ACCESS_TOKEN>` 한 번 방문 → HttpOnly 쿠키 발급(1년) → 해제.
- curl 테스트: `-H "x-app-token: <토큰>"`. 토큰 값은 `.env.local`의 `APP_ACCESS_TOKEN`.

### 리전 고정 (`preferredRegion = 'icn1'`)
`/api/coin-analysis`·`/api/stock-analysis`·`/api/coin-scan`·`/api/portfolio-verdicts`는 **서울 리전 고정**.
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
- **Anthropic**: 크레딧 소진은 200이 아니라 **400 `invalid_request_error`**로 온다("credit balance is too low"). 키·모델 문제 아님. 로그는 `vercel logs ... --json` 후 message에 "Anthropic" 필터(일반 `vercel logs`는 줄이 잘려 본문 안 보임)

### 시크릿
- `.env.local`은 `.gitignore` — 절대 커밋 금지

---

## 7. 최근 발생한 에러와 해결

### 이번 세션 (2026-07-10~12)
| 증상 | 원인 | 해결 |
|---|---|---|
| AI 브리핑 항상 null(`aiError: Anthropic 400`) | **Anthropic 크레딧 부족** (키·모델·헤더 정상, 결제에서 거부) | 크레딧 충전 시 자동 복구. 에러 본문 로깅 + 친절 메시지로 전환. OAuth 토큰 가설은 오답이었음 |
| 수급 데이터 없는 종목이 매수판정 통과 | `strongSupply = !supply \|\| score>=0` — 결측을 '중립'으로 취급 | `!!supply && score>=0`으로 변경(결측→진입 불가). 두 로직 나란히 실행해 재현 검증 |
| 레버리지가 항상 3/5배 | `Math.min(3, …)`·`Math.min(5, …)` 하드캡 | 손절폭×변동성×신호강도 3요소 곱(적극 최대 20배) |
| 인증 게이트 배포 후 계좌 페이지 503/401 | Vercel에 `APP_ACCESS_TOKEN` 미설정 | `vercel env add`로 등록 후 재배포. 미설정 시 프로덕션은 fail-closed(의도된 동작) |
| 배포 전파 폴링이 "아직 이전 빌드"만 반복 | React가 `<span>분석</span>`으로 텍스트를 쪼개 UI 문자열 전체 grep 실패 | 응답 JSON 필드/라우트 status로 폴링(§5) |

### 이전 세션 (데이터 소스·정확도)
| 증상 | 원인 | 해결 |
|---|---|---|
| 프로덕션 OI 히스토리 0행 | **Bybit가 데이터센터 IP 전면 차단** | **OKX rubik API 폴백** (`open-interest-volume`) |
| 코인분석 Bybit/업비트 실패 | Vercel 기본 iad1(미국) 리전 | 라우트에 `preferredRegion = 'icn1'` |
| 외국인 보유율 `None` | ECOS/네이버가 **`"46.55%"` 문자열** 반환 → `Number()` = NaN | `parseFloat(replace(/[%,]/g,''))` |
| 재무등급 항상 `null` | KIS price는 PER/PBR만, ROE 없음 | `lib/kisFinance.ts`의 `fetchKisFinancialRatio` 직접 호출 |
| 주택가격 MoM +4.96% (비정상) | ECOS `901Y062`에 `총지수`(전국)+`총지수(서울)` 혼재 → `includes()`가 둘 다 매칭 | `trim() === '총지수'` 정확 매칭 |
| 반도체 수출 588억달러 (과대) | 관세청 `hsCd="-"` 총계행 + 국가별 상세 이중합산 | 총계행(`hsCd === '-'`)만 사용 |
| 손절가 22%/22% (일봉·코인) | 구조 지지선이 멀 때 넓은 값 선택 | 가까운 하단 지지 우선 + 손절폭 제한 |

### 기존 (KRX / 외부 API / KIS)
| 증상 | 원인 | 해결 |
|---|---|---|
| KRX 전 엔드포인트 401 | 인증키는 있으나 **API별 활용신청 미승인** | data.krx.co.kr에서 각 API 승인 |
| 시가총액 1e6 과다 | MKTCAP을 백만원으로 오인 | 원 단위 그대로 사용 |
| KRX MDC "LOGOUT" | anti-bot 차단 | 공식 오픈API로만 접근 |
| 투자자 수급 502 | 네이버 `investorTrend` 폐지 | `/trend` + `*PureBuyQuant` 필드 |
| KIS EGW00133 / EGW02004 / EGW00201 | 1분1회 / 도메인 / 초당제한 | 사전토큰+JWT exp / VTS `:29443` / throttle 700ms |
| 빌드 실패 (tsc는 통과) | 미사용 변수/import (`next build`의 eslint) | 커밋 전 `npm run build`까지 실행 |
| push 403 (histobio) | 계정 혼선 | `gh auth switch cslis07` |

---

## 8. API 구조

### ★ `/api/stock-analysis?ticker=&model=` — 국내주식 분석 (`maxDuration:30`, `icn1`)
병렬 수집: 네이버 기본/일봉/투자자수급/뉴스 · KIS 재무비율 · DART 공시 · `/api/market` · 매크로 지표
→ 룰 엔진(추세+수급±35+재무+공시+정책+CIO+코스피) → 매수우위/중립/비중축소, 손절·목표, 백테스트(1년 일봉, 10분 캐시), AI 브리핑(모델선택, 3분 캐시·캐시키에 모델 포함)
응답: `verdict` `supply` `investor[10]` `fin` `movement` `chart` `zones` `fib` `backtest` `news` `disclosures` `policy` `cio` `indicators[5]` `aiBriefing` `aiModel`

### ★ `/api/coin-analysis?symbol=&model=` — 코인선물 분석 (`maxDuration:30`, `icn1`)
BTC/ETH/XRP/SOL. Bitget 캔들(1H·15m·5m) · 펀딩·OI · 롱숏 · 테이커 흐름 · 뉴스 · 공포탐욕 · 김프 · DVOL · 도미넌스
→ 1H 방향→15m 구조→5m 트리거, 점수→롱/숏/관망, 레버리지 3요소, 백테스트(5m×1000봉, 10분 캐시), 경제이벤트 12h 차단
- OI 히스토리: **Bybit → OKX 폴백**. `verdict.leverage`에 `conservative/aggressive/max` 포함

### 🆕 `/api/coin-scan` — 4코인 신호 일괄 스캔 (`maxDuration:30`, `icn1`, 3분 캐시)
룰엔진 판정만(뉴스·AI·백테스트·파생수급 제외). 응답 `items[]`(symbol·score·direction·entryOk·state·levAggressive)

### 🆕 `/api/portfolio-verdicts?tickers=` — 보유 종목 경량 판정 (`maxDuration:30`, `icn1`, 티커당 10분 캐시)
일봉+수급만으로 stance/score/stop. 티커 `/^\d{6}$/` 화이트리스트

### 🆕 `/api/unlock?token=` — 인증 쿠키 발급 (IP당 5분 5회)
### `/api/analyze` — Claude AI 종목 분석 (인증 게이트 + rate limit)

### 기존 라우트
- `/api/krx/*`(AUTH_KEY): ranking·market·etf·stock-info·daily·stock-list
- `/api/stock/*`(Naver): `[ticker]`·chart·investor·batch
- `/api/crypto/*`·`/api/futures/*`·`/api/bitget/*`(HMAC): crypto/batch·chart·futures/tickers·bitget/account·activity
- `/api/kis/*`·`/api/dart/*` · `/api/screener` · `/api/invest/picks` · `/api/market`(USD·JPY·USDT/KRW) · `/api/search`·`stock-search`·`overseas/search` · `/api/news/*` · `/api/debug/naver`

### 외부 무료 데이터 소스 (키 없이 동작)
| 소스 | 용도 |
|---|---|
| BLS `publicAPI/v1` | 미국 CPI (FRED 폴백) |
| alternative.me `/fng` | 공포탐욕지수 |
| Deribit `get_volatility_index_data` | BTC DVOL |
| CoinGecko `/global` | BTC 도미넌스 |
| OKX `rubik/.../open-interest-volume` | OI 히스토리(Bybit 폴백) |
| 업비트 `/v1/ticker` | USDT/KRW·김프, 코인 실시간 시세 |
| Bitget 공개 티커/캔들 | 코인 시세·분석·스캔 |

---

## 9. ⛔ 하지 말 것

- **`vercel env pull` 절대 금지** — 로컬 `.env.local`의 로컬 전용 키가 삭제됨. env 추가는 `vercel env add`만.
- **`APP_ACCESS_TOKEN`을 Vercel에서 지우지 말 것** — 지우면 프로덕션의 `/bitget`·`/analyze`가 503(fail-closed). 미들웨어가 의도적으로 잠금.
- **`.env.local` 커밋 금지** (gitignore에 있음). 토큰·키를 로그나 응답에 출력 금지.
- **`app/api/debug/naver`** — 디버그용이나 삭제 금지 표시는 없음. 다만 프로덕션에 열려 있으므로 민감정보 노출 주의(제거 검토는 남은 작업).
- 배포 전파 폴링에서 **UI 한글 문자열 전체를 grep하지 말 것** — React가 span으로 쪼개 안 잡힘. JSON 필드/라우트 status로.
- **UI 확인은 프로덕션 URL로** — localhost 빌드는 미커밋 코드까지 포함하므로 "이미 배포됨"으로 오판하기 쉬움(§0 교훈).

---

## 10. ❌ 보류 / 구조적 한계 (재시도 방지)

- ❌ **코인 청산 히트맵** — CoinGlass 유료. Binance/Bybit 청산 스트림은 무료지만 **웹소켓 상시 수신 필요 → Vercel 서버리스 불가**. 현재는 급변 캔들 감지가 무료 대안
- ❌ **온체인 고래·거래소 유입출** — CryptoQuant·Glassnode 유료
- ❌ Bitget 카피트레이딩(trace 권한)·WebSocket(서버리스)·Place-Order(안전)
- ❌ 토스증권 API(공개 API 없음) · KRX MDC 공개엔드포인트(anti-bot LOGOUT 차단)
- ❌ **백테스트에 수급·파생 신호 반영** — 과거 시점 데이터가 없음(네이버 수급은 당일치만, 파생은 스냅샷). 기술적 신호만 검증하고 배지·고지로 한계 명시
- ❌ **청산가 정확 계산** — 거래소 티어·수수료별로 달라 MMR 0.5% 가정 근사만. UI에 "주문 전 거래소 확인" 고지

---

## 11. 디렉토리 구조

```
kospi-lab/
├── middleware.ts             # 🆕 민감 라우트 인증 게이트
├── app/
│   ├── api/                  # 39 routes
│   │   ├── stock-analysis/   # ★ 주식 분석 (icn1)
│   │   ├── coin-analysis/    # ★ 코인 분석 (icn1)
│   │   ├── coin-scan/        # 🆕 4코인 일괄 스캔
│   │   ├── portfolio-verdicts/ # 🆕 보유 종목 판정
│   │   ├── unlock/           # 🆕 인증 쿠키 발급
│   │   └── krx · stock · crypto · futures · bitget · kis · dart · market · ...
│   ├── stock-analysis/ · coin-analysis/   # ★ 분석 페이지
│   └── *.tsx                 # 23 pages
├── components/               # 17 — BriefingModelPicker🆕 · LivePriceTag🆕 · CoinCandleChart · Header · NavTabs · ...
├── hooks/                    # 10 — useBriefingModel🆕 · useStockJournal🆕 · useCoinJournal · useCoinAlerts · usePortfolio · ...
├── lib/                      # 21 — anthropic🆕 · rateLimit🆕 · stockAnalysis · coinAnalysis · (stock/coin)Backtest · marketReference · macroIndicators · krx · kis · kisFinance · bitget · ...
├── public/guide.html
├── .env.local                # gitignore (APP_ACCESS_TOKEN·KRX·KIS·DART·BITGET·ANTHROPIC·ECOS·FRED·CUSTOMS)
└── PROJECT_STATUS.md
```
