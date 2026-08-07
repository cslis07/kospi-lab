# KOSPI LAB — Project Status

> 마지막 업데이트: 2026-07-23 (커밋 2026-07-26)
> 위치: `C:\Users\GB\Documents\kospi-lab`
> GitHub: `cslis07/kospi-lab` · 기본 브랜치 `main`
> 배포: [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel (git push → 자동 배포)
> 규모: API 라우트 39 · 페이지 23 · lib 22 · hooks 10 · components 18 · tests 1(15케이스)

---

## 0. 지금 하던 일 (WIP)

**전체 점검 1차 + 엔진 수정 + 성장주 발굴 추가 완료** — 마지막 커밋 `9114fa1`(성장주 발굴). 배포·검증 완료(테스트 27/27, tsc 0, build OK, 프로덕션 실측).

- 🆕 **성장주·기대주 발굴 `/growth`** (2026-08-06, 5차까지) — 한국(KRX 시총 상위)+**미국(큐레이션 141종목,
  GICS 11섹터 × 테마 17종 카테고리 + 종목 직접 검색으로 유니버스 밖 종목도 스캔)**.
  🆕 **후보 파이프라인** — ☆로 담아 `useCandidates`(스키마 v1 래핑)에 저장 → 페이지 최상단
  **후보 보드**에서 재무(성장 60점↑) × 타이밍(수급·추세 10점↑) 사분면. 타이밍은 `/api/portfolio-verdicts`
  재사용(AI·게이트 없음, 10분 캐시). ⚠ 경량 판정은 정밀 분석의 가점 ~18점을 안 쓰므로
  `stance==='buy'`(≥30)를 그대로 쓰면 안 된다 — 그래서 축 문턱이 10이다. 미국은 타이밍 축 미적용
  배치 스캔, 확정 성장 35·컨센서스 기대 30·수익성 15·밸류 20 = 100점. 네이버 finance/annual 의 **컨센서스 연도**
  (매출·영업이익·EPS·PER=포워드PER)를 처음 활용. **시장 환경 패널**(VIX·미국채10y·WTI·달러인덱스·기준금리,
  FRED/ECOS 기존 키, `mode=environment`) + **버핏 체크 7항목** + **룰 기반 추천 코멘트**(강점+주의점) + 상위 추천 5.
  배지(고성장·기대주·턴어라운드·저평가성장(PEG<1)), `?ticker=` 딥링크로 정밀 분석 연결.
  ⚠ PEG 는 기준 EPS 흑자일 때만(적자 베이스 성장률 금지). ⚠ Yahoo 는 로컬 Node 에서 HeadersOverflow 로 검증 불가 —
  **프로덕션에서만 검증 가능**(Vercel 은 정상). 기록 문서 2종(CHANGELOG·COMPLETENESS) 운영 시작.

### 🔴 사용자가 직접 해야 할 것 (미완)
- **KRX API 키 재발급** — `data.krx.co.kr`. 하드코딩 폴백이 **public 저장소**에 커밋돼 있었고(`3876676`), 키가 살아 있음을 실측 확인. 코드에서는 제거했으나 **git 이력에 남아 있어 재발급 외에는 방법이 없음.** 재발급 후 `vercel env add KRX_API_KEY production` + `.env.local` 갱신.
- **분석 페이지 잠금 해제** — `/api/stock-analysis`·`/api/coin-analysis`를 게이트에 넣었으므로, 브라우저에 `kl_auth` 쿠키가 없으면 분석이 401. `/bitget`에서 토큰 1회 입력하면 1년 유지(§6).

### 🔬 엔진 엣지 측정 결과 (2026-08-07 · 반드시 먼저 읽을 것)

**현재 추세추종 진입 신호에는 측정 가능한 엣지가 없다.** 독립적인 두 실험이 같은 결론:

| 실험 | 표본 | 결과 |
|---|---|---|
| 가격 기술적 지표만 | 45일·4코인·727건 | 승률 **49.7%** (±1.9%p), 기대값 -0.006R |
| 파생 수급 포함(테이커·OI·롱숏) | 28일·4코인·407건 | 승률 **48.4%** (±2.5%p), 차이 -1.1%p로 오차범위 안 |

- 1R 손절·1R 익절의 손익분기가 50%. **왕복 수수료 0.12%가 손절폭 0.2% 기준 1R의 60%**를 먹으므로 실제로는 확실히 마이너스. 손절폭을 1%로 넓히면 필요 승률이 80%→56%로 떨어지지만, **엣지가 0이면 수수료를 줄여도 0에 수렴할 뿐 넘지 못한다**
- 측정 도구: `scripts/backtest-lab.ts`(가격), `scripts/backtest-deriv.ts`(파생 A/B), `scripts/measure-backtest-bias.ts`(편향). 전부 미래참조 차단
- ⚠ **"파생은 스냅샷이라 백테스트 불가"는 틀린 전제였다** — 공개 히스토리 API로 재현 가능(OKX rubik 1H 30일, Bitget 펀딩 90일). 다만 5분 단위는 2일치뿐

**❌ 펀딩 극단 되돌림 = 검증 실패, 하락장 베타로 판명** — `scripts/validate-funding.ts`

1차 실험(4코인·n=196)에서 16h 보유 +0.461%(t=3.62)로 유망해 보였으나, **19종목·6단계 본검증에서 탈락**했다.

| 검증 | 결과(24h·손절3%·2168건) | 판정 |
|---|---|---|
| V1 전체 표본 | +0.366% (t=5.26) | ✅ |
| **V2 후반 45일(OOS)** | **+0.104% (t=1.33)** | ❌ 전반(+0.653%, t=5.58) 대비 6배 약화 |
| V3 종목 일관성 | 13/19 양수 | ✅ |
| V4 손절 내성 | +0.205% (t=3.36) | ✅ |
| **V5 롱·숏 대칭성** | **롱 -0.228%** (숏 +0.490%) | ❌ 한쪽에서만 나옴 |
| **V6 대조군: 항상 숏** | **+0.222% (t=5.02)** | ❌ 이 90일은 숏이 그냥 벌리는 구간 |

→ **3/6 통과. 16h/2% 설정에선 2/6.** 파라미터를 바꿔 통과 조합을 찾은 것에 가깝다.

- 전략의 **83%가 숏 진입**인데 하필 대조군에서 "항상 숏"이 유의하게 벌리는 기간이었다 → 수익의 상당 부분이 펀딩 엣지가 아니라 **하락장 베타**
- 진짜 펀딩 쏠림 효과라면 롱·숏 양쪽에서 나와야 하는데 롱은 음수
- ⚠️ **실투자 금지.** 90일 단일 국면이 상한(펀딩 히스토리 270건 제한)이라 이 데이터로는 더 검증할 수 없다

**결론: 현재까지 이 앱에서 측정 가능한 엣지는 어디에도 없다.** 도구의 가치는 진입 신호가 아니라 손절 강제·사이징·기록에 있다.

**➡️ 이에 따라 도구 위치를 재정의했다(2026-08-07 · `1054f57`).** 이 앱은 **투자 리스크 관리 대시보드**이며 매매 신호를 제공하지 않는다.
- 사이트 제목·설명, 내비 문구, 홈 첫 화면 안내, 전역 푸터, 코인 분석 상단 배너에 모두 반영
- **AI 브리핑 프롬프트에서 방향 추천을 제거**했다 — 코인 `【진입 관점】 롱/숏/관망`과 주식 `【종합 판단】 매수우위/…`를 `【리스크 점검】`(무효화 조건·손절 위치·최악 시나리오)으로 교체하고, "진입을 추천하지 말 것"을 규칙으로 명시. 배포본 실측에서 추천성 표현 0건
- ⚠️ 앞으로 기능을 추가할 때 **"이게 진입 신호처럼 읽히는가"를 먼저 볼 것.** 읽힌다면 근거(측정된 엣지)가 있어야 하고, 없으면 리스크 관점으로 바꿔 표현한다
- `매수우위/중립/비중축소` 라벨은 유지 — 룰 엔진 점수의 서술이고 매매일지·포트폴리오 배지에 저장·사용된다. 라벨 변경 대신 배너·툴팁으로 맥락을 잡았다

**UI 반영 완료** — 코인·주식 분석의 백테스트 카드에 "엣지 미검증" 명시, `entryOk` 배지를 초록 `✓ 진입 조건 충족` → 파랑 `체크리스트 통과 (우위 아님)`로 변경.

### 🟡 엔진 감사 잔여 (미착수 — 표시·정확도 계열, 진입 판정 자체는 오염 안 됨)
- **H-2 백테스트 lookahead** — `coinBacktest.sliceUpTo`가 봉 '시작'시각으로 잘라 1H 지표가 평균 27.6분(최대 50분) 미래를 봄. 성적표가 실제보다 낙관적. 같은 함수의 `vwapCalc`는 서버 현재시각 기준이라 백테스트 샘플의 81%에서 VWAP ±6점이 미적용(백테스트와 실전이 다른 룰)
- **M-1 수급 결측 회귀의 남은 구멍** — `!!supply`는 null만 막는다. 3일 이상 있고 값이 전부 0이면 통과. `dataDays` 추가 필요
- **M-2 숏 손절률을 UI가 "−"로 표시** (`page.tsx` 손절 줄, 부호 하드코딩). 같은 패널 청산가는 올바르게 `{isShort ? '+' : '-'}`
- **M-4 `confidence`가 차단 게이트 미반영** — 이벤트 임박·역추세인데 "🟢 견고 95%"와 "진입 대기"가 동시 표시
- **M-5 펀딩 회피가 정산 직후 통과** — `minToFunding >= 0` 이라 과거 타임스탬프면 게이트 열림. `>= -5`로
- **M-6 `ema200` 시드 코드가 죽어 있음** — `i===0`에서 덮어써 200봉 기준 첫 종가 가중치 13.67%. 추세 지속 방향으로 편향
- **M-7 `trigger`가 방향을 기억하지 않음** — 표시·근거만 오염(진입 판정 오염은 재현 안 됨)
- **M-8 매매일지 R 회계 불일치** — 자동판정 win=1R vs 수동 익절=1.5R
- 기능 공백(별도): 저널의 레버리지가 실제 사용 배율이 아님(엔진 권장값 저장), Bitget 연동이 현물 전용이라 선물 포지션·총자산 누락, 스키마 버전/마이그레이션 0건, 저널 100건 초과분 무통보 폐기

### 이번 세션에 고친 것 (`24ee41c`, `19d3977`)
① 보안 3건(키 폴백 제거·게이트 확대·죽은 `/api/kis/token` 삭제) ② 지표 계산 2건(CPI YoY 13개월→12개월 3.73%→3.46%, 가계부채 2025Q1→2026Q1·QoQ 복구) ③ 기록 안전망(백업이 접두사 전체를 담도록 v2, `/virtual` 내비 노출, 삭제 확인) ④ 분석 실패 가시화(`lib/fetcher.ts` + 두 페이지 에러 배너) ⑤ 엔진 6건 — C-1 분할매수 손절 이탈, H-4 증거금 초과 경고, H-3 목표가 역전·rr 실계산, H-6 target1 Infinity, H-5 백테스트 신호 0건, signalGrade가 entryOk 별칭이던 문제.

**라이브 검증 완료**: 4코인 분할매수 지정가 전부 손절 안쪽(이전 3/4가 밖), `rr` 1.77/1.50/4.21/1.50(이전 상수 1.5), XRP에서 증거금 시드초과 경고 실제 발화.

⚠️ **동작 변화 1건** — `entryOk=false`일 때 권장 배율이 대략 절반이 된다(gateFactor 0.5). 진입조건을 충족한 경우(`entryOk=true`)는 이전과 **완전히 동일**하다(entryOk는 |score|≥45를 요구하므로 항상 '중' 이상 등급).

⚠️ 교훈(이번 세션): 프로덕션 API를 조회할 때 **`indicators[].value`가 아니라 `.macro`** 를 봐야 한다. 잘못된 필드를 보고 "지표 3종 결손"으로 오진할 뻔했다(실제로는 정상). 응답 스키마를 먼저 확인할 것.

- 최근 작업 2건: ① **코인 진입 분석 강화**(레짐·진입자리·오더북·진입 플랜·안정성·분할매수·문턱 ±20) ② **완성도 7축 개선**(테스트 15개·에러 바운더리·SEO·접근성·성능·법적·실현손익).
- **다음 채팅이 가장 먼저 볼 것:** 사용자가 코인 선물로 **실투자 중**. "계속 관망만 나온다"는 피드백으로 방향 문턱을 ±30→±20으로 낮춤(`adcc509`). 며칠 써보고 **신호가 너무 자주/드물게 뜨는지 재조정** 필요할 수 있음 — 문턱(±20)이나 1H 가중치가 후보. 데이터 보며 튜닝할 항목이라 미완이 아니라 **관찰 대기**.
- ⚠️ 교훈(지난 세션): USDT pill이 커밋 전 localhost 빌드에서만 보여 "이미 프로덕션 반영"으로 오판할 뻔함. **UI 확인은 반드시 프로덕션 URL로**(§9).
- 세션 정리: 주식 그룹에서 `260707_주식`·`Stock session status check` 2건 아카이브, 현재 세션(`260710_주식`)만 유지.

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
- 🆕 **성장주 발굴 `/growth`** — KRX 시총 상위 스캔 → 성장·컨센서스·PEG 점수화(`lib/growthScreener.ts` + `/api/growth-scan`, icn1). 유니버스 1콜 + 15종목/배치·동시6·12h 캐시
- 버핏 스크리너 `/screener` · KRX 시장 `/krx` · 뉴스 `/news` · 공시 `/dart` · 리포트 `/report` · 캘린더 `/calendar` · 커뮤니티 `/community`(스텁) · 가상투자·백업 `/virtual`

### 시장 · 내 자산 · 설계
- `/domestic` · `/overseas` · `/my-stocks` · `/futures`
- **통합 자산 `/portfolio`** — **신호 보기**(보유 종목 매수우위/중립/비중축소 배지+손절 부근 경고) · 비트겟 `/bitget`(🆕 잠금 해제 폼)
- 투자설계 `/invest` · 세제혜택 `/tax` · 증권사비교 `/brokerage` · 시뮬레이션 `/simulate`

### 공통
- **홈 분석 섹션에 국내주식·코인선물 분석 카드** · 글로벌 검색(⌘K) · 환율 pill(USD/USDT/JPY) · 다크/라이트 · 모바일 · `/guide.html`
- **AI 브리핑 모델 선택**(Haiku 4.5 / Sonnet 5 기본 / Opus 4.8) — localStorage 저장
- 🆕 **에러 복구 UI**(라우트 크래시·404·루트 크래시) · **SEO**(robots·sitemap·페이지별 title) · **글로벌 면책 footer**(원금 초과 손실 고지)

---

## 3. 수정한 주요 파일

### 최근 세션 신규 (~2026-07-23)
| 파일 | 역할 |
|---|---|
| `tests/engine.test.ts` | 🆕 **머니매스 회귀 테스트 15개** — 노션·청산가·안전배수·분할매수 보존, 손절/목표 1R, 레버리지 공식, 진입자리·역추세·이벤트 게이트, 수급 결측 회귀. `npm test`(tsx) |
| `lib/positionSizing.ts` | 🆕 돈 계산 순수 함수(`notionForRisk`·`isolatedLiqPrice`·`liqSafety`·`tranches3`) — RiskPanel UI와 테스트가 **같은 코드** 사용 |
| `app/error.tsx` · `not-found.tsx` · `global-error.tsx` | 🆕 크래시 시 흰 화면 대신 복구 UI (외부 API 이상 형태 대비) |
| `app/robots.ts` · `app/sitemap.ts` | 🆕 `/api`·`/bitget` 색인 제외, 사이트맵 |
| `app/stock-analysis/layout.tsx` · `app/coin-analysis/layout.tsx` | 🆕 페이지별 metadata(title 템플릿 `%s \| KOSPI LAB`) |
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
| `app/layout.tsx` | metadataBase·title 템플릿, footer에 **투자 면책+원금 초과 손실** 고지 |
| `components/StockDetailModal.tsx` | 접근성 — `role=dialog`·`aria-modal`·ESC 닫기·닫기 버튼 라벨 |
| `hooks/useCoinJournal.ts` | `realizedUsdt` 필드 + 실현손익 합계 통계(엔진 판정 vs 실제 성적) |
| 분석 2페이지 | 차트를 `next/dynamic(ssr:false)`로 지연 로딩(Recharts 초기 번들 제외) |

### 분석 엔진·기존 라이브러리 (`lib/`)
`stockAnalysis`·`stockBacktest`·`coinAnalysis`·`coinBacktest`·`marketReference`·`macroIndicators`·`krx`·`kis`·`kisFinance`·`bitget`·`dartClient`·`calendarEvents`·`naverFinance`·`naver`·`stockList`·`krStocks`·`indicators`·`types`·`anthropic`·`rateLimit`

---

## 4. 남은 작업

### 우선순위 높음
- [ ] **방향 문턱 ±20 실사용 재조정** — 실투자 피드백 반영. 너무 자주/드물면 문턱·1H 가중치 튜닝. 데이터 관찰 대기라 미착수(§0)

### 개선 여지
- [ ] **DART 공시 목록 정렬** — 정기 신고 다수 노출, 원본 순서 그대로(`slice(0,12)`), 우선순위 로직 미구현
- [ ] **`app/api/debug/naver` 제거 검토** — 디버그용이 프로덕션에 열려 있음(§9). 네이버 응답 확인용이라 아직 유지 중
- [ ] **가계부채 데이터 지연** — ECOS 가계신용은 분기 데이터(외부 한계, 표시로만 대응)
- [ ] 해외/코인 portfolio 수기 입력 — 통합자산은 국내주식+Bitget만
- [ ] DART 배당 `payoutRatio` 서브필드 매칭 · 스크리너 FCF(KIS 미제공)

### 완성도 잔여(구조적, 우선순위 낮음)
- [ ] **API 라우트·UI 통합 테스트** — 엔진·사이징은 15개로 고정됨. 외부 API 모킹 비용 대비 가치가 낮아 미착수
- [ ] **서버 컴포넌트 전환** — 23개 페이지 전부 `'use client'`. 전면 리팩터링이라 범위 밖
- [ ] **모달 포커스 트랩** — `role=dialog`+ESC까지는 적용. 단일 사용자 도구라 우선순위 낮음

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

### 최근 세션 (~2026-07-23)
| 증상 | 원인 | 해결 |
|---|---|---|
| "계속 관망만 나온다"(실투자 피드백) | 방향 문턱 ±30 + 1H 확인형이라 굼뜸 | 문턱 ±30→±20, 약한 우위도 방향 표시, 관망도 기울기 바 표시. entryOk(45)는 유지. 약한 건 안정성 '약함' 라벨 |
| 돈 계산(레버리지·청산가·사이징)에 안전망 없음 | 검증을 매번 임시 스크립트로 하고 버림 — 회귀 테스트 0개 | `lib/positionSizing.ts`로 순수 함수 추출 + `tests/engine.test.ts` 15케이스. 커밋 전 `npm test` 필수(§5) |
| 테스트 tsc 실패 `InvestorDay.close 누락` | 테스트 픽스처가 필수 필드 누락 | 픽스처에 `close` 추가 — **tsc가 tests/도 검사**하므로 테스트 파일도 타입 통과 필요 |
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

- **시크릿에 하드코딩 폴백(`process.env.X ?? '실제값'`)을 절대 쓰지 말 것** — 이 저장소는 **public**이다. KRX 키가 이 패턴으로 유출됐다. 키가 없으면 빈 문자열 + graceful 실패(`lib/krx.ts` 패턴).
- **`/api/kis/:path*` 를 통째로 게이트에 넣지 말 것** — `/api/kis/price`는 `StockDetailModal`이 쓴다.
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
├── tests/engine.test.ts      # 🆕 머니매스 회귀 15케이스 (npm test)
├── app/
│   ├── error.tsx · not-found.tsx · global-error.tsx   # 🆕 크래시 복구 UI
│   ├── robots.ts · sitemap.ts                          # 🆕 SEO
│   ├── api/                  # 39 routes
│   │   ├── stock-analysis/   # ★ 주식 분석 (icn1)
│   │   ├── coin-analysis/    # ★ 코인 분석 (icn1) — 레짐·오더북·진입플랜·안정성
│   │   ├── coin-scan/        # 4코인 일괄 스캔
│   │   ├── portfolio-verdicts/ # 보유 종목 판정
│   │   ├── unlock/           # 인증 쿠키 발급(GET/POST)
│   │   └── krx · stock · crypto · futures · bitget · kis · dart · market · ...
│   ├── stock-analysis/ · coin-analysis/   # ★ 분석 페이지 (+layout.tsx = metadata)
│   └── *.tsx                 # 23 pages (page.tsx = 홈, 분석 카드)
├── components/               # 18 — UnlockGate · LivePriceTag · BriefingModelPicker · CoinCandleChart · Header · NavTabs · ...
├── hooks/                    # 10 — useStockJournal · useBriefingModel · useCoinJournal · useCoinAlerts · usePortfolio · ...
├── lib/                      # 22 — coinAnalysis(★엔진) · positionSizing🆕(돈 계산, 테스트로 고정) · stockAnalysis · (stock/coin)Backtest · anthropic · rateLimit · marketReference · macroIndicators · krx · kis · kisFinance · bitget · ...
├── public/guide.html · manifest.json
├── .env.local                # gitignore (APP_ACCESS_TOKEN·KRX·KIS·DART·BITGET·ANTHROPIC·ECOS·FRED·CUSTOMS)
└── PROJECT_STATUS.md
```
