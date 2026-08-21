# KOSPI LAB — Project Status

> **마지막 업데이트: 2026-08-21 (6차)**
> **위치:** `C:\Users\GB\Documents\kospi-lab`
> **GitHub:** `cslis07/kospi-lab` · 기본 브랜치 `main` · ⚠️ **저장소 공개(public)**
> **배포:** [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel (git push → 자동 배포)
> **규모:** API 라우트 44 · 페이지 25 · lib 32 · hooks 11 · components 26 · scripts 11 · tests 1(42케이스)

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — 워킹트리 비어 있음(루트에 핸드오프 PDF 1개만 미추적, 커밋 대상 아님). `main`이 `origin/main`과 동기. 게이트 전부 통과(테스트 42/42 · tsc 0 · build OK · 프로덕션 실측).

⚠️ **로컬 HEAD가 크론 봇 커밋일 수 있다** — `.github/workflows/coin-track.yml`(15분 크론)이 `data/coin-signals.json`을 갱신·push하므로 최근 커밋이 `kospi-lab-bot [TRACK] ...`일 수 있다. 내 코드 마지막 커밋은 3모드 엣지 측정·UI 정렬(2026-08-21 5차). **push 전 반드시 `git fetch && git rebase origin/main`**(§9).

### 🔴 사용자가 직접 해야 할 것 (미완, 코드로 해결 불가)
- **KRX API 키 재발급** — `data.krx.co.kr`. 하드코딩 폴백이 **public 저장소**에 커밋돼 있었고(`3876676`), 실측으로 **키가 아직 유효함**을 확인했다. 코드에서는 제거(`24ee41c`)했으나 **git 이력에 남아 있어 재발급 외에 방법이 없다.** 재발급 후 `vercel env add KRX_API_KEY production` + `.env.local` 갱신.
- **분석 페이지 잠금 해제(브라우저 1회)** — `/api/stock-analysis`·`/api/coin-analysis`가 게이트라 `kl_auth` 쿠키 없으면 401. `/bitget`에서 토큰 1회 입력(§6). (코인 3모드 신호·시장환경 등은 공개 라우트라 게이트 무관)
- **Bitget 키에 선물 읽기 권한 추가** — `/api/bitget/positions`가 `40014: need future pos read`로 실패(프로덕션 실측). 현재 키가 현물 전용. Bitget API 관리에서 **선물 포지션 읽기(Futures/Position - Read)** 추가(읽기 전용 유지)하면 `/bitget`에 실제 청산가·미실현손익 표시. 라우트·서명은 정상.
- **텔레그램 알림 켜기** — GitHub 저장소 Secrets에 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` 추가([Secrets 위치](https://github.com/cslis07/kospi-lab/settings/secrets/actions)). CHAT_ID=`8710847228`. 봇 토큰은 BotFather 또는 coin-signal 저장소 Secrets에서 확인(보안상 문서 미기재). 없으면 크론은 스냅샷만 갱신하고 알림은 조용히 건너뛴다.

### 다음 채팅이 가장 먼저 할 한 가지
**코인 엔진 정리 — ✅ 측정·정렬 완료(2026-08-21 5차).** 3모드 엔진을 `scripts/backtest-modes.ts`로 측정(45일·4코인·81신호·**승률 41.7%**)한 결과 옛 엔진(49.7%)과 같은 **무엣지** 판정 → 방향 **(b) 리스크 프레이밍 통일** 확정. 3모드 UI(ModesSection)의 `TRADE=진입`(초록불)·`ULTRA=최상급` 프레이밍을 옛 엔진과 같은 정직성 기준(체크리스트·미검증 41.7% 명시)으로 정렬함.
**남은 결정(사용자 몫):** 두 엔진을 코드 레벨에서 하나로 은퇴시킬지 여부. 현재는 둘 다 무엣지 상보 뷰로 유지 중(옛=심화 리스크패널/백테스트/AI, 3모드=즉시 다타임프레임 구조). 실제 삭제는 작동 기능 손실이라 사용자 승인 후.

### 🔬 엔진 엣지 측정 결과 (2026-08-07 · 이 프로젝트의 가장 중요한 사실)

**측정 가능한 엣지가 어디에도 없다.** 독립적인 세 실험이 같은 결론:

| 실험 | 표본 | 결과 | 스크립트 |
|---|---|---|---|
| 추세추종 — 가격 지표만 | 45일·4코인·727건 | 승률 **49.7%** (±1.9%p), 기대값 −0.006R | `scripts/backtest-lab.ts` |
| 추세추종 — 파생 수급 포함 | 28일·4코인·407건 | 승률 **48.4%** (±2.5%p), 차이 −1.1%p로 오차범위 안 | `scripts/backtest-deriv.ts` |
| 펀딩 극단 되돌림 | 89일·19종목·2,168건 | **3/6 통과** → 하락장 베타로 판명 | `scripts/validate-funding.ts` |
| 3모드 진입엔진(이관) | 45일·4코인·81신호 | 승률 **41.7%** (±5.9%p), 기대값 −0.167R | `scripts/backtest-modes.ts` |

- 손익분기 승률 50%(1R:1R). **왕복 수수료 0.12%가 손절폭 0.2% 기준 1R의 60%**를 먹어 실제로는 마이너스. 손절폭 1%로 넓히면 필요 승률 80%→56%지만, **엣지 0이면 수수료를 줄여도 0에 수렴할 뿐 못 넘는다.**
- **펀딩 전략 탈락 결정타**: 대조군에서 **펀딩 무관하게 항상 숏만 쳐도 +0.222%(t=5.02)**. 전략의 83%가 숏이라 수익 상당분이 하락장 베타, 롱은 음수(−0.228%), 후반 45일 6배 약화, 파라미터 민감(16h/2%는 2/6). **실투자 금지.**
- ✅ **`lib/coinSignalModes.ts`(3모드)도 이제 측정됨(2026-08-21 5차)** — 45일·4코인·81신호 **승률 41.7%**(scalp 46.6%/swing 27.3%/position 0%·n=3), 기대값 −0.167R(대칭1R)·−0.530R(수수료 반영). EQ 80~100만 66.7%지만 n=6이라 근거 불가(과적합). **옛 엔진과 같은 무엣지.** "정교해 보임"은 측정된 우위가 아니었다(`scripts/backtest-modes.ts`).

**➡️ 도구 위치 재정의(`1054f57`)** — 사이트 제목·설명, 내비, 홈 안내, 푸터, `entryOk` 배지(초록`✓ 진입조건` → 파랑`체크리스트 통과(우위 아님)`)에 반영. AI 프롬프트도 방향 추천 제거(`【진입 관점】` → `【리스크 점검】`, 추천성 표현 0건 실측). ✅ **이관된 3모드 UI도 재정의와 정렬 완료(2026-08-21 5차)** — TRADE 초록불 제거(sky 톤)·`진입`→`체크리스트 통과`·`ULTRA 최상급`→`다수조건 충족(우위 아님)`·미검증(41.7%) 문구 명시.

### 🟡 엔진 감사 잔여 (미착수 — 표시·정확도 계열)
- **M-7 `trigger`가 방향을 기억하지 않음** — 표시·근거만 오염(진입 판정 오염은 재현 안 됨)
- **M-8 매매일지 R 회계 불일치** — 자동판정 win=1R vs 수동 익절=1.5R
- 기능 공백: 기존 훅들은 스키마 버전 없음(신규 `useCandidates`만 v1 래핑)

**감사 처리 현황** — H-2 lookahead·vwap·M-6 ema200(1차), M-1·M-2·M-4·M-5(3차) 완료. 저널 레버리지 실사용값·저널 100→1000·Bitget 선물 연동도 처리.

---

## 1. 프로젝트 목적

**국내·해외 주식 + 코인 + 선물 통합 투자 리스크 관리 대시보드.** 방향 판단은 사용자가 하고, 앱은 **손절·사이징·청산가·기록**을 맡는다. **코인 작업의 정본**은 이 앱이다(2026-08-21 coin-signal 앱을 이관·은퇴시킴 — §2).

**최근 방향성:**
- **2026-08-07 전환** — "지금 사도 되는가"에서 "얼마나 걸고 어디서 끊을 것인가"로. 대규모 백테스트에서 엣지가 없어(§0) 신호 생성기 역할을 공식적으로 내려놨다.
- **2026-08-21 coin-signal 통합** — 은퇴한 coin-signal 앱(coin-signal-rouge.vercel.app)의 코인 선물 기능 5종(3모드 진입엔진·ETF·텔레그램/적중률·온체인 고래·실시간 청산)을 이관. 커밋 `230ae6e`~`f8f196a`. **이관 시점 프레이밍(3모드 진입 신호)과 리스크 도구 재정의가 아직 미정렬**(§0 다음 과제).

- ⚠️ **정직성 원칙(코드에 안 적힌 맥락):** 못 하는 것을 할 수 있는 것처럼 표시하지 않는다. 측정 안 한 것은 "미검증"으로 쓴다.
- 스택: Next.js 16 App Router · React 19 · TypeScript · Tailwind · Recharts · SWR
- 로그인 없음(보유·관심·매매일지·후보는 localStorage). **단, 민감 라우트는 토큰 게이트**(§6)
- Bitget만 API 키로 본인 계좌 조회(읽기 전용)

---

## 2. 현재 구현된 기능

### 🏠 홈 대시보드 `/` (2026-08-21 재구성)
데이터 중심 홈. **주식 섹션**(코스피·코스닥·코스피200·나스닥 지수 카드, `IndexCards`) + **코인 섹션**(시장환경 그리드 + 현물 ETF 순유입, `CoinDashboard`). **모바일은 최상단에 앱 런처형 아이콘 그리드 홈메뉴**(`HomeMenu`·`md:hidden` · 아이쑥쑥·약보듬 방식, 2026-08-21 6차), 데스크탑은 하단 빠른이동 카드(`hidden md:block`). 헤더 로고는 홈 링크.
- **시장환경 그리드** — 미국채 10Y/2Y/30Y·Brent·달러인덱스·USDT/KRW·김치프리미엄(평균)·공포탐욕·다음 FOMC. 무키 소스(FRED·업비트·Bitget·alternative.me·calendarEvents), `/api/coin-env`(공개·icn1·5분 캐시)

### 🔬 분석
**코인선물 분석 `/coin-analysis`** (BTC·ETH·XRP·SOL) — ⚠ **엔진 2개 병존**:
- **3모드 진입엔진**(`lib/coinSignalModes.ts` · `/api/coin-signal` 경량·즉시 로딩 45초): SCALP/SWING/POSITION, Direction·Entry Quality·Confidence·Event Risk → TRADE/WATCH/NO_TRADE/PAUSED/ULTRA. 추격 감쇠(진입존을 방향대로 0.5ATR 초과 시 Entry 곱셈 감소). ⚠ 엣지 미측정
- **기존 룰 엔진**(`lib/coinAnalysis.ts` · `/api/coin-analysis` 게이트·무거움): 다중TF·파생수급·레짐필터·리스크 패널(청산가·분할매수)·백테스트·AI 브리핑. **"분석" 버튼으로만 실행**
- 실시간 청산(`WhaleLiquidationPanel`, 브라우저 WS Binance→Bybit) · 온체인 고래(`/api/whale`)

**국내주식 분석 `/stock-analysis`** — 버튼 실행 · 룰 엔진(추세+수급±35+재무+공시+정책+CIO+코스피) · 경제지표 패널 · 백테스트 · AI 브리핑 · 판정 기록. `?ticker=` 딥링크.

**매매일지 성적표 `/journal`** — 코인·주식 저널을 시간창별(7/30일/전체) 승률·기대값·R 분포·미실현손익·미청산 비율로 실측(`lib/journalStats.ts` 순수 함수).

**Bitget 선물 포지션 `/bitget`** — 현물 + USDT 선물(mix API): 실제 평단·레버리지·미실현손익·청산가·청산까지 거리, 15% 미만 경고. 읽기 전용.

**성장주 발굴 `/growth`** — 한국(KRX 시총상위)+미국(큐레이션 141종목, GICS 11섹터×테마 17종). 100점 4부문 + 시장환경 패널 + 버핏 체크 7항목 + 후보 보드(재무×타이밍 사분면) + 종목 검색.

**KRX 시장 `/krx`** — 주요지수·전종목 랭킹·ETF 랭킹 **테이블 + 그래프 요약**(`HBarChart`, CSS 막대). 상품(금·유가)도.

**기타** — 버핏 스크리너 `/screener` · 뉴스 `/news` · 공시 `/dart` · 리포트 `/report` · 캘린더 `/calendar` · 커뮤니티 `/community`(스텁) · 가상투자·백업 `/virtual`

### 자동화 (GitHub Actions)
**코인 신호 적중률 + 텔레그램** — `.github/workflows/coin-track.yml`(15분 크론) → `scripts/coinTrack.mts`가 3모드 신호를 직접 계산·스냅샷(`data/coin-signals.json` 커밋)하고 TP/SL 자동판정 + 텔레그램 알림(시크릿 있을 때만).

### 시장 · 내 자산 · 설계
`/domestic` · `/overseas` · `/my-stocks` · `/futures` · `/portfolio` · `/invest` · `/tax` · `/brokerage` · `/simulate`

---

## 3. 수정한 주요 파일

### 🆕 coin-signal 이관 (2026-08-21 · `230ae6e`~`f8f196a`)
| 경로 | 역할 |
|---|---|
| `lib/coinSignalModes.ts` | ★ 3모드 진입엔진(SCALP/SWING/POSITION). 자체 지표(ema/rsi/macd/atr/vwap/pivots)·가중치·상태규칙·추격감쇠 전부 여기. ⚠ 엣지 미측정 |
| `app/api/coin-signal/route.ts` | 경량 3모드 신호(공개·즉시 로딩). 무거운 `/api/coin-analysis`와 분리 |
| `lib/etfFlow.ts` · `app/api/etf/route.ts` | BTC·ETH 현물 ETF 순유입(SoSoValue 무키). 스윙·포지션 신호 etfBias 반영 |
| `lib/whaleTracker.ts` · `app/api/whale/route.ts` | 온체인 고래(BTC blockchain.info · ETH publicnode RPC · XRP XRPL 직스캔). ⚠ BigInt 리터럴 금지(§7) |
| `components/WhaleLiquidationPanel.tsx` | 실시간 청산 — **브라우저** WS(Binance !forceOrder→Bybit). 서버 아님 |
| `scripts/coinTrack.mts` · `.github/workflows/coin-track.yml` | 적중률 크론 + 텔레그램. `data/coin-signals.json` 커밋 |

### 🆕 이번 세션 (2026-08-21 · 홈 대시보드·KRX 그래프)
| 경로 | 역할 |
|---|---|
| `lib/coinDashboard.ts` | 시장환경 집계(국채·Brent·DXY·김프평균·공포탐욕·FOMC). 5분 캐시. 김프 USD쪽은 **Bitget**(바이낸스 IP차단 회피) |
| `app/api/coin-env/route.ts` | 홈 코인 데이터(시장환경+ETF). 공개·icn1·5분 캐시 |
| `components/{MarketEnvGrid,EtfInflow,IndexCards,CoinDashboard}.tsx` | 홈 섹션 컴포넌트 |
| `components/HBarChart.tsx` | 경량 수평막대(magnitude/divergent). KRX 그래프 요약용 |
| `app/api/market/route.ts` | **nasdaq 추가**(Yahoo ^IXIC). ⚠ 심볼 이중인코딩 주의(§7) |
| `app/page.tsx` · `app/krx/page.tsx` | 홈 재구성 · KRX 그래프 요약 삽입 |

### 이전 세션 신규(성장주·측정·리스크) — `lib/{growthScreener,usGrowth,yahooFinance,marketEnvironment,fetcher,journalStats,positionSizing}.ts` · `hooks/useCandidates.ts` · `components/CandidateBoard.tsx` · `app/{growth,journal}/` · `app/api/{growth-scan,coin-env,coin-scan,portfolio-verdicts,bitget/positions}` · `scripts/{backtest-lab,backtest-deriv,backtest-funding,validate-funding,measure-backtest-bias,verify-*}` · `CHANGELOG.md` · `COMPLETENESS.md`

---

## 4. 남은 작업

### 우선순위 높음
- [x] **3모드 엣지 측정 + UI 정렬** — ✅ 완료(2026-08-21 5차). 측정 41.7%→무엣지→리스크 프레이밍 통일(b). `scripts/backtest-modes.ts`
- [ ] **두 엔진 코드 레벨 은퇴 여부(사용자 결정)** — 현재 둘 다 무엣지 상보 뷰로 유지. 하나로 줄이면 기능 손실이라 사용자 승인 필요

### 개선 여지
- [ ] **M-7/M-8** — 표시·정확도 계열이라 진입 판정 오염 없음, 급하지 않음
- [ ] **DXY를 ICE 지수로** — 현재 FRED 광의(118.9), 이미지·관례는 ICE(98.79). **왜 아직?** ICE DXY 무료 소스가 마땅치 않음(Yahoo ^DX-Y.NYB delisted)
- [ ] **`app/api/debug/naver` 제거 검토** — 게이트 뒤(401)로 옮김. 네이버 응답 확인용이라 유지 중
- [ ] **버핏 스크리너 `/screener` 폐지 검토** — 성장주 발굴이 상위호환. 며칠 써보고 접기로 대기
- [ ] 해외/코인 portfolio 수기 입력 · DART 공시 정렬

### 구조적 (우선순위 낮음)
- [ ] 통합 테스트 · 서버 컴포넌트 전환 · 모달 포커스 트랩 · **주식 엔진 엣지 측정**(코인만 측정함, UI엔 "미검증" 표기 완료)

### 확장 여지 (KRX 추가 API — 활용신청·승인 필요)
- [ ] 채권(bon)/파생(drv)/ESG — 미승인 401. data.krx.co.kr 활용신청 후 `lib/krx.ts`

---

## 5. 실행 명령어

```bash
cd C:\Users\GB\Documents\kospi-lab
npm run dev                  # 개발서버 (localhost:3000)
```

### 커밋 전 검증 (반드시 이 순서)
```bash
npm test                     # 1) 회귀 42케이스
npx tsc --noEmit             # 2) 타입체크 (tests/·scripts/ 포함)
npm run build                # 3) 프로덕션 빌드 (lint 포함 — 미사용 변수도 실패)
```

### 배포
```bash
git fetch && git rebase origin/main   # ⚠ 크론이 data를 push하므로 원격이 앞설 수 있다(§9)
git push origin main                  # = Vercel 자동 배포
vercel env ls production
echo "값" | vercel env add KEY_NAME production   # ⚠ env pull 절대 금지(§9)
gh auth switch --user cslis07 && gh auth setup-git   # push 403 시
```

### 측정·검증 스크립트 (실데이터, 앱 배포와 무관)
```bash
npx tsx scripts/backtest-lab.ts 45 BTCUSDT,ETHUSDT   # 대규모 백테스트
npx tsx scripts/validate-funding.ts 24 3             # 펀딩 6단계 검증
npx tsx scripts/verify-macro.ts                      # 경제지표 수집 검증
```

---

## 6. 배포 관련 주의사항

### GitHub 인증
- gh CLI 두 계정: `cslis07`(소유자), `histobio0302-oss`. push 403 시 `gh auth switch --user cslis07`
- ⚠️ **저장소 public.** 시크릿이 코드에 들어가면 즉시 유출(§9)
- ⚠️ **크론이 원격을 앞서게 한다** — `coin-track.yml`이 `data/coin-signals.json`을 15분마다 커밋·push. **push 전 `git fetch && git rebase origin/main`**(봇 커밋은 data만 건드리므로 rebase 안전)

### Vercel 환경변수 (`vercel env ls production` 실측 · 14개)
| 키 | 용도 | 설정된 곳 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 게이트. 미설정 시 프로덕션 503 fail-closed | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX 공식 API | 양쪽 · **재발급 필요(§0)** |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART | Vercel |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기 전용(현물만, 선물권한 추가 필요 §0) | 양쪽 |
| `ANTHROPIC_API_KEY` | AI 브리핑 | Vercel |
| `ECOS_API_KEY` | 한국은행 | 양쪽 |
| `FRED_API_KEY` | 미국 CPI·국채·Brent·DXY·VIX | 양쪽 |
| `CUSTOMS_API_KEY` | 관세청 | 양쪽 |

**GitHub Actions Secrets(Vercel env 아님)** — `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`(크론 알림용, §0). ⚠ env 변경 후 반드시 재배포.

### 🔒 인증 게이트 (`middleware.ts` matcher — 코드 확인)
- 게이트 대상 5개: `/api/bitget/*` · `/api/analyze` · `/api/stock-analysis` · `/api/coin-analysis` · `/api/debug/*`
- **코인 신호·시장환경·ETF·고래는 공개**(`/api/coin-signal`·`/api/coin-env`·`/api/etf`·`/api/whale` 게이트 밖 — 의도됨)
- 잠긴 페이지: 토큰 폼에 `APP_ACCESS_TOKEN` → HttpOnly 쿠키(1년). curl `-H "x-app-token: <토큰>"`

### 리전 고정 (`preferredRegion = 'icn1'`)
`coin-analysis`·`stock-analysis`·`coin-scan`·`portfolio-verdicts`·`growth-scan`·`coin-env` = 서울. **업비트·바이낸스·Bybit가 미국 데이터센터 IP 차단**(김프는 업비트+Bitget). 실시간 청산 WS는 브라우저(한국 IP)라 무관.

### 런타임 제약
- 분석 라우트 `maxDuration=30`. AI 브리핑 25초라 상류 느리면 504 가능
- **Yahoo Finance는 로컬 Node에서 `HeadersOverflowError`** — 프로덕션(Vercel)에서만 검증 가능

---

## 7. 최근 발생한 에러와 해결

### 이번 세션 (2026-08-21)
| 증상 | 원인 | 해결 |
|---|---|---|
| 로컬이 원격보다 4커밋 뒤 | 크론 봇이 `data/coin-signals.json` 갱신·push | `git fetch && git rebase origin/main`(봇 커밋 data만이라 안전) |
| 김치프리미엄 카드 누락 | 바이낸스가 클라우드 IP 차단(icn1도) | USD 기준가를 **Bitget** 공개 티커로(지역 무관) |
| 나스닥 null | `%5EIXIC`를 라우트가 또 `encodeURIComponent` → 이중 인코딩 | 원본 `^IXIC` 전달 |

### coin-signal 이관 함정 (핸드오프 §5)
| 증상 | 원인 | 해결 |
|---|---|---|
| ETF 서버 파싱 불가 | Farside Cloudflare/JS 차단(CoinGlass·blockchair도) | **SoSoValue POST**로 대체 |
| `.mts` 빌드 타입체크 실패 | scripts가 `.ts` 확장자 import | tsconfig `exclude`에 scripts 추가, 크론은 `npx tsx` |
| BigInt 리터럴 에러 | tsconfig target ES2017이라 `10n` 불가 | `BigInt(10)**BigInt(18)` (whaleTracker) |

### 이전 세션 (2026-08-07 측정·정확도)
| 증상 | 원인 | 해결 |
|---|---|---|
| 백테스트 성적 과대 | `sliceUpTo`가 봉 시작시각 → 1H봉 평균 22.6분 미래 | 완결봉만. 승률 +4.0%p 과대였음 |
| ema200이 EMA 아님 | 시드를 `i===0`에서 덮어써 죽음(첫 종가 13.67% 가중) | 워밍업 SMA+EMA |
| 검색 종목명이 티커로 | Yahoo quoteSummary에 `price` 모듈 누락 | 모듈 추가(스크리너도 같은 버그였음) |
| 적자기업이 초저 PEG로 둔갑 | EPS −160→+60을 "137% 성장"으로 | 기준 EPS 흑자일 때만 PEG |

### 이전 세션 (2026-07-27 전체 점검)
| 증상 | 원인 | 해결 |
|---|---|---|
| KRX 키 public 유출 | `process.env.X ?? '실제키'` 폴백 | 폴백 제거(재발급 미완 §0) |
| AI 과금 라우트 무인증 | matcher가 레거시만 커버 | 게이트 확대, 401 실측 |
| 분할매수 3차가 손절 밖 | pullback 존이 EMA20 그대로 | 존 클램프 + tranches3 이중방어 |
| 미국 CPI가 13개월 변화율 | 미공표월(`.`) 필터로 인덱스 밀림 | 날짜 매칭(3.73→3.46%) |

### 기존 (외부 API)
| 증상 | 원인 | 해결 |
|---|---|---|
| OI 히스토리 0행 | Bybit가 데이터센터 IP 전면 차단 | OKX rubik 폴백 |
| 외국인 보유율 None | ECOS `"46.55%"` 문자열 → NaN | `parseFloat(replace(/[%,]/g,''))` |
| 반도체 수출 과대 | 관세청 총계행+상세 이중합산 | 총계행(`hsCd==='-'`)만 |
| 시가총액 1e6 과다 | MKTCAP 백만원 오인 | 원 단위 그대로 |
| KIS EGW00133/02004/00201 | 1분1회/도메인/초당 | 사전토큰+JWT exp / VTS `:29443` / throttle |

---

## 8. API 구조

### 내부 라우트
| 라우트 | 설명 |
|---|---|
| `/api/coin-signal?symbol=` | 🆕 경량 3모드 신호(공개, 즉시). Bitget 캔들만으로 buildModes |
| `/api/coin-env` | 🆕 홈 코인 데이터 — 시장환경+ETF(공개·icn1·5분) |
| `/api/etf?type=us-btc-spot\|us-eth-spot` | 🆕 현물 ETF 순유입(SoSoValue) |
| `/api/whale?chain=btc\|eth\|xrp` | 🆕 온체인 고래 |
| ★ `/api/coin-analysis?symbol=&model=` | 무거운 정밀분석(게이트·icn1·30s). 캔들·펀딩·OI·롱숏·테이커·오더북·심리·백테스트·AI |
| ★ `/api/stock-analysis?ticker=&model=` | 국내주식 정밀분석(게이트·icn1·30s) |
| `/api/growth-scan` | universe/codes/tickers/environment 4-모드(icn1) |
| `/api/market` | 지수(KOSPI·KOSDAQ·KPI200·**NASDAQ**)·환율·USDT/KRW |
| `/api/coin-scan`·`portfolio-verdicts`·`unlock`·`bitget/*`·`krx/*`·`stock/*`·`dart/*`·`kis/price`·`screener`·`news/*` | 기존 |

### 외부 API 특이사항 (⚠ 함정)
| API | 키 | 특이사항 |
|---|---|---|
| **Bitget** | 읽기전용 | IP 화이트리스트 비우기. 캔들 granularity `5m·15m·1H·4H·1D`(소문자 불가), `1D` history 1회 90봉, 펀딩 히스토리 270건(90일) 상한. 공개 티커는 지역 무관(김프 USD쪽에 사용) |
| **SoSoValue** | 불필요 | ETF 순유입 POST `/openapi/v2/etf/historicalInflowChart`, `type:us-btc-spot/us-eth-spot`. Farside/CoinGlass는 차단 |
| **온체인** | 불필요 | BTC blockchain.info(25↑) · ETH publicnode RPC 10블록(100↑) · XRP XRPL+XRPSCAN(10만↑, 자기→자기 AMM 제외). Whale Alert는 유료 라벨(선택) |
| **FRED** | 필요 | 미공표월 `value:"."` → **날짜로 매칭**. 국채 DGS10/2/30, Brent DCOILBRENTEU, DXY DTWEXBGS(광의) |
| **Yahoo** | 불필요 | crumb 인증. 모듈에 `price` 넣어야 종목명. 심볼 `^IXIC`는 **한 번만** encode(라우트에 원본 전달). 로컬 `HeadersOverflowError` |
| **OKX rubik** | 불필요 | OI·롱숏·테이커. 1H는 30일, 5m는 2일뿐 |
| **KRX** | 필요 | API별 "활용신청" 승인 필요(미승인 401). MKTCAP 원 단위(×1e6 금지) |
| **KIS** | 필요 | VTS `:29443`, 토큰 1분1회 throttle |
| **ECOS** | 필요 | 오래된 기간부터 반환(count 작으면 최신 잘림), `"46.55%"` 문자열, 분기 `2025Q1` |
| **네이버 금융** | 불필요 | `finance/annual`이 확정 3개년+컨센서스 1개년(컨센 PER=포워드) |
| **관세청** | 필요 | XML, 1년 이내, `hsCd="-"`가 총계 |
| **Anthropic** | 필요 | 크레딧 소진은 400 `invalid_request_error` |
| 무키 | — | alternative.me(공포탐욕)·업비트(USDT/KRW·김프)·Deribit(DVOL)·CoinGecko(도미넌스)·BLS(CPI 폴백)·Frankfurter(FX) |

---

## 9. ⛔ 하지 말 것

- **시크릿에 하드코딩 폴백(`process.env.X ?? '실제값'`) 금지** — 저장소 public. KRX 키가 이 패턴으로 유출됨. 없으면 빈 문자열 + graceful 실패(`lib/krx.ts`).
- **`git push` 전 반드시 `git fetch && git rebase origin/main`** — 15분 크론이 `data/coin-signals.json`을 push해 원격이 앞선다. 안 하면 non-fast-forward 거부 또는 불필요한 머지 커밋.
- **`vercel env pull` 절대 금지** — 로컬 `.env.local` 로컬 전용 키가 삭제됨. `vercel env add`만.
- **`APP_ACCESS_TOKEN`을 Vercel에서 지우지 말 것** — 게이트 라우트 전부 503(fail-closed).
- **`.env.local` 커밋 금지.** 토큰·키를 로그·응답에 출력 금지.
- **`/api/kis/:path*`를 통째로 게이트에 넣지 말 것** — `/api/kis/price`는 `StockDetailModal`이 쓴다.
- **코인 신호·시장환경·ETF·고래 라우트를 게이트에 넣지 말 것** — 홈·3모드가 공개로 즉시 로딩하는 게 설계 의도.
- **`app/api/debug/naver`** — 요청당 상류 8콜. 게이트 뒤로 옮겼으나 삭제 검토 대상.
- 배포 폴링에서 **UI 한글 문자열 전체 grep 금지**(React가 span으로 쪼갬). JSON 필드/status로.
- **UI 확인은 프로덕션 URL로.** localhost는 미커밋 코드 포함.
- **프로덕션 API 응답은 필드명 먼저 확인** — 경제지표는 `indicators[].value`가 아니라 `.macro`.
- 🆕 **엣지 근거 없이 진입 신호처럼 읽히는 UI 추가 금지** — 측정상 엣지 없음(§0). "사도 된다"로 읽히면 근거를 대거나 리스크 관점으로.
- 🆕 **파라미터를 바꿔가며 "통과 조합" 찾기 금지** — 그 자체가 과적합 신호. 판정 기준 먼저, 측정 나중.
- 🆕 **coin-signal UX를 "그대로" 이식하되 엣지 주장은 검증 없이 옮기지 말 것** — 3모드는 미측정(§0). 측정하고 이식.

---

## 10. ❌ 보류 / 구조적 한계 (재시도 방지)

- ✅ **정정: 온체인 고래 — 무료로 구현됨(2026-08-21)** — 이전엔 "CryptoQuant·Glassnode 유료로 불가"로 적었으나, **거래소 유입출이 아닌 대량 이체 감지는 blockchain.info(BTC)·publicnode RPC(ETH)·XRPL(XRP)로 무료 구현**(`lib/whaleTracker.ts`). 거래소 라벨링만 Whale Alert 유료(선택).
- ✅ **정정: 실시간 청산 — 브라우저 WS로 구현됨(2026-08-21)** — 이전엔 "웹소켓 상시 수신 → Vercel 서버리스 불가"로 적었으나, **WS를 브라우저에 두어 해결**(`WhaleLiquidationPanel`, Binance→Bybit). ❌ 청산 **히트맵**(CoinGlass 유료)은 여전히 미구현.
- ✅ **정정: 서버 푸시 알림 — 크론+텔레그램으로 구현됨(2026-08-21)** — 이전엔 "탭 닫아도 오는 알림 불가"로 적었으나, **15분 크론+텔레그램**으로 탭과 무관하게 발송(`coinTrack.mts`, 시크릿 필요 §0).
- ❌ **온체인 거래소 유입출(정확한)** — CryptoQuant·Glassnode 유료. 대량 이체 감지로 근사만.
- ❌ Bitget 카피트레이딩(trace 권한)·서버 WebSocket(서버리스)·Place-Order(안전상 의도 제외)
- ❌ 토스증권 API(공개 없음)·KRX MDC 공개엔드포인트(anti-bot LOGOUT)
- ❌ **청산가 정확 계산** — 거래소 티어·수수료별 상이. MMR 0.5% 근사 + "주문 전 거래소 확인" 고지
- ❌ **이벤트(CPI·FOMC) 방향 예측** — 기술적 분석으로 불가. 12h 진입 차단으로만 대응
- ❌ **성장주 점수 백테스트** — 과거 시점 컨센서스를 구할 방법 없음(네이버는 현재 추정만). 지표 품질·정직한 라벨링으로만 대응
- ❌ **펀딩 전략 추가 검증** — Bitget 펀딩 히스토리 270건(90일) 상한이라 다른 국면 불가. 더 긴 소스 없으면 결론 못 바꿈
- ❌ **DXY ICE 지수(98.79)** — 무료 소스 마땅치 않음(Yahoo ^DX-Y.NYB delisted). FRED 광의(118.9)로 대체 중, 방향 판단엔 동일
- ✅→❌ **정정: 파생 백테스트 불가는 틀린 전제였다** — 공개 히스토리 API로 재현 가능함을 2026-08-07 확인(`scripts/backtest-deriv.ts`). 단 5분 단위는 2일치뿐이라 라이브(30분 테이커)를 정확히 복제하려면 해상도 부족

---

## 11. 디렉토리 구조

```
kospi-lab/
├── middleware.ts             # 인증 게이트 (matcher 5개 — §6)
├── PROJECT_STATUS.md · CHANGELOG.md · COMPLETENESS.md   # 기록 문서 3종
├── tests/engine.test.ts      # 회귀 42케이스 (npm test)
├── data/coin-signals.json    # 크론이 15분마다 커밋(적중률 스냅샷)
├── .github/workflows/coin-track.yml   # 15분 크론 → coinTrack.mts
├── scripts/                  # 11 — 측정·검증·크론(coinTrack.mts는 .mts)
│   ├── backtest-lab · backtest-deriv · backtest-funding · validate-funding · backtest-modes🆕(3모드 측정)
│   ├── measure-backtest-bias · verify-{macro,growth,growth-us}
│   └── coinTrack.mts · generate-icons.js
├── app/
│   ├── api/                  # 44 routes
│   │   ├── coin-signal/ · coin-env/ · etf/ · whale/   # 🆕 코인(공개)
│   │   ├── stock-analysis/ · coin-analysis/           # ★ 게이트 + icn1
│   │   ├── growth-scan/ · coin-scan/ · portfolio-verdicts/ · bitget/{account,activity,positions}/
│   │   └── market · krx · stock · crypto · futures · kis · dart · unlock · ...
│   ├── coin-analysis/ · stock-analysis/ · growth/ · journal/ · krx/   # 주요 페이지
│   ├── error.tsx · not-found.tsx · global-error.tsx · robots.ts · sitemap.ts
│   └── page.tsx(홈) · *.tsx   # 25 pages
├── components/               # 26 — HomeMenu🆕(모바일 런처) MarketEnvGrid🆕 EtfInflow🆕 IndexCards🆕 CoinDashboard🆕
│                             #      HBarChart🆕 WhaleLiquidationPanel🆕 CandidateBoard · ...
├── lib/                      # 32
│   ├── coinSignalModes.ts🆕  # ★ 3모드 엔진(이관, 엣지 미측정)
│   ├── coinAnalysis.ts       # ★ 기존 코인 엔진(measured, 무엣지)
│   ├── coinDashboard.ts🆕 · etfFlow.ts🆕 · whaleTracker.ts🆕   # 코인 이관·대시보드
│   ├── positionSizing.ts · journalStats.ts   # 순수함수(테스트 고정)
│   ├── growthScreener · usGrowth · yahooFinance · marketEnvironment · fetcher
│   └── stockAnalysis · (stock|coin)Backtest · krx · kis · bitget · calendarEvents · ...
├── public/guide.html · manifest.json · icon-192.png · icon-512.png
└── .env.local                # gitignore (14개 키 — §6)
```
