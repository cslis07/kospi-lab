# KOSPI LAB — Project Status

> **마지막 업데이트: 2026-09-30** (세션명 "주식4", 09-28~30) — **Copilot Money 다크 디자인 전면 적용 + 하단 3탭 + 매매일지 재설계 + 크론 규율 알림(전용 텔레그램방)**: 해외 분석·간단 버튼·원화 병기, APK v1.0.1(다크 스플래시), data 브랜치 Vercel 빌드 실패 차단. CHANGELOG 66→74차. (이전: 09-28 "주식3" IA 6탭·자산 허브)
> **위치:** `C:\Users\GB\Documents\kospi-lab`
> **GitHub:** `cslis07/kospi-lab` · 기본=현재 브랜치 `main` · ⚠️ **저장소 공개(public)**
> **배포:** [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel `cslis07` · **git push → 자동 배포**
> **APK:** TWA(배포 URL 로드형 — 콘텐츠는 배포 즉시 반영, 아이콘·스플래시만 재빌드). packageId **`app.kospilab.twa`**(2026-09-15, 옛 `app.vercel.kospi_lab.twa` 폐기). 서명키 `Documents\키스토어\kospi-lab-twa.jks`(비번은 메모리 `reference_kospi_lab_twa_apk`). **최신 산출 `Documents\KOSPILAB_v1.0.1.apk`(v1.0.1/code 2, 2026-09-29, 테마·스플래시 `#000814`) · 다음 재빌드 code 3**
> **외부 서비스:** Supabase `zsjdilispaoqlcdywxky`(톡메모·naver-ad-bid·youtube-intelligence **공용**, 이 앱은 테이블 `kl_sync` 하나) · 텔레그램 봇 `@cirin0913_bot`(posteady와 공용 봇, 이 앱은 전용 그룹 "kospi lab")
> **규모:** API 50 · 페이지 30 · lib 47 · hooks 17 · components 53 · scripts 12 · tests 5파일 **148케이스**(`npm test`)
> **기록 문서:** 변경 이력은 [CHANGELOG.md](CHANGELOG.md)(최신 74차), 완성도는 [COMPLETENESS.md](COMPLETENESS.md)(3차 2026-09-17 — **IA 3탭·디자인 전면 변경 미반영, 재점검 필요**). 여기선 중복 서술 안 함

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — 미커밋은 이 `PROJECT_STATUS.md` 하나뿐(문서, 그대로 커밋해도 됨). 미푸시 0 · stash 0. 마지막 커밋 `00b9d69` = 프로덕션 배포본 ✅success(CHANGELOG 74차). 게이트: test 148 · tsc 0 · build OK. 디자인 변경은 로컬 `next start` + 헤드리스 Chrome 스크린샷(홈·국내·모바일) 및 배포 후 프로덕션 모바일 스크린샷으로 ✅확인.

### 이번 세션("주식4", 2026-09-28~30)에 끝낸 것 — 전부 push·배포 완료 (CHANGELOG 66~74차)
1. **Copilot Money 디자인 시스템 전면 적용(다크 전용)** — `globals.css` 토큰 재정의 + Tailwind `@theme` 팔레트 재매핑 + tsx hex 치환 14파일. 테마 토글 삭제. 상세 §10·CHANGELOG 73차.
2. **하단 탭 6→3(홈·시장·자산)** — 오늘의 리스크(`/today`) 삭제, 인사이트·분석·관심종목 탭 제거 → 관심종목·종목 비교·리포트·뉴스·매매 대원칙·매매일지는 **더보기 도구(EXTRAS)**.
3. **매매일지 재설계**(`/journal`, 코인선물 전용): Bitget 청산 이력 + 현재 포지션 + 매매별 진입 기분 + 월별 보고서(접이식). 테스트 +6.
4. **분석 2단계**: 목록 행 **간단**(재무 스냅샷 = `/screener`, 스크리너→"종목 비교"로 재정의) / **분석**(심화). 해외는 신규 `/overseas-analysis`(지표 요약·신호 아님). 해외 TOP 카드·원화 병기, 코인 시세 = 관심 코인만, 코인 상세 USDT 무기한 블록 삭제, 관심종목 액션 pill을 종목명 옆 인라인.
5. **크론 규율 알림**(서킷브레이커·손절 미설정·주간 복기) + 스윙 제외 + **전용 텔레그램 그룹** 분리. 08-25부터 꺼져 있던 워크플로 재활성, Actions 시크릿 등록. 상세 §7.
6. **APK v1.0.1** 재빌드(다크 스플래시), **data 브랜치 Vercel 빌드 실패 차단**(§8).

### 다음 채팅이 가장 먼저 할 한 가지
급한 일 없음. 1순위 후보: **실기기 확인** — APK v1.0.1 설치 후 다크 디자인 가독성(본문 weight 300)·3탭·종목명 옆 인라인 pill(390px에서 이름 잘림 심함)·텔레그램 규율 알림 문구. 2순위: **COMPLETENESS.md 재점검**(스킬 `webapp-completeness-audit`).

### 🔴 사용자가 직접 해야 할 것
- **APK v1.0.1 폰에 덮어쓰기 설치**(`Documents\KOSPILAB_v1.0.1.apk`, 같은 서명키 — 기존 앱 삭제 불필요).
- 텔레그램 **"kospi lab" 그룹에서 봇 `@cirin0913_bot`(표시명 cirin) 내보내지 말 것** — 한 번 추방돼 전송 실패했었음(09-29).
- ⏸ **KRX API 키 재발급 — 사용자 보류(2026-09-17 "안 해도 괜찮아")**. 옛 키가 public 이력(`3876676`)에 남아 유효한 상태 = **수용한 리스크**. 마음 바뀌면 data.krx.co.kr 재발급 → `vercel env add KRX_API_KEY production` + `.env.local`.
- **분석 페이지 잠금 해제(브라우저 1회)** — `/api/stock-analysis`·`/api/coin-analysis` 게이트. `/bitget`에서 토큰 1회 입력(§6).
- 🔧 **비트겟 청산내역 손절가 채워지는지 실계정 확인** — 안 채워지면 그 계정 orders-plan-history 응답 필드명에 맞춰 `attachStops` 조정(실키 없이 확인 불가).
- ~~ANTHROPIC_API_KEY 무효(401)~~ — 2026-09-17 해결, 새 키로 교체
- ~~텔레그램 알림 켜기~~ — 2026-09-17 해결, GitHub Secrets `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` 등록
- ~~Bitget 선물 읽기 권한~~ — 2026-08-24 해결(`40014` 해소, 청산 이력 조회 확인)

**남은 결정(사용자 몫):** ① 옛 코인 엔진 vs 3모드 엔진 코드 은퇴 여부(둘 다 무엣지 상보 뷰로 유지, 삭제는 승인 후) ② `/principles` 본문의 "홈 오늘의 리스크 — 서킷브레이커" 안내 2곳 정리 여부(오늘의 리스크 삭제됨, 제안만 함) ③ 성장주 `/growth` 페이지 정리 여부(스크리너 재정의와 무관하게 그대로 둠) ④ 미참조 컴포넌트 `ExchangeReconcile·RetroReport·TradeAutopsy·AiCoach` 삭제 여부(보존 중).

### 🔬 엔진 엣지 측정 결과 — 이 프로젝트의 가장 중요한 사실
**측정 가능한 엣지가 어디에도 없다.** 앱의 모든 엔진이 측정됐고 결론은 동일.

| 실험 | 표본 | 결과 | 스크립트 |
|---|---|---|---|
| 추세추종(가격) | 45일·4코인·727건 | 승률 49.7%, −0.006R | `backtest-lab.ts` |
| 추세추종(+파생수급) | 28일·407건 | 48.4%, 오차범위 안 | `backtest-deriv.ts` |
| 펀딩 극단 되돌림 | 89일·19종목·2,168건 | 3/6 → **하락장 베타**(항상 숏만 쳐도 +0.222%) · 실투자 금지 | `validate-funding.ts` |
| 3모드 진입엔진 | 45일·81신호 | 41.7%, −0.167R | `backtest-modes.ts` |
| 주식 룰 엔진 | 32종목·3년·362신호 | 54.1% < **대조군 54.8%** → 전부 상승장 베타 | `backtest-stock-lab.ts` |

- 왕복 수수료 0.12%가 손절폭 0.2% 기준 1R의 60%. 엣지 0이면 수수료를 줄여도 0에 수렴.
- 이 결과로 UI 전체를 "신호"가 아닌 **리스크 도구**로 재정의(`1054f57`, 5차): 초록 진입 배지 제거, AI 프롬프트 방향 추천 제거.
- 🟡 감사 잔여: M-7 `trigger` 방향 미기억(표시만 오염) · M-8 저널 R 회계(자동 1R vs 수동 1.5R) · 옛 훅 스키마 버전 없음.

---

## 1. 프로젝트 목적
**국내·해외 주식 + 코인 + 선물 통합 투자 리스크 관리 앱.** 방향 판단은 사용자, 앱은 **손절·사이징·청산가·기록·복기**. 코인 작업의 정본(2026-08-21 coin-signal 앱 이관·은퇴).
- 2026-08-07 "지금 사도 되나" → "얼마나 걸고 어디서 끊나"로 전환(엣지 없음 측정).
- 2026-09-16 매매 규율 도구 강화(`/target` 목표 역산·누수 계량, 매매 해부·이벤트 대조, 손절가 자동복구).
- **2026-09-18 모바일 앱 수준 UI**(토스·업비트급 핀테크 + 트레이딩앱 구조). 데스크탑은 기존 레이아웃 유지.
- **2026-09-29 Copilot Money 디자인(다크 전용)**으로 전면 교체 — 사용자 지시 "디자인 그대로(색·글꼴·간격)". 토스 라이트 톤 → 미드나잇+시그널 블루+인셋 섀도.
- **2026-09-29 메뉴 단순화**: 하단 3탭(홈·시장·자산), 나머지는 더보기 도구. 텔레그램 알림은 "Bitget이 모르는 규율·기록"만.
- ⚠️ 정직성 원칙: 못 하는 걸 하는 척 안 함. 측정 안 한 건 "미검증". 결측 데이터는 숨기지 않고 공시.
- 스택: Next.js 16 App Router · React 19 · TS · Tailwind v4 · SWR · Recharts. 로그인 없음(localStorage + 선택적 클라우드 동기화), 민감 라우트만 토큰 게이트.

---

## 2. 현재 구현된 기능

### 🆕 하단 3탭 (`lib/menu.ts` 단일 소스 — 하단탭·앱바·서브탭·메뉴시트·홈 전부 여기서) ✅ 2026-09-29 개편
| 섹션 | 항목 |
|---|---|
| 홈 `/` | **대시보드 단독**: 시장 요약·관심종목 미리보기(개수·검색·정렬칩)·주요 이벤트(데스크탑=월간 캘린더) |
| 시장 | 국내 `/domestic` · 해외 `/overseas`(🆕 등락 TOP 카드·원화 병기) · 코인 `/coins`(🆕 관심 코인만) · 선물 `/futures` |
| 자산 | `/assets` 허브(계좌·실적·전체보기) — 상세는 `/bitget`·`/performance`·`/journal` |
- **더보기 도구(EXTRAS, 전체메뉴 시트)** 🆕: 관심종목 `/my-stocks` · 종목 비교 `/screener` · 리포트 `/report` · 매매일지 `/journal` · 뉴스 `/news` · 매매 대원칙 `/principles` · 가상투자·투자설계·세금·시뮬·증권사.
- **분석 진입 = 시세 목록 행 버튼(메뉴 아님)** ✅: 국내 **분석**(심화 `/stock-analysis?ticker=&run=1`) + **간단**(`/screener?tickers=<6자리>&market=KR&run=1`) · 해외 **분석**(🆕 `/overseas-analysis?symbol=`) + **간단**(`market=US`) · 코인/선물 4종(BTC·ETH·XRP·SOL) **분석** → `/coin-analysis?run=1`.
- **종목 비교 `/screener`**(구 버핏 스크리너): 입력한 종목에 버핏 7기준 채점 = **재무 스냅샷, 검증 신호 아님**(시장 전체 발굴 기능 아님). `?tickers=&market=&run=1` 자동 로드.
- **해외 분석 `/overseas-analysis`** 🆕: 가격 차트·52주 위치·PER/PEG·재무 체력. "지표 요약 — 매수/매도 신호 아님" 배너(해외 전용 엔진 없음).
- **매매일지 `/journal`** 🆕 재설계(코인선물 전용): ① Bitget 청산 이력(7/30/90) ② **현재 포지션**(미청산) ③ 매매별 **진입 기분**(6종+메모, localStorage `kospi-lab-trade-mood`) ④ **월별 보고서**(기본 접힘 → 월 선택 시 요약·기분별 성적·거래내역).
- **경제 캘린더 `/calendar`** 메뉴 숨김 — 홈 '주요 이벤트' 클릭으로 진입(`?date=`).
- 상세 3종: 국내 `/stock/[ticker]` · 해외 `/overseas/[symbol]`(🆕 등락률 줄에 ≈원 인라인) · 코인 `/crypto/[symbol]`(🆕 USDT 무기한 선물 블록 삭제).
- 관심종목(`/my-stocks`·홈 미리보기): 상세·분석·삭제 pill이 **종목명 바로 옆(같은 줄)** — `WatchRow`의 `actions` 슬롯.
- **디자인** 🆕: Copilot Money 다크 전용(§10). 상승=Coral `#ff4433`, 하락=Signal Blue `#1c6cff`.
- "이상해 보이지만 정상": **테마 토글 없음**(다크 전용, 의도). 해외 TOP은 "수록 종목 중"(약 90개, 미국 전체시장 아님). 매매일지 현재 포지션의 기분은 키 `open-심볼-방향`이라 **청산되면 청산 기록으로 안 이어짐**. 월별 보고서는 기본 접힘. 인라인 pill 때문에 모바일에서 종목명이 "SK하이…"로 잘림(사용자 요청 배치). 크론 규율 알림은 같은 경고를 6h/하루 안에 다시 안 보냄(dedup). 데스크탑(≥md)은 하단탭 대신 상단 pill 탭. `/assets` 실적 기본 7일(30/90은 그래프 숨김).

### 기존 기능 (변동 없음 — 상세는 CHANGELOG)
- **코인선물 분석 `/coin-analysis`** — 엔진 2개 병존: 3모드(`coinSignalModes`·`/api/coin-signal` 공개·즉시) + 기존 룰 엔진(`coinAnalysis`·게이트·"분석" 버튼). 실시간 청산 WS(브라우저)·온체인 고래. Go/No-Go(`tradeGate`)는 "틀려도 버티나"만 판정.
- **국내주식 분석 `/stock-analysis`** — 룰 엔진·경제지표·백테스트·AI 브리핑·`?ticker=` 딥링크. 🆕 결측 소스 공시(`SourceStatus`).
- ~~매매일지 `/journal` — 성적표·거래소 대조·매매 해부·주간 리뷰~~ → 09-29 재설계(위). 옛 구성 컴포넌트 `ExchangeReconcile·RetroReport·TradeAutopsy·AiCoach`는 **미참조지만 파일 보존**. `useCoinJournal`/reconcile은 코인분석 기록용으로 그대로.
- **성과 `/performance`** — 승률·기대값·주간 리뷰(옛 매매일지 데이터 기반, `ScoreCard`·`WeeklyReview` 사용). **계좌 `/bitget`** — 현물+선물·포지션·청산내역·입출금.
- **성장주 `/growth`**(KR+US 141종목, 메뉴 alias만 남음) · KRX `/krx`(RankList 전체보기서 진입) · 캘린더 `/calendar`(필터칩·KST 시각) · 클라우드 동기화(`/api/sync`, 11개 localStorage 자산 — **매매 기분 `kospi-lab-trade-mood`는 미포함**).
- 🗑 **삭제된 페이지**: 09-28 `/planner`·`/risk`·`/target`·`/portfolio`·`/dart` / 🆕 09-29 **`/today`(오늘의 리스크)·`TodayRisk`·`ThemeToggle`**. 관련 **lib/hook(positionSizing·riskDashboard·targetPlan·usePortfolio·/api/dart·circuitBreaker)은 유지**. 서킷브레이커 설정 UI는 `/coin-analysis`의 `CircuitBreakerBar`(한도는 동기화 → 크론이 읽음).
- 성장주: EPS 적자→흑자 전환(`cEpsClamped`)·PEG 신뢰불가는 **배지·밸류 점수에서 제외 + 경고**(09-17).

---

## 3. 수정한 주요 파일

### 🆕 2026-09-28~30 세션 ("주식4")
| 경로 | 역할 |
|---|---|
| `app/globals.css` ✏️ | **Copilot 디자인 토큰**(`:root, html.dark` 동일값 — 다크 전용), `@theme` 폰트 + **Tailwind 팔레트 재매핑**(red/emerald/sky/amber…→캔디색), 뉴모픽 인셋 섀도 `--neo/--neo-sm/--glow/--pressed`, `.kicker`·`.kl-ghost`·`.chip-scroll.in-card`, `.wl-actions` |
| `app/layout.tsx` ✏️ | next/font Inter·Space_Grotesk, `html.dark` 정적, themeColor `#000814`, 컨테이너 1200px, 테마 스크립트 삭제 |
| `lib/menu.ts` ✏️ | 하단 3탭(home·market·assets), EXTRAS 11개, drillTitle `/overseas-analysis` |
| `app/journal/page.tsx` ♻️ | 매매일지 전면 재작성(청산 이력·현재 포지션·기분 시트·월별 보고서 접이식) |
| `lib/tradeMood.ts`·`hooks/useTradeMood.ts`·`lib/tradeReport.ts`·`tests/tradeReport.test.ts` 🆕 | 기분 6종 상수 · positionId별 기분 저장 · 월/기분 집계(KST 버킷) · 6케이스 |
| `app/overseas-analysis/page.tsx` 🆕 | 해외 지표 요약 분석(overseas/batch·chart + `/api/screener` US 재사용) |
| `app/overseas/page.tsx` ✏️ · `app/overseas/[symbol]/page.tsx` ✏️ | 등락 TOP 카드(클라 계산)·분석/간단 버튼·≈원 병기 |
| `app/screener/page.tsx` ✏️ | "종목 비교" 재정의 + `?tickers=&market=&run=1` 자동 로드(Suspense) |
| `app/domestic/page.tsx` ✏️ · `app/coins/page.tsx` ✏️ | 간단 버튼 · 관심 코인만 |
| `components/WatchRow.tsx` ✏️ · `components/home/WatchlistPreview.tsx` ✏️ · `app/my-stocks/page.tsx` ✏️ | `actions` 슬롯(종목명 옆 pill) · 미리보기에 개수·검색·정렬칩 |
| `app/crypto/[symbol]/page.tsx` ✏️ | USDT 무기한 선물 블록 삭제 |
| `scripts/coinTrack.mts` ✏️ | 규율 알림 3종·스캘프만·`KL_TELEGRAM_*` 우선 |
| `.github/workflows/coin-track.yml` ✏️ | KL 텔레그램 env, **data 트리에 vercel.json(deploymentEnabled:false)** |
| tsx 14개 ✏️ · `public/manifest.json` ✏️ | hex 치환(상승·하락·차트 계열색) · 색 `#000814` |
| 🗑 삭제 | `app/today/page.tsx`·`components/home/TodayRisk.tsx`·`components/ThemeToggle.tsx` |

### 이전 세션 요약
- 09-28(주식3): IA 6탭·자산 허브(`app/assets`)·`/today`·`/principles`·`EventCalendar`·관심종목 시장별 pill·캘린더 KST(`EventRow`·`CalendarEvent.timeKst`)·목록 '분석' 버튼(`?run=1`)·`/planner` 등 5페이지 삭제.
- 09-17~18: IA 5섹션 셸(`BottomNav·Header·NavTabs·HomeMenu·MenuSheet·SearchSheet`)·`ui/{BottomSheet,ActionSheet,Collapsible}`·`WatchRow·EventRow·ScoreCard·SwipeRow`·`detail/{PriceChart,SwipeNav}`·`useSyncedList`·`lib/cache`(+테스트)·`SourceStatus`·상세 3종 재작성.
- 09-16: `lib/{targetPlan,leakage,tradeAutopsy,marketEvents}.ts`·`attachStops`·`app/target`·`/api/candles`(공개)·`TradeAutopsy/WeeklyReview/ClosedTrades`·아이콘/assetlinks.
- 08-21: coin-signal 이관(`coinSignalModes`·`etfFlow`·`whaleTracker`·`WhaleLiquidationPanel`·`coinTrack.mts`), 홈 대시보드(`coinDashboard`·`/api/coin-env`)·`HBarChart`.
- 그 이전: 성장주·측정 스크립트·`journalStats`·`positionSizing`·`riskDashboard`·`tradeGate`·클라우드 동기화.

---

## 4. 남은 작업
### 우선
- [ ] **실기기 점검(APK v1.0.1)** — 다크 디자인 본문 300 가독성·하단 3탭·종목명 옆 인라인 pill(390px 이름 잘림)·시트 터치. 헤드리스 스크린샷(500px)으로만 봄(사용자 폰 필요)
- [ ] **COMPLETENESS.md 재점검** — IA 3탭·디자인 전면 변경·매매일지 재설계 미반영(3차는 09-17)
- [ ] **크론 규율 알림 실사용 피드백** — 문구·빈도·임계값(서킷 한도는 앱 `CircuitBreakerBar`에서 설정). 첫 발송 2건은 전용방 설정 전이라 posteady 방으로 감(대기: 사용자 반응)
- [ ] **두 코인 엔진 은퇴 여부** — 사용자 결정 대기

### 개선 여지
- [ ] **기분 미기록·목표 이탈 텔레그램 알림** — 기분·목표 입력이 브라우저 전용이라 `/api/sync`(kl_sync)에 `kospi-lab-trade-mood`·targetPlan 추가가 선행(의도적 후순위, §12)
- [ ] 미청산 포지션에 남긴 기분 → 청산 기록(positionId)으로 승계 — 후순위
- [ ] 차트(recharts) 축·그리드·툴팁 색이 다크 팔레트와 맞는지 페이지별 점검 — 헤드리스로 홈·국내·모바일 홈만 확인
- [ ] `/assets` 실적 30/90일에도 일별 그래프 넣을지(현재 7일만)
- [ ] 상세 간 스와이프는 **관심목록 안에서만** — 검색·랭킹 목록 기준 이동은 의도적 후순위
- [ ] 해외 상세 **시가총액 대부분 "—"**(§12) — 소스 한계
- [ ] M-7/M-8 — 표시 계열, 급하지 않음 · DXY를 ICE로 — 무료 소스 없음(§12)
- [ ] `app/api/debug/naver` 제거 — 사용 관찰 중 · ~~`/screener` 폐지 검토~~ (09-29 "종목 비교"로 재정의돼 유지)
- [ ] 통합 테스트 · 서버 컴포넌트 전환 · 모달 포커스 트랩
- [ ] KRX 채권/파생/ESG — data.krx.co.kr 활용신청 필요(미승인 401)
- ~~/dart 종목별 필터 페이지~~ (09-28 /dart 페이지 삭제 — 종목별 공시는 분석 결과·상세에 있음) · ~~해외/코인 portfolio 수기 입력~~ (09-28 /portfolio 삭제)

---

## 5. 실행 명령어
```bash
cd C:\Users\GB\Documents\kospi-lab
npm run dev                  # localhost:3000
npm test                     # 1) 148케이스
npx tsc --noEmit             # 2) 타입체크
npm run build                # 3) 빌드(lint 포함) — 정적 자산만 바꿔도 필수(favicon RGBA 함정)
git push origin main         # = 배포
gh api repos/cslis07/kospi-lab/commits/<sha>/status   # Vercel 배포 성공 확인
```
- ⚠️ **로컬 `npm run dev`(Turbopack)는 안 뜸** — `app/globals.css`의 `@import url(pretendard…)` 배치를 Turbopack dev가 "Parsing CSS failed"로 죽임(500). `npm run build`(webpack 계열)·프로덕션은 정상. → **검증은 build + 프로덕션 URL**로. (Playwright도 이 PC에 미설치)
- **스모크(재개 직후 1개):** `curl -s https://kospi-lab.vercel.app/api/market | head -c 200` → 지수 JSON이면 정상.
- **UI 확인:** claude-in-chrome로 프로덕션 URL 스크린샷(창 최소폭 ~992px). 🆕 확장 미연결이면 **로컬 프로덕션 + 헤드리스 Chrome**: `npm run build && npx next start -p 3456`(백그라운드) → `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --hide-scrollbars --window-size=500,1400 --virtual-time-budget=9000 --screenshot=<png> http://localhost:3456/`(모바일은 500px가 최소). 잠금 게이트 뒤(자산·분석)는 `.env.local`의 `APP_ACCESS_TOKEN`을 `-H "x-app-token:"`로 curl해 JSON 검증.
- 🆕 `npm run build`는 **네트워크 필요**(next/font가 빌드 때 Google Fonts를 받음).
- 🆕 크론 수동 실행·로그: `gh workflow run coin-track.yml` → `gh run view <id> --log | grep -E "규율|open="`. data 커밋에 Vercel 배포가 안 붙는지: `gh api repos/cslis07/kospi-lab/commits/<data sha>/status`(statuses 0이 정상).
- 측정: `npx tsx scripts/backtest-lab.ts 45 BTCUSDT,ETHUSDT` · `validate-funding.ts 24 3` · `verify-macro.ts`

---

## 6. 배포·환경
- gh 두 계정 `cslis07`(소유자)·`histobio0302-oss`. push 403 → `gh auth switch --user cslis07 && gh auth setup-git`.
- 배포 한도 무료 100/일(리셋 한국 09:00). ~~크론은 data 브랜치라 배포 미소비(8차)~~ → **틀린 가정이었음**(Vercel은 모든 브랜치를 배포): 09-30부터 data 커밋 트리에 `vercel.json`(`git.deploymentEnabled:false`)을 넣어 실제로 미소비(§8).

### 환경변수 (이름만 — 값은 각 위치에)
| 키 | 용도 | 설정된 곳 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 게이트(미설정 시 503 fail-closed) | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX | 양쪽 · ⏸재발급 보류(§0) |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART | **Vercel만** — 로컬 `/api/dart` 503은 정상 |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기 전용(현물+선물) | 양쪽 + 🆕 **GitHub Actions Secrets**(09-29, 크론 감시·규율용) |
| `ANTHROPIC_API_KEY` | AI 브리핑·복기 코치 | Vercel · 2026-09-17 교체 |
| `ECOS_API_KEY`·`FRED_API_KEY`·`CUSTOMS_API_KEY` | 한국은행·FRED·관세청 | 양쪽 |
| `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` | 클라우드 동기화 | 양쪽 + 🆕 **GitHub Actions Secrets**(09-29, 크론이 동기화된 일지·서킷 한도를 읽음) |
| `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` | 크론 알림 공용 봇·기본 채팅(posteady 방) | **GitHub Actions Secrets** · 2026-09-17 |
| 🆕 `KL_TELEGRAM_CHAT_ID` | kospi-lab 전용 그룹 "kospi lab"(있으면 우선) | **GitHub Actions Secrets** · 2026-09-29 |
| 🆕 `KL_TELEGRAM_BOT_TOKEN` | 전용 봇(선택) — **미설정**, 없으면 `TELEGRAM_BOT_TOKEN` 폴백 | (워크플로 env에 자리만) |
- GitHub 시크릿은 `.env.local` 값을 **stdin으로** `gh secret set`(화면·로그 비노출). 값 확인 불가(쓰기 전용) — 바꿀 땐 같은 방식으로 덮어쓰기.

### git에 없는 필수 로컬 파일
`.env.local`(15줄) · `Documents\키스토어\kospi-lab-twa.jks` · `Documents\키스토어\kospilab-twa-manifest.json`(🆕 v1.0.1 값) · `Documents\KOSPILAB_v1.0.1.apk`(옛 `KOSPILAB_v1.0.apk`도 남아 있음)

### 게이트·리전·런타임
- `middleware.ts` 게이트: `/api/bitget/*`·`/api/analyze`·`/api/stock-analysis`·`/api/coin-analysis`·`/api/debug/*`·`/api/sync`. 코인 신호·시장환경·ETF·고래·캔들은 **공개(의도)**. 쿠키 `kl_auth`(1년) 또는 `x-app-token` 헤더.
- `preferredRegion='icn1'`: 분석·스캔·coin-env — 업비트·바이낸스·Bybit가 미국 IP 차단.
- 분석 라우트 `maxDuration=30`(AI 25초 → 상류 느리면 504). Yahoo는 로컬 Node `HeadersOverflowError` → 프로덕션에서만 검증.

---

## 7. 무인 실행되는 것
| 이름 | 주기 | 역할 | 끄는 법 |
|---|---|---|---|
| `.github/workflows/coin-track.yml` → `scripts/coinTrack.mts` | 15분(GitHub 스케줄이라 지연·누락 잦음) | ① **스캘프** 신호 스냅샷·TP/SL 판정 알림(스윙 제외, 09-29) ② 포지션 감시: 청산 임박 <8%/<15%, 일지 계획 손절 도달·근접·목표 도달 ③ 🆕 **규율 알림**: 서킷브레이커(한도=동기화 `kospi-lab-risk-limits`, 실현손익=Bitget 청산이력 직접, 하루 1회) · 손절 미설정 포지션(일지 손절·거래소 SL 둘 다 없음, 6h 재발화) · 주간 복기(월 09시 KST 1회) → 텔레그램 **"kospi lab" 그룹**(`KL_TELEGRAM_CHAT_ID`, 봇 @cirin0913_bot). 결과는 **data 브랜치**에 plumbing 커밋(main 무접촉, 트리에 vercel.json) | `gh workflow disable coin-track.yml`(또는 Actions 탭). BITGET 시크릿 삭제 시 ②③만 조용히 skip. ⚠️ **08-25~09-29 동안 워크플로가 비활성이었음**(저장소 비활동 자동 비활성 추정) — 알림이 뚝 끊기면 `gh workflow list`로 enabled 확인 |

---

## 8. 최근 발생한 에러와 해결 (누적)
| 증상 | 원인 | 해결 | 날짜 |
|---|---|---|---|
| Vercel에 `data` 브랜치 미리보기 빌드 실패 반복("Couldn't find any `pages` or `app` directory") | 크론이 data 브랜치에 JSON만 커밋 → Vercel은 **모든 브랜치** 배포(main vercel.json은 그 커밋에 없어 무효) → 한도 소모 위험 | data 커밋 트리 루트에 `vercel.json {"git":{"deploymentEnabled":false}}` → 새 data 커밋 배포 0건 확인 | 09-30 |
| 크론 규율·포지션 알림이 안 나감 | ① 워크플로 08-25부터 **비활성** ② Actions에 BITGET/SUPABASE 시크릿 없음 → `bitgetKeysConfigured()` false로 블록 통째 skip(에러 없음) | `gh workflow enable` + 시크릿 5개 등록 → 로그 `포지션·규율 알림 2` | 09-29 |
| 텔레그램 전송 "Forbidden: bot was kicked from the group chat" | 그룹에서 알림봇(표시명 cirin)을 추방 | 재초대 → TEST_SEND OK | 09-29 |
| @MyIDBot·@RawDataBot이 그룹에서 무응답(chat id 못 얻음) | 봇 privacy 모드 | 알림봇 토큰으로 Actions에서 `getUpdates` 조회(일회성 워크플로, 사용 후 삭제). 봇은 웹훅 없음 | 09-29 |
| 해외 원화 "아직 너무 작다"(배포 후에도) | 목록·TOP·분석만 바꾸고 **해외 상세**(12px 아래 줄)는 안 바꿈 | 상세·분석은 등락률 줄(15px)에 인라인 | 09-29 |
| 매매일지에 오늘 들어간 포지션이 안 보임 | `/api/bitget/history`는 **청산된** 포지션만 | `/api/bitget/positions` 병행해 "현재 포지션" 구역 | 09-29 |
| 라우트 삭제 후 tsc "Cannot find module '../../app/today/page.js'" | `.next/types` 스테일 | `rm -rf .next/types` → build 후 tsc | 09-29 |
| 해외 TOP 타입 술어 오류 | `OverseasItem.exchange`(유니언) vs `MarketItem`(string) | map 반환을 `MarketItem`으로 명시 | 09-29 |
| 홈 관심종목 카드의 정렬칩 왼쪽 잘림 | `.chip-scroll` 음수 여백 > 카드 패딩 | `.chip-scroll.in-card` 변형 | 09-29 |
| 셸 명령이 2분 멈춤 | `python3`는 이 PC에서 Store 스텁 | `py` 사용 또는 Edit 도구 | 09-30 |
| 시장탭(국내·해외) 종목명 안 보이고 우측 빈칸 | 모바일에서 데스크탑 6열 그리드가 그대로 → 이름(1fr) 0으로 찌그러짐·빈 열 | 모바일 `flex` / sm+ `grid`(`sm:contents` 래퍼) | 09-28 |
| 성과 그래프에 이익(초록)이 안 보임 | 그래프가 일별 **순손익(NET)** → 이익 매매가 큰 손실에 묻혀 매일 음수 | 하루의 **이익(위)/손실(아래) 분리 막대** | 09-28 |
| 자산 순손익·손실 합계가 "0" 으로 표시 | `fmtUsd`가 양수 전용(`n<=0→'0'`) | 부호 포함 `fmtPnl` 추가 | 09-28 |
| 종목 분석 '재무(ROE·부채) 핵심 결측' 배너 잦음 | 재무가 KIS 단일 소스 → 한 번 실패하면 통째 결측 | 네이버 연간재무(`fetchGrowthFinance`) → KIS 폴백 체인(삼성·SK·소형주 ok 실측) | 09-28 |
| 데스크탑 단일섹션(관심종목·자산) 알약 눌러도 서브칩 한 번 더 눌러야 진입 | 알약이 펼침 토글 전용(Link 아님) | 항목 1개면 알약을 Link로(서브칩 숨김) | 09-28 |
| UI 셸: 데스크탑에 하단 탭바 노출 / 되돌리기·☆가 열린 목록에 미반영 / 헤더 빠른 플릭 미이동 / 거래소 "NMS" / 스와이프행 1px 빨간 줄 / 검색 입력마다 깜빡·포커스 튐 | 무레이어 `display:grid`가 `md:hidden` 이김 / 훅 인스턴스별 상태 / dx 옛 값 / Yahoo 내부 코드 / 뒤 버튼 비침 / 렌더 함수 **안** 컴포넌트 → 리마운트 | md 미만만 grid / `useSyncedList` / `dxRef` / EXCHANGE 매핑 / 닫히면 `visibility:hidden` / 일반 함수 `rowView()` | 09-17~23 |
| 데이터: 국내 DART 공시 안 뜸 / 시총·대금 "-" / 판정가 호가 단위 아님·`0.30000000004` | 정규식 `.KS` 미허용 / 네이버 축약키 `시총`·`대금` / 반올림 없음 | `/^\d{6}(\.(KS|KQ))?$/` / `pick('시총','시가총액')` / `krwTick` | 09-17 |
| favicon 교체 후 배포 전부 실패 / 배경 알림 안 감 / 폰 아이콘이 옛것 / 플래너 한 글자만 입력 | RGB PNG(`PNG is not in RGBA`) / `coinTrack.mts` 문자열 raw 개행 / 런처 packageId 캐시 / 렌더 함수 안 `Field` | PIL `convert('RGBA')`+push 전 build / `'\n\n'` / 새 패키지 `app.kospilab.twa` / 모듈 레벨 | 09-15~16 |
| 로컬이 원격보다 뒤 / 김프 카드 누락 / 나스닥 null / ETF 파싱·`.mts` 타입체크·BigInt 리터럴 | 크론 봇 main push / 바이낸스 IP 차단(icn1도) / `^IXIC` 이중 인코딩 / Farside 차단·확장자·ES2017 | data 브랜치 / Bitget 공개 티커 / 원본 전달 / SoSoValue·tsconfig exclude·`BigInt(10)**BigInt(18)` | 08-21 |
| 백테스트 과대·ema200 비정상·종목명 티커·적자 초저 PEG | 미완결봉 / 시드 덮어씀 / `price` 모듈 누락 / 흑자 기준 없음 | 완결봉만 / SMA 워밍업 / 모듈 추가 / 흑자일 때만 PEG | 08-07 |
| KRX 키 유출·AI 라우트 무인증·분할매수 손절 밖·CPI 13개월 | 하드코딩 폴백 / matcher 누락 / 존 미클램프 / `.` 필터 밀림 | 폴백 제거 / 게이트 확대 / 클램프 / 날짜 매칭 | 07-27 |
| OI 0행·보유율 NaN·반도체 이중합산·시총 1e6·KIS 에러 | Bybit IP차단 / `"46.55%"` / 총계행 / 단위 / 토큰·도메인·초당 | OKX 폴백 / parseFloat 정제 / `hsCd==='-'` / 원 단위 / 사전토큰·VTS `:29443`·throttle | 기존 |

---

## 9. API 구조
**내부:** `/api/coin-signal`(공개) · `/api/coin-env`(공개·icn1·5분) · `/api/etf` · `/api/whale` · `/api/candles`(공개) · ★`/api/coin-analysis`·★`/api/stock-analysis`(게이트·icn1·30s, 🆕`sources`) · `/api/growth-scan` · `/api/market`(KOSPI·KOSDAQ·KPI200·NASDAQ·환율) · `/api/index-spark`(^KS11) · `/api/overseas/{batch,chart,search}` · `/api/screener`(종목 비교, KR/US — 🆕 `/overseas-analysis`도 US 재무로 재사용) · `/api/sync`(게이트) · `bitget/{history(청산),positions(미청산),account,activity}`(게이트, 🆕 매매일지가 history+positions 병행) · `krx/*`·`stock/*`·`dart/*`·`kis/price`·`news/*` 등.

| 외부 API | 키 | 함정 |
|---|---|---|
| Bitget | 읽기전용 | IP 화이트리스트 비우기. granularity `5m·15m·1H·4H·1D`, 1D history 90봉, 펀딩 270건 상한 |
| SoSoValue · 온체인 · OKX rubik | 무 | ETF POST `/openapi/v2/etf/historicalInflowChart` · blockchain.info/publicnode RPC/XRPL·XRPSCAN(자기→자기 AMM 제외) · OKX 1H 30일·5m 2일 |
| FRED | 유 | 미공표월 `"."` → 날짜 매칭. DXY는 광의 DTWEXBGS |
| Yahoo | 무 | crumb. `price` 모듈. `^` 심볼 한 번만 encode. 해외 시총 대부분 null. 로컬 HeadersOverflow |
| 네이버 금융 | 무 | **키가 축약형으로 바뀔 수 있음(시총·대금)**. `finance/annual` = 확정 3년+컨센 1년 |
| KRX · KIS | 유 | KRX API별 활용신청·MKTCAP 원 단위 · KIS VTS `:29443`, 토큰 1분 1회 |
| ECOS · 관세청 | 유 | ECOS 오래된 순·`"46.55%"` 문자열 · 관세청 XML·1년 이내·`hsCd="-"` 총계 |
| Anthropic | 유 | 401=키 무효, 400=크레딧 소진. 최신 모델은 temperature 넣으면 400 |
| 무키 기타 | — | alternative.me·업비트·Deribit·CoinGecko·BLS·Frankfurter |
| 🆕 Telegram Bot API | 유(Actions) | 봇 @cirin0913_bot은 **웹훅 없음 → getUpdates 가능**(chat id 조회용). 그룹에서 봇 추방 시 `Forbidden: bot was kicked`. 알림은 크론만 보냄(앱 서버는 안 보냄) |
| 🆕 Google Fonts(next/font) | 무 | Inter·Space Grotesk를 **빌드 시** 받아 자체 호스팅 → 빌드에 네트워크 필요. 한글 글리프 없음 → Pretendard(jsDelivr @import) 폴백 |
| 🆕 Bitget `orders-plan-pending`(profit_loss) | 읽기전용 | 크론이 "손절 미설정" 판정 전 거래소 SL 존재 확인. 실패 시 null → 그 경보만 skip(오탐 방지) |

---

## 10. 결정 기록 (코드로 역추적 불가)
- **색은 한국 관행 상승=빨강·하락=파랑.** ~~`#f04452`/`#3182f6`~~ → 09-29부터 **Coral `#ff4433` / Signal Blue `#1c6cff`**(Copilot 팔레트 안에서 관행 유지). 시장환경 지표 톤은 가격 방향이 아니라 **위험자산에 유리/불리** 기준.
- **디자인 참고는 구조만** — UI8 핀테크 템플릿·Pinterest 이미지·`Desktop\tradingview` 분석·Investing.com은 레이아웃·정보 계층만 모방, 아이콘은 자작 SVG(`components/fin/icons`·`lib/menu` ICON). 이미지·에셋 복사 없음(사용자 지시 2026-09-17). → 🆕 **09-29 예외: Copilot Money DESIGN.md는 사용자가 "색·글꼴·간격 그대로"를 명시 지시** → 디자인 **토큰**(색·반경·간격·섀도)은 원본 값 사용. 로고·이미지·에셋은 여전히 복사 안 함.
- 🆕 **Copilot 디자인 적용 방식(2026-09-29)**: ① 다크 전용(원본이 다크, 라이트 변형 없음 → 토글 제거) ② 폰트는 **상용(Jokker/Matter TRIAL)이라 불가** → 문서 권장 대체 Space Grotesk+Inter, 한글 Pretendard ③ **본문 weight 300**(원본 100 — 사용자 선택 "원본 톤+가독성 보정"), 가격·손익 등 핵심 숫자 굵기 유지 ④ 기업·코인 로고색 유지 ⑤ 마케팅 전용 요소(148px 히어로·떠다니는 태그·수상 배지·공지바)는 대시보드에 안 맞아 미적용 ⑥ 92개 파일을 고치지 않고 **토큰·@theme 재매핑**으로 리스킨(예전 토스 리스킨과 같은 전략).
- 🆕 **하단 3탭(2026-09-29, 사용자 단계별 요청)**: 인사이트 탭 해체(오늘의 리스크 **삭제**, 뉴스·대원칙→더보기) → 분석·관심종목 탭도 "기능은 삭제하지 말고 탭에서만 빼기" → 더보기 도구. 아래 "IA 6개 판단"·"09-28 IA 대개편"은 이것으로 **대체됨**(기록 보존).
- 🆕 **분석 2단계(09-29)**: 스크리너는 실제로 "입력 종목 채점기"라 발굴 기능이 아님 → **"종목 비교 = 간단"**, 기존 분석 = 심화. 해외 분석은 사용자가 "추천 방향으로" 위임 → 전용 엔진이 없어 **"지표 요약·신호 아님" 페이지**로 신설(가짜 분석 버튼 대신).
- 🆕 **매매일지(09-29, 사용자 선택)**: 메뉴=더보기 도구, 범위=**코인선물 전용**(거래소 자동 대조가 되는 유일한 소스, 주식은 KIS 모의라 체결 이력 없음), 기분=**매매별**. 기존 `useCoinJournal`/reconcile과 **디커플**(거래소가 매매 목록의 유일한 소스, 기분은 positionId 오버레이). 월별 보고서는 **청산 건만**(미실현 제외).
- 🆕 **텔레그램 알림 범위(09-29)**: 시세·청산·손절 도달처럼 **Bitget 앱이 이미 잘하는 것은 Bitget에 맡기고**, 크론은 "Bitget이 모르는 내 규칙·기록"(서킷브레이커·손절 미설정·주간 복기)만 — 사용자 동의. 스윙 신호 알림 제외. posteady와 **채팅방 분리**. 실현손익은 동기화 일지가 아니라 **Bitget 이력에서 직접**(앱 안 켜도 정확).
- 🆕 **Supabase 서비스롤 키를 공개 저장소의 Actions 시크릿에 등록**(09-29): 위험(공개 repo) 고지 후 사용자가 "5키 모두" 선택. 부담되면 SUPABASE 2키만 삭제 → 손실 한도·일지 연동만 빠지고 나머지 동작.
- 🆕 **해외 TOP = 수록 종목(약 90) 기준 + "수록 종목 중" 표기**(무료 전체시장 랭킹 없음, 정직성). **코인 시세 = 관심 코인만**(사용자 요청).
- **IA 6개 판단(사용자 "너가 정한 대로 전부" 2026-09-18 확정):** ① 계좌 = 비트겟 페이지 ② 성과 = 신규 `/performance` ③ 관심종목은 5섹션 밖(홈 미리보기 + EXTRAS) ④ 분석 섹션의 종목 분석은 국내/코인 스위치 한 항목 ⑤ 중앙 FAB 제거(검색은 앱바) ⑥ 해외 종목은 모달 → 드릴다운 상세.
- 이전 선택지 "홈·매매·시세·내자산·더보기" 탭은 IA 5섹션으로 **대체됨**.
- 상세 간 이동은 `router.replace` — 뒤로가기가 목록으로 돌아가게.
- 게이트 밖 공개 라우트(신호·시장환경·캔들)는 홈이 즉시 로딩하라는 설계 의도.
- 크론 스냅샷은 data 브랜치(배포 예산·main 히스토리 보호). 단 배포 예산 보호는 **09-30 vercel.json 추가로 비로소 실제 달성**(그전엔 data 커밋도 실패 배포로 소모됐음).
- KRX 재발급은 사용자가 보류 — 리스크 인지 후 수용.
- "무조건 5~10% 수익" 기능 요청은 거짓이라 거절하고 산수 기반 `/target`으로 재구성(09-16). (09-28 `/target` 페이지는 삭제됐지만 `lib/targetPlan`은 테스트·잔존)
- **2026-09-28 IA 대개편(사용자 단계별 요청):** ① 하단 6탭(인사이트 신설: 오늘의 리스크·뉴스·매매 대원칙) ② 홈=대시보드 단독 ③ 분석은 메뉴 탭이 아니라 **시세 목록 행 '분석' 버튼**으로(자동 실행) — 종목 분석·공시(/dart)·경제 캘린더를 메뉴에서 숨김 ④ 데스크탑 단일항목 섹션 알약은 바로 링크(다중은 펼침 유지).
- **자산 = 단일 허브(/assets):** 관리 도구 4종(플래너·통합리스크·목표·포트폴리오)은 "수동입력/중복/1회성이라 손이 안 간다"는 판단으로 **페이지 삭제**(lib/hook은 유지). 성과 지표는 **거래소 실현손익(/api/bitget/history)** 기반 — 매매일지 `realizedUsdt`는 자동판정에서 안 채워져 부정확해서. 전체보기=계좌상세·전체성과·매매일지 시트로 통합.
- **관심종목 액션 = 시장별 pill 버튼**(⋮ 모달·스와이프 제거, 사용자 요청) → 09-29 **종목명 옆 같은 줄**로 이동(사용자 요청). ~~해외는 분석 버튼 없음~~ → 09-29 해외 목록에 "분석"(지표 요약 페이지)·"간단" 추가. 관심종목 화면의 해외 행엔 여전히 분석 없음.
- 캘린더 KST 시각은 **카테고리별 서머타임 대략치**(EventRow `eventTimeKst`), 정확 시각은 `CalendarEvent.timeKst`로 개별 override.

---

## 11. ⛔ 하지 말 것
- **시크릿 하드코딩 폴백(`process.env.X ?? '실제값'`) 금지** — 저장소 public, KRX 키가 이렇게 유출됨.
- **`vercel env pull` 절대 금지** — 로컬 전용 키 삭제. `vercel env add`만.
- **`APP_ACCESS_TOKEN`을 Vercel에서 지우지 말 것** — 게이트 라우트 전부 503.
- **`.env.local` 커밋 금지**, 토큰·키 로그/응답 출력 금지.
- **`/api/kis/:path*` 통째 게이트 금지** — `/api/kis/price` 공개 사용처 있음.
- **코인 신호·시장환경·ETF·고래·캔들 라우트 게이트 금지.**
- `app/api/debug/naver` — 요청당 상류 8콜, 게이트 뒤 유지(삭제 검토 대상).
- 배포 확인에 UI 한글 문자열 grep 금지(React가 span 분할) → JSON 필드/status로. UI 확인은 프로덕션 URL로.
- 프로덕션 API는 필드명 먼저 확인(경제지표는 `.macro`).
- **엣지 근거 없이 진입 신호로 읽히는 UI 금지** · **파라미터 바꿔가며 통과 조합 찾기 금지** · 이관 기능의 엣지 주장 무검증 이식 금지.
- `git push` 전 `git fetch && git rebase origin/main` 습관 유지(다중 세션 병행 대비).
- 🆕 **목록 행·입력 필드를 렌더 함수 안의 컴포넌트로 정의 금지** — 리마운트로 포커스·입력 유실(플래너·검색 시트에서 두 번 당함). 함수 호출 또는 모듈 레벨로.
- 🆕 **관심목록을 `useSyncedList` 거치지 않고 localStorage 직접 쓰기 금지** — 화면 간 동기화 깨짐.
- 🆕 **메뉴·탭을 페이지에 하드코딩 금지** — `lib/menu.ts`만 고칠 것.
- 🆕 **u-tabs(sticky 서브탭)는 콘텐츠 컨테이너의 직계 자식이어야** sticky가 동작. BottomSheet는 portal로 띄울 것.
- 🆕 **참고 디자인의 상용 에셋(아이콘·일러스트·이미지) 복사 금지.**
- favicon·아이콘 등 정적 자산만 바꿔도 push 전 `npm run build`.
- 🆕 **크론의 data 커밋 트리에서 `vercel.json` 빼지 말 것** — 빼면 15분마다 Vercel 실패 배포 + 일일 한도(100) 소모.
- 🆕 **텔레그램 "kospi lab" 그룹에서 `@cirin0913_bot`(표시명 cirin) 내보내지 말 것** — 전송 전부 실패. 이 봇은 posteady와 공용이라 **봇 토큰 재발급(revoke)도 금지**(posteady 알림까지 끊김).
- 🆕 **Actions 시크릿 `BITGET_*`·`SUPABASE_*`·`KL_TELEGRAM_CHAT_ID` 삭제 주의** — 지워도 에러 없이 **조용히** 감시·규율 알림만 사라짐(원인 찾기 어려움).
- 🆕 **색·테마를 페이지에 하드코딩 금지** — `globals.css` 토큰/`@theme`를 쓸 것. 옛 `#f04452`·`#3182f6`·토스 라이트 값 재도입 금지. hex 일괄 치환 시 **기업·코인 로고색(#1428A0·#A50034·#F7931A 등) 건드리지 말 것**.
- 🆕 **라이트 모드·테마 토글 재도입 금지**(디자인 재결정 없이) — 토큰이 `:root, html.dark` 동일값이고 `html.dark`가 정적이라, 토글을 되살려도 라이트 값이 없음.
- 🆕 **`python3`/`python` 명령 금지** — 이 PC에선 Store 스텁이라 멈춤. `py` 사용.

---

## 12. ❌ 보류 / 구조적 한계
- ❌ 온체인 거래소 유입출 정확값 — CryptoQuant·Glassnode 유료. 대량 이체로 근사(✅ 고래 감지는 무료 구현).
- ❌ 청산 히트맵(CoinGlass 유료). ✅ 실시간 청산은 브라우저 WS로 해결. ✅ 탭 무관 알림은 크론+텔레그램으로 해결(09-17 가동).
- ❌ Bitget 카피트레이딩·서버 WebSocket·주문(안전상 의도 제외) · 토스증권 API 없음 · KRX MDC(anti-bot).
- ❌ 청산가 정확 계산(티어별 상이) — MMR 0.5% 근사 + 거래소 확인 고지.
- ❌ 이벤트 방향 예측 — 변동성 관점·진입 차단으로만.
- ❌ 성장주 점수 백테스트 — 과거 시점 컨센서스 없음.
- ❌ 펀딩 전략 추가 검증 — 펀딩 히스토리 90일 상한.
- ❌ DXY ICE(98.79) — 무료 소스 없음(Yahoo ^DX-Y.NYB delisted), FRED 광의로 대체. 트리거: 무료 ICE 소스 발견 시.
- ❌ 해외 종목 시가총액 — Yahoo 배치 응답에 대부분 null → "—" 표시. 트리거: 무료 시총 소스 확보 시.
- 🆕 ❌ **기분 미기록·목표 이탈 텔레그램 알림** — 기분(`kospi-lab-trade-mood`)·목표 입력이 **브라우저 localStorage 전용**이라 크론이 못 봄(앱 안 켜면 "미기록"이 돼 잔소리성). 트리거: 두 키를 `/api/sync` 동기화 목록에 추가할 때.
- 🆕 ❌ 해외 전용 분석 엔진(수급·공시·거시) — 무료 소스 없음 → `/overseas-analysis`는 지표 요약까지만.
- 🆕 ❌ 해외 전체시장 등락 랭킹 — 무료 랭킹 소스 없음 → 수록 종목 기준.
- 🆕 ❌ 디자인 원본 폰트 Jokker·Matter — 상용(Matter는 TRIAL) 라이선스. 트리거: 라이선스 구매 시.
- 🆕 ❌ 텔레그램 ID 조회 봇(@MyIDBot·@RawDataBot) — 그룹 privacy로 무응답. 대안: 알림봇 토큰으로 Actions에서 getUpdates.
- 🆕 ⏸ Chrome 확장(claude-in-chrome) 미연결 시 브라우저 조작 불가 → 헤드리스 Chrome 스크린샷으로 대체(§5).
- 정정 기록: 파생 백테스트는 가능했음(08-07 확인, 단 5분 해상도 2일치 한계).

---

## 13. 용어
| 대화 속 이름 | 실제 |
|---|---|
| 주식2 / 주식3 / 주식4 (세션) | 이 프로젝트(kospi-lab) 작업 세션 이름(주식3 = 09-28, 주식4 = 09-28~30) |
| ~~인사이트~~ | ~~하단 탭(오늘의 리스크·뉴스·매매 대원칙)~~ — 09-29 해체(오늘의 리스크 삭제, 나머지 더보기) |
| 더보기 도구 | 전체메뉴 시트의 `EXTRAS`(관심종목·종목 비교·리포트·매매일지·뉴스·대원칙 등) |
| 간단 / 분석 | 시세 목록 행 버튼: 간단=`/screener` 재무 스냅샷, 분석=`/stock-analysis`·`/overseas-analysis`·`/coin-analysis` 심화 |
| 종목 비교 | `/screener`(구 "버핏 스크리너") |
| 규율 알림 | 크론의 서킷브레이커·손절 미설정·주간 복기 텔레그램 알림 |
| kospi lab 방 | 텔레그램 전용 그룹(chat id는 `KL_TELEGRAM_CHAT_ID` 시크릿), 봇 @cirin0913_bot |
| Copilot 디자인 | style.refero.design의 Copilot Money `DESIGN.md`(사용자 Downloads) 기반 다크 테마 |
| 기분 | 매매일지의 매매별 진입 당시 심리 6종(`lib/tradeMood.ts`) |
| 자산 허브 / 실적 카드 | `/assets` 한 화면 · 실적=거래소 청산 요약(7/30/90) |
| 전체보기 | 자산 하단 버튼 → 계좌상세·전체성과·매매일지 시트 |
| 3모드 | `lib/coinSignalModes.ts` SCALP/SWING/POSITION |
| 옛 엔진 | `lib/coinAnalysis.ts` |
| 셸 | `BottomNav`(3탭)+`Header`(앱바)+`NavTabs`(u-tabs/데스크탑 알약) |
| 드릴 화면 | 상세 경로(`DETAIL_PREFIXES`) + 메뉴에 없는 경로(더보기 도구·분석 등) — 앱바가 뒤로가기형, 제목은 `drillTitle` |
| N차 | CHANGELOG 차수(현재 74차) |
| data 브랜치 | 크론 스냅샷 전용 브랜치(`data/coin-signals.json` + `vercel.json`) |

---

## 14. 디렉토리 구조
```
kospi-lab/
├── middleware.ts                  # 게이트(§6)
├── app/globals.css                # ★ 디자인 토큰(Copilot 다크) + @theme 팔레트 재매핑
├── lib/menu.ts                    # ★ IA 단일 소스(3탭 + EXTRAS)
├── lib/cache.ts                   # 공용 TTL+LRU
├── lib/{tradeMood,tradeReport}.ts # 🆕 매매일지 기분·월별 집계
├── lib/{coinSignalModes,coinAnalysis,stockAnalysis,circuitBreaker,tradeGate,targetPlan,leakage,...}.ts   # 47
├── hooks/useSyncedList.ts · useTradeMood.ts🆕 + use*Watchlist 등   # 17
├── components/
│   ├── BottomNav·Header·NavTabs·MenuSheet·SearchSheet·HomeMenu   # 셸
│   ├── ui/ (BottomSheet·ActionSheet·Collapsible)
│   ├── detail/ (PriceChart·SwipeNav) · fin/ · home/
│   └── WatchRow(actions 슬롯)·EventRow·SourceStatus·... (총 53)
├── app/ (30 pages · api 50 routes)   # 🗑 09-29 today 삭제
│   ├── stock/[ticker] · overseas/[symbol] · crypto/[symbol]   # 상세 3종
│   ├── overseas-analysis🆕 · journal♻️ · screener(종목 비교) · assets · principles
│   └── coins · futures · performance · calendar · news · ...
├── tests/{engine,target,autopsy,cache,tradeReport}.test.ts   # 148
├── scripts/ (12 — 백테스트·검증·coinTrack.mts=크론 알림)
├── .github/workflows/coin-track.yml   # 15분 크론 · data 브랜치 커밋
└── PROJECT_STATUS.md · CHANGELOG.md · COMPLETENESS.md
```

---

## 15. 다음 세션 시작 문구 (복붙용)
> "KOSPI LAB(C:\Users\GB\Documents\kospi-lab) 이어서 할게. PROJECT_STATUS.md 읽고 §0 확인 — 깨끗하면 실기기(APK v1.0.1) 확인이나 COMPLETENESS 재점검, 아니면 §4에서 고를게. 디자인은 **Copilot Money 다크 전용**(globals.css 토큰·@theme 재매핑, 페이지에 색 하드코딩 금지, 상승 Coral #ff4433·하락 Signal Blue #1c6cff, 본문 300), 메뉴는 lib/menu.ts 단일 소스 **하단 3탭(홈·시장·자산) + 더보기 도구**, 분석은 목록 행 **간단(/screener)·분석(심화)** 버튼, 매매일지는 코인선물 전용(청산이력+현재포지션+기분+월별). 텔레그램 알림은 크론(coin-track.yml)이 'kospi lab' 그룹으로 보냄 — data 커밋의 vercel.json 유지. 검증은 npm test(148)+npx tsc --noEmit+npm run build(네트워크 필요), 배포 확인은 gh api repos/cslis07/kospi-lab/commits/<sha>/status. 로컬 dev는 Turbopack이 못 뜸 → next start + 헤드리스 Chrome으로 확인."
