# KOSPI LAB — Project Status

> **마지막 업데이트: 2026-08-07**
> **위치:** `C:\Users\GB\Documents\kospi-lab`
> **GitHub:** `cslis07/kospi-lab` · 기본 브랜치 `main` · ⚠️ **저장소 공개(public)**
> **배포:** [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel (git push → 자동 배포)
> **규모:** API 라우트 39 · 페이지 24 · lib 27 · hooks 11 · components 19 · scripts 9 · tests 1(35케이스)

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — `git status` 비어 있음, `main`이 `origin/main`과 동기. 마지막 커밋 `0bd90c5`.
게이트 전부 통과 확인(테스트 35/35 · `tsc` 0 · `build` 성공 · 프로덕션 실측).

### 🔴 사용자가 직접 해야 할 것 (미완, 코드로 해결 불가)
- **KRX API 키 재발급** — `data.krx.co.kr`. 하드코딩 폴백이 **public 저장소**에 커밋돼 있었고(`3876676`), 실측으로 **키가 아직 유효함**을 확인했다. 코드에서는 제거(`24ee41c`)했으나 **git 이력에 남아 있어 재발급 외에 방법이 없다.** 재발급 후 `vercel env add KRX_API_KEY production` + `.env.local` 갱신.
- **분석 페이지 잠금 해제(브라우저 1회)** — `/api/stock-analysis`·`/api/coin-analysis`를 게이트에 넣었으므로 `kl_auth` 쿠키가 없으면 401. `/bitget`에서 토큰 1회 입력하면 1년 유지(§6).

### 다음 채팅이 가장 먼저 할 한 가지
**§0의 "엔진 엣지 측정 결과"를 먼저 읽을 것.** 이 앱은 2026-08-07 부로 **신호 생성기가 아니라 리스크 관리 도구**로 위치가 바뀌었다. 기능을 추가할 때 **"이게 진입 신호처럼 읽히는가"를 먼저 보고**, 읽힌다면 측정된 엣지 근거가 있어야 하며 없으면 리스크 관점으로 표현을 바꾼다.

### 🔬 엔진 엣지 측정 결과 (2026-08-07 · 이 프로젝트의 가장 중요한 사실)

**측정 가능한 엣지가 어디에도 없다.** 독립적인 세 실험이 같은 결론:

| 실험 | 표본 | 결과 | 스크립트 |
|---|---|---|---|
| 추세추종 — 가격 지표만 | 45일·4코인·727건 | 승률 **49.7%** (±1.9%p), 기대값 −0.006R | `scripts/backtest-lab.ts` |
| 추세추종 — 파생 수급 포함 | 28일·4코인·407건 | 승률 **48.4%** (±2.5%p), 차이 −1.1%p로 오차범위 안 | `scripts/backtest-deriv.ts` |
| 펀딩 극단 되돌림 | 89일·19종목·2,168건 | **3/6 통과** → 하락장 베타로 판명 | `scripts/validate-funding.ts` |

- 1R 손절·1R 익절의 손익분기가 50%. **왕복 수수료 0.12%가 손절폭 0.2% 기준 1R의 60%**를 먹으므로 실제로는 확실히 마이너스. 손절폭을 1%로 넓히면 필요 승률이 80%→56%로 떨어지지만, **엣지가 0이면 수수료를 줄여도 0에 수렴할 뿐 넘지 못한다.**
- **펀딩 전략이 탈락한 결정적 이유**: 대조군에서 **펀딩과 무관하게 그냥 항상 숏을 쳐도 +0.222%(t=5.02)** 가 나오는 기간이었다. 전략의 83%가 숏 진입이라 수익 상당분이 하락장 베타였고, 롱 방향은 음수(−0.228%), 후반 45일에선 효과가 6배 약화. 파라미터도 민감(16h/2% 설정은 2/6). **실투자 금지.**
- 펀딩 히스토리가 **270건(90일)이 상한**이라 이 데이터로는 더 검증할 수 없다.

**➡️ 이에 따라 도구 위치를 재정의했다(`1054f57`).** 사이트 제목·설명, 내비 문구, 홈 첫 화면 안내, 전역 푸터, 코인 분석 상단 배너, `entryOk` 배지(초록 `✓ 진입 조건 충족` → 파랑 `체크리스트 통과 (우위 아님)`)에 모두 반영. **AI 브리핑 프롬프트에서도 방향 추천을 제거**(`【진입 관점】 롱/숏/관망` → `【리스크 점검】`)하고 배포본에서 추천성 표현 0건 실측.

### 🟡 엔진 감사 잔여 (미착수 — 전부 표시·정확도 계열)
2026-07-27 감사에서 나온 항목 중 아직 안 고친 것. 진입 판정 자체를 오염시키는 건 없다(코드로 확인).

- **M-1 수급 결측의 남은 구멍** — `lib/stockAnalysis.ts:344`. `!!extras.supply`는 null만 막는다. 3일 이상 있고 값이 전부 0이면 통과. `dataDays` 필드 추가 필요
- **M-2 숏 손절률을 UI가 "−"로 표시** — `app/coin-analysis/page.tsx:879`에 부호 하드코딩. 같은 패널 청산가는 올바르게 `{isShort ? '+' : '-'}`. 숏은 손절이 진입가 **위**라 오독 위험
- **M-4 `confidence`가 차단 게이트 미반영** — 이벤트 임박·역추세인데 "🟢 견고 95%"와 "진입 대기"가 동시 표시
- **M-5 펀딩 회피가 정산 직후 통과** — `lib/coinAnalysis.ts:490` `minToFunding >= 0`이라 과거 타임스탬프면 게이트가 열린다. `>= -5`로
- **M-7 `trigger`가 방향을 기억하지 않음** — 표시·근거만 오염(진입 판정 오염은 재현 안 됨)
- **M-8 매매일지 R 회계 불일치** — 자동판정 win=1R vs 수동 익절=1.5R
- 기능 공백: 저널의 레버리지가 실제 사용 배율이 아님(엔진 권장값 저장), Bitget 연동이 현물 전용이라 선물 포지션·총자산 누락, 기존 훅들은 스키마 버전 없음(신규 `useCandidates`만 v1 래핑), 저널 100건 초과분 무통보 폐기

**이번 세션에 고친 감사 항목**(코드로 확인): H-2 백테스트 lookahead(`coinBacktest.ts:54`), vwap 기준일(`coinAnalysis.ts:179`), M-6 ema200 시드(`coinAnalysis.ts:105`).

---

## 1. 프로젝트 목적

**국내·해외 주식 + 코인 + 선물 통합 투자 리스크 관리 대시보드.** 방향 판단은 사용자가 하고, 앱은 **손절·사이징·청산가·기록**을 맡는다.

**최근 방향성 (2026-08-07 전환) — "지금 사도 되는가"에서 "얼마나 걸고 어디서 끊을 것인가"로.**
원래는 룰 엔진으로 매수 판단을 답하는 도구였으나, 대규모 백테스트에서 엣지가 확인되지 않아(§0) **신호 생성기 역할을 공식적으로 내려놨다.** 룰 엔진 점수는 체크리스트로 남기고, 실제 가치는 손절 강제·포지션 사이징·청산가 안전배수·이벤트 회피·매매일지에 있다.

- ⚠️ **정직성 원칙(코드에 안 적힌 맥락):** 엔진이 못 하는 것을 할 수 있는 것처럼 표시하지 않는다. 이벤트(CPI·FOMC) 결과 예측 불가 → 12h 진입 차단으로만 대응. 엣지 미검증 → 화면에 명시. 측정 안 한 것은 "미검증"이라고 쓴다.
- 스택: Next.js 16 App Router · React 19 · TypeScript · Tailwind · Recharts · SWR
- 로그인 없음(보유·관심·매매일지·후보는 localStorage). **단, 민감 라우트는 토큰 게이트**(§6)
- Bitget만 API 키로 본인 계좌 조회(읽기 전용)

---

## 2. 현재 구현된 기능

### 🔬 분석 (핵심)

**국내주식 분석 `/stock-analysis`** — 종목 자동완성 · **버튼으로만 실행** · 실시간 시세(10초) · 룰 엔진(일봉 추세 + 투자자 수급±35 + 재무등급 + DART 공시 + 정책 + 메릴린치 CIO + 코스피 동조) · 경제지표 패널(FRED CPI · ECOS 가계부채·부동산 · 관세청 반도체수출, 6h 캐시) · 캔들차트 · 백테스트 · AI 브리핑(모델 선택) · 판정 기록. `?ticker=` 딥링크 지원.

**코인선물 분석 `/coin-analysis`** (BTC·ETH·XRP·SOL) — **버튼으로만 실행** · 실시간 시세(5초) · 다중 TF 룰 엔진(1H→15m→5m) · 파생 수급(테이커·OI 4분면·롱숏 격차) · 시장 심리(공포탐욕·김프·펀딩·DVOL·도미넌스) · 상위 TF 레짐 필터(4H·1D) · 진입 자리 품질 게이트 · 오더북 유동성 패널 · 진입 플랜 · 신호 안정성 · **리스크 패널**(레버리지 슬라이더·격리 청산가·안전배수·분할 매수 3분할·증거금 시드초과 경고) · 전체 스캔 · 포지션 감시 · 매매일지 + 자동 채점.

**성장주 발굴 `/growth`** — 한국(KRX 시총 상위) + **미국(큐레이션 141종목, GICS 11섹터 × 테마 17종)**. 확정 성장 35 · 컨센서스 기대 30 · 수익성 15 · 밸류 20 = 100점. **시장 환경 패널**(VIX·미국채10y·WTI·달러인덱스·한국 기준금리) · **버핏 체크 7항목** · 룰 기반 추천 코멘트 · 상위 추천 5 · **후보 보드**(재무 × 타이밍 2축 사분면) · 종목 직접 검색(유니버스 밖도 스캔).

**기타** — 버핏 스크리너 `/screener` · KRX 시장 `/krx` · 뉴스 `/news` · 공시 `/dart` · 리포트 `/report` · 캘린더 `/calendar` · 커뮤니티 `/community`(스텁) · 가상투자·백업 `/virtual`

### 시장 · 내 자산 · 설계
`/domestic` · `/overseas` · `/my-stocks` · `/futures` · **통합 자산 `/portfolio`**(보유 종목 판정 배지) · 비트겟 `/bitget`(잠금 해제 폼) · 투자설계 `/invest` · 세제혜택 `/tax` · 증권사비교 `/brokerage` · 시뮬레이션 `/simulate`

### 공통
글로벌 검색(⌘K) · 환율 pill(USD/USDT/JPY) · 다크/라이트 · 모바일 · `/guide.html` · AI 브리핑 모델 선택(Haiku 4.5 / Sonnet 5 기본 / Opus 4.8) · 에러 복구 UI · SEO(robots·sitemap) · 전역 면책 footer

---

## 3. 수정한 주요 파일

### 🆕 이번 세션 신규 (2026-08-06 ~ 08-07)
| 경로 | 역할 |
|---|---|
| `lib/growthScreener.ts` | 성장주 점수화 — 네이버 연간 재무(확정 3개년 + **컨센서스 연도**) 수집 + `scoreGrowth` 순수 함수. ⚠ PEG는 **기준 EPS 흑자일 때만** 계산 |
| `lib/usGrowth.ts` | 미국 유니버스 141종목(섹터×테마 태깅) + `scoreUsGrowth`. 유니버스 밖 티커도 스캔 가능 |
| `lib/yahooFinance.ts` | Yahoo quoteSummary 공용 클라이언트(crumb 인증·호스트/모듈 폴백·1h 캐시). 스크리너에서 추출 |
| `lib/marketEnvironment.ts` | 시장 환경 5지표(VIX·미국채10y·WTI·달러인덱스·한국 기준금리) + 종합 신호등. FRED/ECOS 기존 키 재사용 |
| `lib/fetcher.ts` | SWR 공용 fetcher — non-2xx를 삼키지 않고 `ApiError`로 throw |
| `hooks/useCandidates.ts` | 후보 종목 — **`{v, data}` 스키마 래핑**(기존 훅들의 날것 배열 저장 문제 방지), 파싱 실패 시 원본 보존, 저장 실패 알림 |
| `components/CandidateBoard.tsx` | 후보 보드 — 재무 × 타이밍 2축 사분면. **두 점수를 합치지 않는다** |
| `app/api/growth-scan/route.ts` | 유니버스/배치 스캔/시장환경 3-모드 (`icn1`) |
| `app/growth/` | 성장주 발굴 페이지 + layout(metadata) |
| `scripts/backtest-lab.ts` | 대규모 백테스트 랩 — Bitget 히스토리 페이지네이션 |
| `scripts/backtest-deriv.ts` | 파생 레이어 A/B |
| `scripts/backtest-funding.ts` · `validate-funding.ts` | 펀딩 전략 1차 실험 + 6단계 본검증 |
| `scripts/measure-backtest-bias.ts` | 미래참조량 정량화 |
| `scripts/verify-macro.ts` · `verify-growth.ts` · `verify-growth-us.ts` | 실데이터 검증 스크립트 |
| `CHANGELOG.md` · `COMPLETENESS.md` | 기록 문서 2종(2026-08-06 운영 시작) |

### 이번 세션 주요 변경
| 경로 | 변경 |
|---|---|
| `lib/coinAnalysis.ts` | **ema200 시드 복구**(워밍업 SMA+EMA), **vwap 기준일**을 서버시각→마지막 캔들, 분할매수 존 손절 클램프, 피보나치 target2 역전 수정, `rr` 실계산, `signalGrade`를 score 함수로 분리 |
| `lib/coinBacktest.ts` | **미래 참조 제거**(완결봉만), 상위TF 레짐 필터 적용 가능하도록 인자 추가 |
| `lib/positionSizing.ts` | `tranches3`에 손절 안쪽 강제 클램프(이중 방어) |
| `lib/stockAnalysis.ts` | `target1` Infinity 수정, `StockExtras.technicalOnly` 추가(백테스트 전용 수급 게이트 면제) |
| `lib/macroIndicators.ts` | CPI YoY **날짜 매칭**(13개월→12개월), ECOS 가계부채 `count` 확대(2025Q1 고정 해소) |
| `middleware.ts` | 게이트 확대 — `/api/stock-analysis`·`/api/coin-analysis`·`/api/debug/*` 추가 |
| `app/api/krx/stock-list/route.ts` | **하드코딩 KRX 키 폴백 제거** |
| `app/coin-analysis/page.tsx` | 엣지 미검증 배너, `entryOk` 배지 문구·색 변경, 증거금 시드초과 경고, 분할 평단 기준 실제 손실 표시 |
| `app/stock-analysis/page.tsx` | 동일 취지 + `?ticker=` 딥링크 |
| `app/api/{coin,stock}-analysis/route.ts` | **AI 프롬프트에서 방향 추천 제거** → `【리스크 점검】` |
| `app/layout.tsx` · `app/page.tsx` · `components/NavTabs.tsx` | 도구 위치 재정의 문구 |
| `tests/engine.test.ts` | 15 → **35케이스** |

### 삭제
| 경로 | 이유 |
|---|---|
| `app/api/kis/token/route.ts` | 소비자 0건인 죽은 라우트인데 KIS bearer 토큰을 무인증 반환 |

---

## 4. 남은 작업

### 우선순위 높음
- [ ] **M-2 숏 손절률 부호** — `app/coin-analysis/page.tsx:879` 한 줄. 숏에서 손절을 진입가 아래로 오독할 수 있어 실수 유발. **한 줄 수정인데 아직 안 한 이유: 이번 세션이 엣지 측정에 집중되어 UI 세부는 후순위로 밀렸다**

### 개선 여지
- [ ] **M-1/M-4/M-5/M-7/M-8** — §0 잔여 목록. 전부 표시·정확도 계열이고 진입 판정을 오염시키지 않아 급하지 않다
- [ ] **`app/api/debug/naver` 제거 검토** — 이제 게이트 뒤로 들어갔다(401). 네이버 응답 확인용이라 유지 중
- [ ] **DART 공시 목록 정렬** — 정기 신고 다수 노출, 원본 순서 그대로(`slice(0,12)`), 우선순위 로직 미구현
- [ ] 해외/코인 portfolio 수기 입력 — 통합자산은 국내주식+Bitget 현물만
- [ ] **버핏 스크리너 `/screener` 폐지 검토** — 성장주 발굴이 상위호환이 됐고 다중소스 폴백도 이식 완료. **며칠 써보고 아쉬운 게 없으면 접기로 해서 대기 중**

### 구조적 (우선순위 낮음)
- [ ] **API 라우트·UI 통합 테스트** — 엔진·사이징은 35케이스로 고정됨. 외부 API 모킹 비용 대비 가치가 낮아 미착수
- [ ] **서버 컴포넌트 전환** — 페이지 전부 `'use client'`. 전면 리팩터링이라 범위 밖
- [ ] **모달 포커스 트랩** — `role=dialog`+ESC까지 적용. 단일 사용자 도구라 우선순위 낮음
- [ ] **주식 엔진 엣지 측정** — 코인은 측정했으나 주식은 안 했다. 다종목 일봉 랩이 필요해 미착수(UI에는 "검증된 적 없음"으로 정직하게 표기 완료)

### 확장 여지 (KRX 추가 API — 활용신청·승인 필요)
- [ ] **채권(bon)** / **파생(drv)** / **ESG** — 현재 미승인 401. data.krx.co.kr에서 활용신청 후 `lib/krx.ts`에 추가

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\kospi-lab

npm run dev                  # 개발서버 (localhost:3000, 점유 시 --port 3021 등)
npm run dev -- --port 3025   # 포트 지정 (.env.local 변경 시 반드시 재시작)
```

### 커밋 전 검증 (반드시 이 순서대로)
```bash
npm test                     # 1) 회귀 테스트 35케이스 (레버리지·청산가·사이징·게이트·성장주 점수)
npx tsc --noEmit             # 2) 타입체크 (tests/·scripts/ 포함)
npm run build                # 3) 프로덕션 빌드 (lint 포함 — 미사용 변수도 실패 처리)
```

### 배포
```bash
git push origin main         # = Vercel 자동 배포
vercel env ls production     # env 목록 확인
echo "값" | vercel env add KEY_NAME production   # env 추가 (⚠ env pull 절대 금지 — §9)
gh auth switch --user cslis07 && gh auth setup-git   # push 403 시
```

### 측정·검증 스크립트 (실데이터, 앱 배포와 무관)
```bash
npx tsx scripts/backtest-lab.ts 45 BTCUSDT,ETHUSDT   # 대규모 백테스트
npx tsx scripts/validate-funding.ts 24 3             # 펀딩 전략 6단계 검증
npx tsx scripts/verify-macro.ts                      # 경제지표 수집 검증
npx tsx scripts/verify-growth.ts                     # 성장주 점수 실데이터 검증
```

### 배포 확인 (프로덕션 전파 폴링)
```bash
# ⚠ UI 한글 문자열 전체 grep 금지 — React가 <span>으로 쪼개 안 잡힘.
# 응답 JSON의 새 필드나 라우트 status로 폴링할 것.
until curl -s -H "x-app-token: <토큰>" \
  "https://kospi-lab.vercel.app/api/coin-analysis?symbol=BTCUSDT" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).verdict?.confidence?1:0))'; do sleep 15; done
```

---

## 6. 배포 관련 주의사항

### GitHub 인증
- gh CLI에 두 계정: `cslis07`(소유자), `histobio0302-oss`
- push 403 시: `gh auth switch --user cslis07 && gh auth setup-git`
- ⚠️ **저장소가 public이다.** 시크릿이 코드에 들어가면 즉시 유출된다(§9)

### Vercel 환경변수 (2026-08-07 `vercel env ls production` 실측 · 14개)
| 키 | 용도 | 설정된 곳 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 민감 라우트 게이트. **미설정 시 프로덕션 503 fail-closed** | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX 공식 API | Vercel + `.env.local` · **재발급 필요(§0)** |
| `KIS_APP_KEY`/`KIS_APP_SECRET`/`KIS_ACCOUNT`/`KIS_ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART 공시·재무 | Vercel |
| `BITGET_API_KEY`/`BITGET_API_SECRET`/`BITGET_API_PASSPHRASE` | 읽기 전용 | 양쪽 |
| `ANTHROPIC_API_KEY` | AI 브리핑 | Vercel |
| `ECOS_API_KEY` | 한국은행(가계부채·부동산·기준금리) | 양쪽 |
| `FRED_API_KEY` | 미국 CPI·VIX·미국채·WTI·달러인덱스 | 양쪽 |
| `CUSTOMS_API_KEY` | 관세청(반도체 수출) | 양쪽 |

⚠️ env 변경 후 **반드시 재배포**해야 반영된다.

### 🔒 인증 게이트
- 게이트 대상(`middleware.ts` matcher, 코드로 확인): `/api/bitget/*` · `/api/analyze` · `/api/stock-analysis` · `/api/coin-analysis` · `/api/debug/*`
- 브라우저에서 `/bitget`이 "🔒 잠긴 페이지"로 보이면 정상. 토큰 입력 폼에 `APP_ACCESS_TOKEN` 붙여넣기 → HttpOnly 쿠키(1년)
- curl 테스트: `-H "x-app-token: <토큰>"`

### 리전 고정 (`preferredRegion = 'icn1'`)
`/api/coin-analysis` · `/api/stock-analysis` · `/api/coin-scan` · `/api/portfolio-verdicts` · `/api/growth-scan` = **서울 리전 고정**
- **Bybit·업비트가 미국 데이터센터 IP를 차단**(기본 iad1에선 실패)
- 네이버·KIS·ECOS·관세청 등 한국 API 응답속도 개선

### 런타임 제약
- 분석 라우트 `maxDuration = 30`. AI 브리핑 타임아웃이 25초라 상류가 느리면 전체가 504가 될 수 있다
- **Yahoo Finance는 로컬 Node에서 검증 불가** — 홈 응답 헤더가 undici 한도를 넘어 `HeadersOverflowError`. **프로덕션에서만 검증 가능**(Vercel은 정상)

---

## 7. 최근 발생한 에러와 해결

### 이번 세션 (2026-08-06 ~ 08-07)
| 증상 | 원인 | 해결 |
|---|---|---|
| 백테스트 성적이 실제보다 좋음 | `sliceUpTo`가 봉 '시작'시각으로 잘라 1H봉이 **평균 22.6분(최대 45분) 미래** 포함 | 완결봉만 사용. 실측 **승률 +4.0%p 과대**였음 |
| 백테스트와 실전이 다른 룰 | `vwapCalc`가 서버 현재시각 기준 → 과거 구간에서 항상 null. **표본 81%에서 VWAP ±6점 미적용** | 마지막 캔들 시각 기준으로 변경 |
| ema200이 EMA가 아니었음 | 시드를 계산해놓고 `i===0`에서 덮어써 죽음. 첫 종가 **13.67% 가중** 잔존 | 워밍업 SMA + EMA 재귀 |
| 파생 레이어가 한 번도 검증 안 됨 | 백테스트가 `extras={}`로 돌아 라이브의 ±22점을 못 봄 | 공개 히스토리 API로 재현(§10 전제 정정) |
| 검색 종목명이 티커로 표시("RBLX RBLX") | Yahoo quoteSummary 모듈에 **`price` 누락** | 모듈 목록에 추가. **기존 버핏 스크리너도 같은 이유로 계속 티커를 보여주고 있었다** |
| 빈 '부동산' 섹터 칩 | 카테고리에 종목 0개 | 테스트("모든 섹터·테마에 1개 이상")가 잡아냄 → 데이터센터 리츠 추가 |
| 적자 기업이 초저 PEG 저평가주로 둔갑 | EPS −160 → +60을 "137% 성장"으로 계산 | **기준 EPS 흑자일 때만 PEG 계산**. 회귀 테스트가 구현 단계에서 잡음 |
| 후보 보드 🎯 사분면이 항상 비어 있음 | 경량 판정이 정밀 분석과 같은 문턱(≥30)을 쓰면서 가점 ~18점을 입력에 안 넣음 | 문턱을 실측 분포 기반 10으로. 상위 30종목 중 ≥30은 4개(13%), ≥10은 12개(40%) |
| 미국 성장주 전멸(로컬) | Yahoo 홈 응답 헤더가 undici 한도 초과 | 프로덕션에서만 검증(§6) |
| `tsc` 이름 충돌 | 스크립트에 `import`가 없어 전역 스크립트로 취급 | `export {}` 추가 |
| 삭제한 라우트를 참조하는 tsc 에러 | `.next` 자동생성 타입 캐시가 낡음 | `.next` 삭제 후 재빌드 |

### 이전 세션 (2026-07-27 전체 점검)
| 증상 | 원인 | 해결 |
|---|---|---|
| KRX 키가 public 저장소에 유출 | `process.env.X ?? '실제키'` 폴백 패턴 | 폴백 제거. **재발급은 미완(§0)** |
| AI 과금 라우트가 무인증 공개 | matcher가 값싼 레거시 라우트만 커버 | 게이트 확대, 401 실측 |
| 분할매수 3차 지정가가 손절 밖 | pullback 존이 EMA20을 그대로 사용 | 존 클램프 + `tranches3` 이중 방어. 라이브 4/4 안쪽 재검증 |
| 증거금이 시드 초과인데 무경고 | `margin ≤ seed` 검사 없음 | 붉은 경고 + 대안 안내 |
| 주식 백테스트가 항상 신호 0건 | `extras={}`라 `strongSupply` 항상 false | `technicalOnly` 면제 플래그 |
| 주식 목표가 "∞원" | `Math.min(...[])`가 `Infinity`(truthy)라 `\|\|` 폴백 불발 | 빈 배열 선거름 |
| 미국 CPI가 13개월 변화율 | 미공표월(`.`) 필터로 인덱스가 밀림 | 날짜 매칭 (3.73%→3.46%) |
| 가계부채가 5분기 낡음 | ECOS가 오래된 분기부터 반환, `count=10`이 최신 분기를 자름 | count 확대 (2025Q1→2026Q1) |
| 분석 실패가 화면에 안 보임 | `useSWR`의 `error`를 미사용 | `lib/fetcher.ts` throw + 실패 배너 |

### 기존 (외부 API)
| 증상 | 원인 | 해결 |
|---|---|---|
| 프로덕션 OI 히스토리 0행 | **Bybit가 데이터센터 IP 전면 차단** | OKX rubik 폴백 |
| 코인분석 Bybit/업비트 실패 | Vercel 기본 iad1(미국) | `preferredRegion = 'icn1'` |
| 외국인 보유율 `None` | ECOS/네이버 **`"46.55%"` 문자열** → `Number()`=NaN | `parseFloat(replace(/[%,]/g,''))` |
| 주택가격 MoM 비정상 | ECOS 총지수(전국)+총지수(서울) 혼재 | `trim()==='총지수'` 정확 매칭 |
| 반도체 수출 과대 | 관세청 총계행+상세 이중합산 | 총계행(`hsCd==='-'`)만 |
| AI 브리핑 항상 null(400) | **Anthropic 크레딧 부족**(키·모델 정상) | 충전 시 자동 복구. OAuth 가설은 오답 |
| KRX 전 엔드포인트 401 | API별 활용신청 미승인 | data.krx.co.kr 승인 |
| 시가총액 1e6 과다 | MKTCAP을 백만원으로 오인 | **원 단위 그대로** |
| KIS EGW00133/02004/00201 | 1분1회 / 도메인 / 초당 | 사전토큰+JWT exp / VTS `:29443` / throttle 700ms |
| push 403 | 계정 혼선 | `gh auth switch cslis07` |

---

## 8. API 구조

### 내부 라우트 (핵심)
| 라우트 | 설명 |
|---|---|
| ★ `/api/stock-analysis?ticker=&model=` | 국내주식 분석 (`maxDuration:30`, `icn1`, **게이트**). 네이버 기본/일봉/수급/뉴스 · KIS 재무 · DART 공시 · 매크로 병렬 → 룰엔진 → 백테스트(10분 캐시) · AI 브리핑(3분 캐시) |
| ★ `/api/coin-analysis?symbol=&model=` | 코인선물 분석 (`maxDuration:30`, `icn1`, **게이트**). Bitget 캔들(1H·15m·5m·4H·1D) · 펀딩·OI·롱숏·테이커·오더북 · 공포탐욕·김프·DVOL·도미넌스 |
| 🆕 `/api/growth-scan` | 3-모드: `mode=universe`(KRX 시총상위 또는 US 큐레이션, 섹터/테마 필터) · `codes=`(한국 배치 15) · `tickers=`(미국 배치 15) · `mode=environment`(시장 환경 5지표, 6h 캐시) |
| `/api/coin-scan` | 4코인 신호 일괄 스캔 (3분 캐시). 룰엔진 판정만 |
| `/api/portfolio-verdicts?tickers=` | 경량 판정(일봉+수급만, 티커당 10분 캐시). **AI·게이트 없음** → 후보 보드가 재사용 |
| `/api/unlock?token=&next=` | 인증 쿠키 발급 (GET 리다이렉트 / POST JSON, IP당 5분 5회) |
| 기존 | `/api/krx/*` · `/api/stock/*` · `/api/crypto/*` · `/api/futures/*` · `/api/bitget/*`(HMAC) · `/api/kis/price` · `/api/dart/*` · `/api/screener` · `/api/market` · `/api/search`·`stock-search`·`overseas/search` · `/api/news/*` · `/api/debug/naver`(게이트) |

### 외부 API 특이사항 (⚠ 함정 위주)
| API | 키 | 특이사항 |
|---|---|---|
| **KRX** | 필요 | 인증키만으론 부족 — **API별 "활용신청" 승인** 필요(미승인 401). 헤더 `AUTH_KEY`. **MKTCAP은 원 단위**(×1e6 금지) |
| **KIS** | 필요 | 앱키가 모의(VTS)라 도메인 `openapivts...:29443`. 실전 도메인 호출 시 EGW02004. **토큰 1분 1회** → throttle 700ms |
| **DART** | 필요 | `list.json`을 corp_code 없이 조회 시 **검색기간 3개월 제한**. 배당은 `alotMatter.json` |
| **네이버 금융** | 불필요 | 모바일 API. `finance/annual`이 **확정 3개년 + 컨센서스 1개년**을 준다(컨센서스의 PER = 포워드 PER). 투자자 수급은 `/trend` + `*PureBuyQuant` |
| **Bitget** | 읽기전용 | IP 화이트리스트 **비워두기**(Vercel 유동 IP). 캔들 granularity는 `5m·15m·1H·4H·1D`(소문자 `4h` 불가). **`1D` history는 1회 90봉 상한**. **펀딩 히스토리는 270건(90일)이 상한** |
| **OKX rubik** | 불필요 | OI·롱숏·테이커 히스토리. `period=1H`는 720건(30일), `period=5m`는 576건(**2일뿐**) |
| **Yahoo Finance** | 불필요 | crumb 인증 필요. **모듈에 `price`를 넣어야 종목명을 받는다**. ⚠ 로컬 Node에서 `HeadersOverflowError` — 프로덕션에서만 검증 가능 |
| **ECOS** | 필요 | `sample` 키는 10건 제한. **오래된 기간부터 반환**하므로 `count`를 작게 주면 최신이 잘린다. `"46.55%"` 문자열 주의. 분기 표기는 `2025Q1` 형식 |
| **FRED** | 필요 | 미공표월은 `value: "."` → **인덱스가 아니라 날짜로 매칭**할 것 |
| **관세청** | 필요 | 응답 **XML**. 조회기간 1년 이내. 단월 조회 시 `hsCd="-"` 행이 총계(전체 합산하면 이중계상) |
| **Anthropic** | 필요 | 크레딧 소진은 200이 아니라 **400 `invalid_request_error`** |
| 무키 소스 | — | BLS(CPI 폴백) · alternative.me(공포탐욕) · Deribit(DVOL) · CoinGecko(도미넌스) · 업비트(USDT/KRW·김프) |

---

## 9. ⛔ 하지 말 것

- **시크릿에 하드코딩 폴백(`process.env.X ?? '실제값'`)을 절대 쓰지 말 것** — 이 저장소는 **public**이다. KRX 키가 이 패턴으로 유출됐다. 키가 없으면 빈 문자열 + graceful 실패(`lib/krx.ts` 패턴).
- **`vercel env pull` 절대 금지** — 로컬 `.env.local`의 로컬 전용 키가 삭제된다. env 추가는 `vercel env add`만.
- **`APP_ACCESS_TOKEN`을 Vercel에서 지우지 말 것** — 지우면 게이트 라우트가 전부 503(fail-closed). 미들웨어가 의도적으로 잠근다.
- **`.env.local` 커밋 금지**(gitignore). 토큰·키를 로그나 응답에 출력 금지.
- **`/api/kis/:path*`를 통째로 게이트에 넣지 말 것** — `/api/kis/price`는 `StockDetailModal`이 쓴다.
- **`app/api/debug/naver`** — 요청당 상류 8콜(증폭). 게이트 뒤로 옮겼으나 삭제 검토 대상.
- 배포 전파 폴링에서 **UI 한글 문자열 전체를 grep하지 말 것** — React가 `<span>`으로 쪼개 안 잡힌다. JSON 필드/라우트 status로.
- **UI 확인은 프로덕션 URL로** — localhost 빌드는 미커밋 코드까지 포함하므로 "이미 배포됨" 오판.
- **프로덕션 API 응답을 볼 때 필드명을 먼저 확인할 것** — 경제지표는 `indicators[].value`가 아니라 **`.macro`**에 있다. 잘못된 필드를 보고 "지표 결손"으로 오진할 뻔했다.
- 🆕 **엣지 근거 없이 진입 신호처럼 읽히는 UI를 추가하지 말 것** — 측정 결과 엣지가 없다(§0). 새 기능이 "사도 된다"로 읽히면 근거를 대거나 리스크 관점으로 바꿔 표현한다.
- 🆕 **파라미터를 바꿔가며 "통과하는 조합"을 찾지 말 것** — 펀딩 전략이 16h/2%에선 2/6, 24h/3%에선 6/6이었다. 조합 탐색은 그 자체가 과적합 신호다. 판정 기준을 먼저 정하고 나서 측정할 것.

---

## 10. ❌ 보류 / 구조적 한계 (재시도 방지)

- ❌ **코인 청산 히트맵** — CoinGlass 유료. Binance/Bybit 청산 스트림은 무료지만 **웹소켓 상시 수신 필요 → Vercel 서버리스 불가**. 급변 캔들 감지 + 오더북 스냅샷이 무료 대안
- ❌ **온체인 고래·거래소 유입출** — CryptoQuant·Glassnode 유료
- ❌ Bitget 카피트레이딩(trace 권한) · WebSocket(서버리스) · Place-Order(안전상 의도적 제외)
- ❌ 토스증권 API(공개 API 없음) · KRX MDC 공개엔드포인트(anti-bot LOGOUT 차단)
- ❌ **청산가 정확 계산** — 거래소 티어·수수료별로 달라 MMR 0.5% 가정 근사만. UI에 "주문 전 거래소 확인" 고지
- ❌ **이벤트(CPI·FOMC) 방향 예측** — 기술적 분석으로 못 맞힌다. 12h 진입 차단으로만 대응
- ❌ **서버 푸시 알림(탭 닫아도 오는)** — 웹소켓/크론+텔레그램 필요. 현재 알림은 페이지가 열린 상태에서만 동작
- ❌ **성장주 점수의 백테스트** — 과거 시점 **컨센서스**를 구할 방법이 없다(네이버는 현재 추정치만 제공). 점수의 예측력 검증은 구조적으로 불가 → 지표 품질과 정직한 라벨링으로만 대응
- ❌ **펀딩 전략 추가 검증** — Bitget 펀딩 히스토리가 **270건(90일)이 상한**이라 다른 국면을 볼 수 없다. 더 긴 히스토리를 주는 소스가 없으면 이 데이터로는 결론을 못 바꾼다
- ✅→❌ **정정: "백테스트에 파생 신호 반영 불가"는 틀린 전제였다** — 이전 문서에 "파생은 스냅샷이라 과거 데이터 없음"으로 적혀 있었으나, **공개 히스토리 API로 재현 가능**함을 2026-08-07 확인(OKX rubik 1H 30일, Bitget 펀딩 90일). 실제로 `scripts/backtest-deriv.ts`로 A/B를 돌렸다. **단 5분 단위는 2일치뿐**이라 라이브(30분 테이커 비율)를 정확히 복제하려면 여전히 해상도가 부족하다

---

## 11. 디렉토리 구조

```
kospi-lab/
├── middleware.ts             # 인증 게이트 (matcher 5개 — §6)
├── PROJECT_STATUS.md · CHANGELOG.md · COMPLETENESS.md   # 기록 문서 3종
├── tests/engine.test.ts      # 회귀 35케이스 (npm test)
├── scripts/                  # 9 — 측정·검증 전용, 앱 배포와 무관
│   ├── backtest-lab.ts · backtest-deriv.ts · backtest-funding.ts
│   ├── validate-funding.ts · measure-backtest-bias.ts
│   └── verify-macro.ts · verify-growth.ts · verify-growth-us.ts · generate-icons.js
├── app/
│   ├── api/                  # 39 routes
│   │   ├── stock-analysis/ · coin-analysis/   # ★ 게이트 + icn1
│   │   ├── growth-scan/      # 🆕 유니버스·배치·시장환경 3-모드
│   │   ├── coin-scan/ · portfolio-verdicts/ · unlock/
│   │   └── krx · stock · crypto · futures · bitget · kis · dart · market · ...
│   ├── stock-analysis/ · coin-analysis/ · growth/   # ★ 분석 페이지 (+layout = metadata)
│   ├── error.tsx · not-found.tsx · global-error.tsx · robots.ts · sitemap.ts
│   └── *.tsx                 # 24 pages (page.tsx = 홈)
├── components/               # 19 — CandidateBoard🆕 · UnlockGate · LivePriceTag · ...
├── hooks/                    # 11 — useCandidates🆕(v1 스키마) · useCoinJournal · usePortfolio · ...
├── lib/                      # 27
│   ├── coinAnalysis.ts       # ★ 코인 엔진
│   ├── positionSizing.ts     # 돈 계산 (테스트로 고정)
│   ├── growthScreener.ts · usGrowth.ts · marketEnvironment.ts   # 🆕 성장주
│   ├── yahooFinance.ts · fetcher.ts                              # 🆕 공용
│   └── stockAnalysis · (stock|coin)Backtest · krx · kis · bitget · dartClient · ...
├── public/guide.html · manifest.json · icon-192.png · icon-512.png
└── .env.local                # gitignore (14개 키 — §6)
```
