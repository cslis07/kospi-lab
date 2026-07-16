# KOSPI LAB — Project Status

> 마지막 업데이트: 2026-07-15
> 위치: `C:\Users\GB\Documents\kospi-lab`
> GitHub: `cslis07/kospi-lab` · 기본 브랜치 `main`
> 배포: [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel (git push → 자동 배포)
> 규모: API 라우트 39 · 페이지 23 · lib 21 · hooks 10 · components 18

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — `git status` 비어 있음. 모든 작업 커밋·배포·검증 완료.

- 최근 작업은 **코인 진입 분석 강화**(진입 플랜·신호 안정성·분할 매수·방향 문턱 ±20). 마지막 커밋 `adcc509`.
- **다음 채팅이 가장 먼저 볼 것:** 사용자가 코인 선물로 **실투자 중**. "계속 관망만 나온다"는 피드백으로 방향 문턱을 ±30→±20으로 낮춤(`adcc509`). 며칠 써보고 **신호가 너무 자주/드물게 뜨는지 재조정** 필요할 수 있음 — 문턱(±20)이나 1H 가중치가 후보. 이건 데이터 보며 튜닝할 항목이라 미완이 아니라 관찰 대기.
- ⚠️ 교훈(지난 세션): USDT pill이 커밋 전 localhost 빌드에서만 보여 "이미 프로덕션 반영"으로 오판할 뻔함. **UI 확인은 반드시 프로덕션 URL로**(§9).

---

## 1. 프로젝트 목적

**국내·해외 주식 + 코인 + 선물 통합 투자 대시보드.** 룰 엔진 + 자동 백테스트 + 다층 신호(수급·공시·정책·매크로)로 "지금 사도 되는가"를 근거와 함께 답하는 검증 가능한 분석 도구.

**최근 방향성 (~2026-07-15) — 코인 선물 실투자 지원, "매수 직전 판단" 정밀화.** 사용자가 코인 선물로 실제 투자. 알림·일지·손실한도 같은 포지션 관리는 사용자가 원치 않아 제외하고, **매수 전 분석**에 집중: 상위 타임프레임 레짐·진입 자리 품질·오더북·진입 플랜(얼마에/어디서 손절)·신호 안정성·분할 매수. 분석은 **버튼을 눌러야만 실행**, 시세는 별도 경량 폴링으로 실시간.

- ⚠️ **정직성 원칙(코드에 안 적힌 맥락):** 이 엔진은 이벤트(CPI·FOMC) 결과를 예측 못 함 — 그건 뉴스 도박. 문턱을 낮춰 방향을 더 자주 내되, 약한 신호는 "안정성 약함"으로 정직하게 라벨. "지금 진입" 초록불(entryOk)은 문턱 45로 엄격 유지해 남발 방지.
- 스택: Next.js 16 App Router · React 19 · TypeScript · Tailwind · Recharts · SWR
- 로그인 없음(보유·관심·매매일지는 localStorage). **단, 민감 라우트는 토큰 게이트**(§6)
- Bitget만 API 키로 본인 계좌 조회

---

## 2. 현재 구현된 기능

### 🔬 분석 (핵심)

#### 국내주식 분석 `/stock-analysis`
- 종목명 자동완성 · 프리셋 · **분석 버튼으로만 실행**(진입 시 안내 카드, 실행 후 선택 변경 시 "이전 분석" 경고)
- **실시간 시세**(10초 폴링, 분석 스냅샷과 별개) — 헤더 가격 실시간 갱신·플래시, 분석시점 대비 1% 이상 이동 시 "손절·목표가 낡음" 경고
- 룰 엔진(-100~+100): 일봉 추세 + **투자자 수급(±35)** + 재무등급 + DART 공시 분류 + 정책 감지 + 메릴린치 CIO 업종의견 + 코스피 동조 → 매수우위/중립/비중축소
- 경제지표 패널(실측 자동수집, 6h 캐시): FRED CPI · ECOS 가계부채·부동산 · 관세청 반도체수출
- 캔들차트 · 룰엔진 백테스트(+**신뢰도 배지**) · 수급 10일 · 공시 · **AI 브리핑(모델 선택)** · **판정 기록(매매일지, 자동판정)**

#### 코인선물 분석 `/coin-analysis` (BTC·ETH·XRP·SOL)
- **분석 버튼으로만 실행** · **실시간 시세**(5초 폴링, Bitget 티커)
- 다중 TF 룰 엔진(1H→15m→5m) · 파생 수급(테이커·OI 4분면·롱숏 격차) · 시장 심리(공포탐욕·김프·펀딩·DVOL·도미넌스)
- 🆕 **상위 타임프레임 레짐 필터(4H·1D)** — 큰 흐름 역행 진입 시 감점+차단(counterTrend), 정렬 시 가점. 판정 배지
- 🆕 **진입 자리 품질 게이트** — 진입가~목표 사이 반대 S/R(방해물) 거리를 R로 환산, 1R 미만이면 진입 차단(저항 바로 밑 매수 방지)
- 🆕 **오더북 유동성 패널** — Bitget merge-depth REST 스냅샷, 매수/매도 불균형·최대 매수벽(지지)/매도벽(저항)과 거리, 0.3% 이내 벽 경고
- 🆕 **진입 플랜 요약** — ①진입가(지금 시장가 vs 눌림 대기 구분) ②손절(-%) ③익절 1·2차 한눈에
- 🆕 **신호 안정성** — 방향이 상위 시간대 기반이면 견고🟢, 5m 단기 의존이면 약함🔴 (바+%+이유)
- 🆕 **방향 문턱 ±20** (기존 ±30) — 약한 우위도 롱/숏 표시(상승/하락 우위(약)). 관망이어도 기울기 바로 표시
- 🆕 **레버리지 3요소 동적 계산**(손절폭×변동성×신호강도, 적극 최대 20배·청산한계 표기)
- 🆕 **리스크 패널** — 레버리지 슬라이더·격리 청산가 근사(MMR 0.5%)·청산여유÷손절거리 안전배수·손익액(R)·방향별 펀딩 + **🆕 분할 매수 3분할**(가격·노션·증거금 USDT, 블렌디드 평단)
- 🆕 **⚡ 전체 스캔** — 4코인 신호 일괄 비교(3분 캐시), 클릭 선택
- 🆕 **포지션 감시** — 열린 매매일지 항목의 손절·목표 도달을 실시간가로 감시해 알림
- 매매일지 + 자동 채점 · 조건 알림 · 백테스트(+신뢰도 배지) · 경제이벤트 12h 차단

#### 기타 분석
- 버핏 스크리너 `/screener` · KRX 시장 `/krx` · 뉴스 `/news` · 공시 `/dart` · 리포트 `/report` · 캘린더 `/calendar`

### 시장 · 내 자산 · 설계
- `/domestic` · `/overseas` · `/my-stocks` · `/futures`
- **통합 자산 `/portfolio`** — **신호 보기**(보유 종목 매수우위/중립/비중축소 배지+손절 부근 경고) · 비트겟 `/bitget`(🆕 잠금 해제 폼)
- 투자설계 `/invest` · 세제혜택 `/tax` · 증권사비교 `/brokerage` · 시뮬레이션 `/simulate`

### 공통
- **홈 분석 섹션에 국내주식·코인선물 분석 카드**(🆕) · 글로벌 검색(⌘K) · 환율 pill(USD/USDT/JPY) · 다크/라이트 · 모바일 · `/guide.html`
- **AI 브리핑 모델 선택**(Haiku 4.5 / Sonnet 5 기본 / Opus 4.8) — localStorage 저장

---

## 3. 수정한 주요 파일

### 최근 세션 신규 (~2026-07-15)
| 파일 | 역할 |
|---|---|
| `middleware.ts` | 민감 라우트 게이트 — `/api/bitget/*`·`/api/analyze`를 `APP_ACCESS_TOKEN`으로 보호(fail-closed). `AUTH_COOKIE` 상수 export |
| `lib/rateLimit.ts` | IP 슬라이딩 윈도우 rate limit (인메모리) |
| `app/api/unlock/route.ts` | 토큰→HttpOnly 쿠키 발급. GET(URL,`next`) + POST(폼용 JSON), IP당 5분 5회 |
| `components/UnlockGate.tsx` | 🆕 잠긴 화면 토큰 입력 폼(POST→쿠키→reload) |
| `lib/anthropic.ts` | AI 브리핑 공용 헬퍼 — 모델 화이트리스트·에러 본문 로깅·크레딧 부족 안내 |
| `hooks/useBriefingModel.ts` · `components/BriefingModelPicker.tsx` | 브리핑 모델 선택(localStorage)·세그먼트 버튼 |
| `components/LivePriceTag.tsx` | 실시간 시세 표시(플래시·낡음 경고) |
| `app/api/coin-scan/route.ts` | 4코인 룰엔진 신호 일괄 스캔(3분 캐시, icn1) |
| `app/api/portfolio-verdicts/route.ts` | 보유 종목 경량 판정(일봉+수급, 10분 캐시, icn1) |
| `hooks/useStockJournal.ts` | 주식 판정 기록 + 자동판정 |

### 최근 세션 변경 (핵심 = `lib/coinAnalysis.ts` + `app/coin-analysis/page.tsx`)
| 파일 | 변경 |
|---|---|
| `lib/coinAnalysis.ts` | 레버리지 3요소, **레짐 필터(htf)·진입자리 게이트(roomOk)·진입 플랜·신호 안정성(confidence)·방향 문턱 ±20**. `Verdict`에 `regime`·`entryQuality`·`entryPlan`·`confidence` 추가. `VerdictExtras.htf` (백테스트·스캔은 미제공→null 안전) |
| `app/api/coin-analysis/route.ts` | 4H·1D 캔들 + `fetchOrderbook` 병렬 수집, 응답에 `orderbook`. 브리핑 공용화·`?model=` |
| `app/coin-analysis/page.tsx` | 오더북 패널·진입 플랜 박스·안정성 바·분할 매수·관망 기울기 바·전체 스캔·리스크 패널·포지션 감시 |
| `lib/stockAnalysis.ts` | `strongSupply` 수급 결측 시 매수판정 통과 버그 수정(결측→진입 불가) |
| `app/stock-analysis/page.tsx` | 버튼 실행·실시간시세·판정기록·백테스트배지·모델선택 |
| `app/portfolio/page.tsx` | 신호 보기(판정 배지)·잠김 안내 |
| `app/page.tsx` | 홈 분석 섹션에 주식·코인 분석 카드 |
| `app/api/market/route.ts`·`components/Header.tsx` | USDT/KRW 환율 pill(업비트) |
| `app/domestic/page.tsx`·`components/StockCard.tsx` | 5초→15초 폴링 |

### 분석 엔진·기존 라이브러리 (`lib/`)
`stockAnalysis`·`stockBacktest`·`coinAnalysis`·`coinBacktest`·`marketReference`·`macroIndicators`·`krx`·`kis`·`kisFinance`·`bitget`·`dartClient`·`calendarEvents`·`naverFinance`·`naver`·`stockList`·`krStocks`·`indicators`·`types`·`anthropic`·`rateLimit`

---

## 4. 남은 작업

### 우선순위 높음
- [ ] **방향 문턱 ±20 실사용 재조정** — 실투자 피드백 반영. 너무 자주/드물면 문턱·1H 가중치 튜닝. 데이터 관찰 대기라 미착수(§0)
- [ ] **매매일지에 레버리지·실현손익(USDT) 기록** — "엔진 판정 vs 내 실제 성적" 비교. 제안했으나 미착수

### 개선 여지
- [ ] **DART 공시 목록 정렬** — 정기 신고 다수 노출, 원본 순서 그대로(`slice(0,12)`), 우선순위 로직 미구현
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
npm test                     # 1) 머니매스 회귀 테스트 (tests/engine.test.ts — 레버리지·청산가·사이징·게이트)
npx tsc --noEmit             # 2) 타입체크 (tests/ 포함)
npm run build                # 3) 프로덕션 빌드 (lint 포함 — 미사용 변수도 실패 처리)
# 로컬 프로덕션 확인: APP_ACCESS_TOKEN=<값> npx next start --port 3033 (env는 프로세스에 주입)

git push origin main         # = Vercel 자동 배포
vercel env ls production     # env 목록 확인
echo "값" | vercel env add KEY_NAME production   # env 추가 (⚠ env pull 절대 금지 — §9)

gh auth switch --user cslis07 && gh auth setup-git   # push 403 시
```

### 배포 확인 (프로덕션 전파 폴링)
```bash
# ⚠ UI 한글 문자열 전체 grep 금지 — React가 <span>으로 쪼개 안 잡힘.
# 응답 JSON의 새 필드나 라우트 status로 폴링할 것.
until curl -s "https://kospi-lab.vercel.app/api/coin-analysis?symbol=BTCUSDT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).verdict?.confidence?1:0))'; do sleep 15; done
```

---

## 6. 배포 관련 주의사항

### GitHub 인증
- gh CLI에 두 계정: `cslis07`(소유자), `histobio0302-oss`
- push 403 시: `gh auth switch --user cslis07 && gh auth setup-git`

### ⚠️ `vercel env pull` 절대 금지
`env pull`은 로컬 `.env.local`을 Vercel 값으로 덮어써서 **로컬 전용 키가 삭제**된다. env 추가는 반드시 `vercel env add`만 사용. (§9)

### Vercel 환경변수 (변경 후 **반드시 재배포**)
| 키 | 용도 | 상태 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 민감 라우트 게이트(bitget·analyze). **미설정 시 프로덕션은 503 fail-closed** | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX 공식 API | Vercel + `.env.local` |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART 공시·재무 | Vercel |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기전용 | 양쪽 |
| `ANTHROPIC_API_KEY` | AI 브리핑 (주식·코인) | Vercel |
| `ECOS_API_KEY` | 한국은행 (가계부채·부동산) | 양쪽 |
| `FRED_API_KEY` | 미국 CPI | 양쪽 |
| `CUSTOMS_API_KEY` | 관세청 (반도체 수출) | 양쪽 |

### 🔒 인증 게이트 사용법
- 브라우저에서 `/bitget`이 "🔒 잠긴 페이지"로 보이면 정상. **화면의 토큰 입력 폼에 `APP_ACCESS_TOKEN` 값 붙여넣고 "인증"** → HttpOnly 쿠키(1년) → 해제. (`/portfolio`는 잠김 시 `/bitget`으로 안내)
- URL 방식도 가능: `.../api/unlock?token=<토큰>`. curl 테스트: `-H "x-app-token: <토큰>"`. 토큰 값은 `.env.local`의 `APP_ACCESS_TOKEN`.

### 리전 고정 (`preferredRegion = 'icn1'`)
`/api/coin-analysis`·`/api/stock-analysis`·`/api/coin-scan`·`/api/portfolio-verdicts` = **서울 리전 고정**.
- **Bybit·업비트가 미국 데이터센터 IP를 차단** (기본 iad1에선 실패)
- 네이버·KIS·ECOS·관세청 등 한국 API 응답속도 개선

### API별 특이사항
- **KRX**: 인증키만으론 부족 — **각 API "활용신청" 승인** 필요(미승인 401). 헤더 `AUTH_KEY`. **MKTCAP은 원 단위**(×1e6 금지)
- **KIS**: 앱키가 모의(VTS)라 도메인 `openapivts...:29443`. 실전 도메인 호출 시 EGW02004. 토큰 1분1회 → throttle
- **DART**: `list.json` corp_code 없이 조회 시 **검색기간 3개월 제한**. 배당은 `alotMatter.json`
- **Bitget**: 읽기전용 키, IP 화이트리스트 비워두기(Vercel 유동 IP). 오더북은 `merge-depth`, 캔들은 `granularity`(4H·1D 지원)
- **ECOS**: `sample` 키는 **10건 제한**. 응답 `foreignerHoldRatio`처럼 **"46.55%" 문자열** 주의
- **관세청**: 응답 **XML**. 조회기간 **1년 이내**. 단월 조회 시 `hsCd="-"` 행이 총계(전체 합산하면 이중계상)
- **FRED**: 최신월 미공표는 `value: "."` → 필터 후 13개 확보 위해 `limit=16`
- **Anthropic**: 크레딧 소진은 200이 아니라 **400 `invalid_request_error`**("credit balance is too low"). 키·모델 문제 아님. 로그는 `vercel logs ... --json` 후 message에 "Anthropic" 필터

### 시크릿
- `.env.local`은 `.gitignore` — 절대 커밋 금지

---

## 7. 최근 발생한 에러와 해결

### 최근 세션 (~2026-07-15)
| 증상 | 원인 | 해결 |
|---|---|---|
| "계속 관망만 나온다"(실투자 피드백) | 방향 문턱 ±30 + 1H 확인형이라 굼뜸 | 문턱 ±30→±20, 약한 우위도 방향 표시, 관망도 기울기 바 표시. entryOk(45)는 유지. 약한 건 안정성 '약함' 라벨 |
| AI 브리핑 항상 null(`Anthropic 400`) | **Anthropic 크레딧 부족**(키·모델·헤더 정상, 결제 거부) | 크레딧 충전 시 자동 복구. 에러 본문 로깅. OAuth 토큰 가설은 오답 |
| 수급 데이터 없는 종목이 매수판정 통과 | `!supply \|\| score>=0` — 결측을 '중립' 취급 | `!!supply && score>=0`(결측→진입 불가). 두 로직 나란히 재현 검증 |
| 레버리지 항상 3/5배 | `Math.min(3/5,…)` 하드캡 | 3요소 곱(적극 최대 20배) |
| 잠금 해제가 URL 수동입력뿐 | unlock이 GET만 지원 | `/api/unlock` POST 추가 + `UnlockGate` 폼 |
| 인증 게이트 배포 후 계좌 503/401 | Vercel에 `APP_ACCESS_TOKEN` 미설정 | `vercel env add` 후 재배포(미설정 시 fail-closed는 의도) |
| 배포 폴링이 "이전 빌드"만 반복 | React가 텍스트를 `<span>`으로 쪼개 UI 문자열 grep 실패 | 응답 JSON 필드/라우트 status로 폴링(§5) |

### 이전 세션 (데이터 소스·정확도)
| 증상 | 원인 | 해결 |
|---|---|---|
| 프로덕션 OI 히스토리 0행 | **Bybit가 데이터센터 IP 전면 차단** | **OKX rubik API 폴백** |
| 코인분석 Bybit/업비트 실패 | Vercel 기본 iad1(미국) 리전 | `preferredRegion = 'icn1'` |
| 외국인 보유율 `None` | ECOS/네이버 **`"46.55%"` 문자열** → `Number()`=NaN | `parseFloat(replace(/[%,]/g,''))` |
| 재무등급 항상 `null` | KIS price는 PER/PBR만 | `fetchKisFinancialRatio` 직접 호출 |
| 주택가격 MoM 비정상 | ECOS 총지수(전국)+총지수(서울) 혼재 | `trim()==='총지수'` 정확 매칭 |
| 반도체 수출 과대 | 관세청 총계행+상세 이중합산 | 총계행(`hsCd==='-'`)만 |
| 손절가 22% | 구조 지지선 멀 때 넓은 값 | 가까운 지지 우선 + 손절폭 제한 |

### 기존 (KRX / 외부 API / KIS)
| 증상 | 원인 | 해결 |
|---|---|---|
| KRX 전 엔드포인트 401 | API별 활용신청 미승인 | data.krx.co.kr 승인 |
| 시가총액 1e6 과다 | MKTCAP 백만원 오인 | 원 단위 그대로 |
| KRX MDC "LOGOUT" | anti-bot 차단 | 공식 오픈API만 |
| 투자자 수급 502 | 네이버 `investorTrend` 폐지 | `/trend` + `*PureBuyQuant` |
| KIS EGW00133/02004/00201 | 1분1회 / 도메인 / 초당 | 사전토큰+JWT exp / VTS `:29443` / throttle 700ms |
| 빌드 실패(tsc 통과) | 미사용 변수(next build eslint) | 커밋 전 `npm run build`까지 |
| push 403(histobio) | 계정 혼선 | `gh auth switch cslis07` |

---

## 8. API 구조

### ★ `/api/stock-analysis?ticker=&model=` — 국내주식 분석 (`maxDuration:30`, `icn1`)
병렬: 네이버 기본/일봉/수급/뉴스 · KIS 재무 · DART 공시 · `/api/market` · 매크로
→ 룰엔진(추세+수급±35+재무+공시+정책+CIO+코스피) → 매수우위/중립/비중축소, 손절·목표, 백테스트(1년, 10분 캐시), AI 브리핑(모델선택, 3분 캐시)
응답: `verdict` `supply` `investor` `fin` `movement` `chart` `zones` `fib` `backtest` `news` `disclosures` `policy` `cio` `indicators[5]` `aiBriefing` `aiModel`

### ★ `/api/coin-analysis?symbol=&model=` — 코인선물 분석 (`maxDuration:30`, `icn1`)
BTC/ETH/XRP/SOL. Bitget 캔들(**1H·15m·5m·4H·1D**) · 펀딩·OI · 롱숏 · 테이커 · **오더북(merge-depth)** · 뉴스 · 공포탐욕 · 김프 · DVOL · 도미넌스
→ 상위레짐(4H·1D) + 1H→15m→5m, **방향 문턱 ±20**, 점수→롱/숏/관망, 레버리지 3요소, 진입자리 게이트, 백테스트(5m×1000봉, 10분 캐시), 이벤트 12h 차단
- `verdict`에 `regime`·`entryQuality`·`entryPlan`·`confidence`·`leverage{conservative,aggressive,max}`. 응답에 `orderbook`
- OI 히스토리: **Bybit → OKX 폴백**

### 🆕 `/api/coin-scan` — 4코인 신호 일괄 스캔 (`icn1`, 3분 캐시)
룰엔진 판정만(뉴스·AI·백테스트·파생수급·htf 제외). 응답 `items[]`(symbol·score·direction·entryOk·state·levAggressive)

### `/api/portfolio-verdicts?tickers=` — 보유 종목 경량 판정 (`icn1`, 티커당 10분 캐시)
일봉+수급만으로 stance/score/stop. 티커 `/^\d{6}$/` 화이트리스트

### `/api/unlock?token=&next=` — 인증 쿠키 발급 (GET 리다이렉트 / POST JSON, IP당 5분 5회)
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
| Deribit | BTC DVOL |
| CoinGecko `/global` | BTC 도미넌스 |
| OKX `rubik/.../open-interest-volume` | OI 히스토리(Bybit 폴백) |
| 업비트 `/v1/ticker` | USDT/KRW·김프, 코인 실시간 시세 |
| Bitget 공개(티커·캔들·merge-depth) | 코인 시세·분석·스캔·오더북 |

---

## 9. ⛔ 하지 말 것

- **`vercel env pull` 절대 금지** — 로컬 `.env.local`의 로컬 전용 키가 삭제됨. env 추가는 `vercel env add`만.
- **`APP_ACCESS_TOKEN`을 Vercel에서 지우지 말 것** — 지우면 프로덕션 `/bitget`·`/analyze`가 503(fail-closed). 미들웨어가 의도적으로 잠금.
- **`.env.local` 커밋 금지**(gitignore). 토큰·키를 로그나 응답에 출력 금지(자격증명 노출 방지 정책).
- **`app/api/debug/naver`** — 디버그용, 프로덕션에 열려 있으므로 민감정보 노출 주의(제거 검토는 남은 작업).
- 배포 전파 폴링에서 **UI 한글 문자열 전체를 grep하지 말 것** — React가 span으로 쪼개 안 잡힘. JSON 필드/라우트 status로.
- **UI 확인은 프로덕션 URL로** — localhost 빌드는 미커밋 코드까지 포함하므로 "이미 배포됨" 오판(§0 교훈).

---

## 10. ❌ 보류 / 구조적 한계 (재시도 방지)

- ❌ **코인 청산 히트맵** — CoinGlass 유료. Binance/Bybit 청산 스트림은 무료지만 **웹소켓 상시 수신 필요 → Vercel 서버리스 불가**. 급변 캔들 감지 + 오더북 스냅샷이 무료 대안
- ❌ **온체인 고래·거래소 유입출** — CryptoQuant·Glassnode 유료
- ❌ Bitget 카피트레이딩(trace 권한)·WebSocket(서버리스)·Place-Order(안전)
- ❌ 토스증권 API(공개 API 없음) · KRX MDC 공개엔드포인트(anti-bot LOGOUT 차단)
- ❌ **백테스트에 수급·파생 신호 반영** — 과거 시점 데이터가 없음(네이버 수급은 당일치만, 파생은 스냅샷). 기술적 신호만 검증하고 배지·고지로 한계 명시
- ❌ **청산가 정확 계산** — 거래소 티어·수수료별로 달라 MMR 0.5% 가정 근사만. UI에 "주문 전 거래소 확인" 고지
- ❌ **이벤트(CPI·FOMC) 방향 예측** — 뉴스 결과는 기술적 분석으로 못 맞힘. 이벤트 12h 진입 차단 + "도박 구간"으로만 대응(예측 시도 자체가 구조적 불가)
- ❌ **서버 푸시 알림(탭 닫아도 오는)** — 웹소켓/크론+텔레그램 필요. 현재 알림은 페이지 열린 상태에서만 동작(사용자가 포지션 관리 기능은 원치 않아 우선순위 낮음)

---

## 11. 디렉토리 구조

```
kospi-lab/
├── middleware.ts             # 민감 라우트 인증 게이트
├── app/
│   ├── api/                  # 39 routes
│   │   ├── stock-analysis/   # ★ 주식 분석 (icn1)
│   │   ├── coin-analysis/    # ★ 코인 분석 (icn1) — 레짐·오더북·진입플랜·안정성
│   │   ├── coin-scan/        # 4코인 일괄 스캔
│   │   ├── portfolio-verdicts/ # 보유 종목 판정
│   │   ├── unlock/           # 인증 쿠키 발급(GET/POST)
│   │   └── krx · stock · crypto · futures · bitget · kis · dart · market · ...
│   ├── stock-analysis/ · coin-analysis/   # ★ 분석 페이지
│   └── *.tsx                 # 23 pages (page.tsx = 홈, 분석 카드)
├── components/               # 18 — UnlockGate🆕 · LivePriceTag · BriefingModelPicker · CoinCandleChart · Header · NavTabs · ...
├── hooks/                    # 10 — useStockJournal · useBriefingModel · useCoinJournal · useCoinAlerts · usePortfolio · ...
├── lib/                      # 21 — coinAnalysis(★엔진) · stockAnalysis · (stock/coin)Backtest · anthropic · rateLimit · marketReference · macroIndicators · krx · kis · kisFinance · bitget · ...
├── public/guide.html
├── .env.local                # gitignore (APP_ACCESS_TOKEN·KRX·KIS·DART·BITGET·ANTHROPIC·ECOS·FRED·CUSTOMS)
└── PROJECT_STATUS.md
```
