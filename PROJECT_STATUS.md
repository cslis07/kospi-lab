# KOSPI LAB — Project Status

> **마지막 업데이트: 2026-10-20** (주식9 세션 — **① 코인 분석 UI 재구성·팝업화·섹션 점검 ② 모든 메뉴를 홈 대시보드(fin-card) 스타일로 통일 ③ 물가 허브·더보기 도구를 하나의 대시보드로 통합(`/tools` 신설) ④ 경제 캘린더 강화(월간 달력·다음 발표 카운트다운·지난 발표 서프라이즈). 전부 push·배포, 1440/390px 라이트 헤드리스 실측**) — 요약:
> - **코인 분석(`/coin-analysis`) 재구성**(6234836~86ce1bd): 진입 판단=추천 진입가(entryPlan)+짧은 시나리오+**상세보기 토글**(단기신호·가격대 사다리·롱숏 양방향·체크리스트·분봉표·피보나치), 섹션 순서 이미지대로, **서킷브레이커 '정상' 숨김**, 뉴스·청산/고래 **3초 회전 티커**(`RotatingTicker`). 진입 판단·시간대별·흐름·거시·리스크·매매일지는 **상단 버튼→BottomSheet 팝업**. 점검 반영: **룰엔진 성적표 제거**(앱이 '진입 근거로 쓰지 말라'한 지표)·**종합판단 슬림화**(레버리지·경고만 리스크 패널로)·오더북 유지.
> - **'모든 메뉴 홈처럼'**(150459e~86ce1bd): 홈 네이버 금융 디자인(`fin-card`/`fin-sec`/`fin-row`/`fin-chip`)로 국내·해외·자산·성과·매매일지·종목 분석·더보기 도구(brief·invest·simulate·tax·virtual·releases·screener 등)·코인 분석·물가 허브 중성 카드 일괄 통일(랭킹/산업/지표/테마ETF/리서치는 이미 fin 섹션 재사용). 메뉴 7개 숨김(`MenuItem.hidden`)·상단 내비에 '더보기' 알약(→`/tools`, 물가 알약은 제거).
> - **대시보드 통합**(e6fa34d·a0ac5b8): `/inflation` 허브에 **Fed·발표일정·고용·예측시장 라이브 요약 카드 + 물가 도구 전체 그리드**로 18하위를 한 화면. **`/tools` 신설**(더보기 도구 대시보드: 경제지표·경제캘린더·뉴스 위젯 + 도구 전체 그리드).
> - **경제 캘린더 강화**(e3c79eb·ac11670·c73b5bc, **Nowflation 로컬클론 `mcp/nowprice-local` 참고**): `EconCalendarMonth`(월간 달력 그리드·오늘 강조·모든 지표 발표일 칩)·`NextReleases`(다음 발표 라이브 카운트다운+컨센서스·나우캐스트·직전)·`PastReleases`(지난 발표 실제 vs 컨센서스 서프라이즈). `/calendar`·`/tools`에. 정적 `CALENDAR_EVENTS` + `release_calendar.json`·`econcal_window.json` 병합.
> - 원칙 그대로: **"예측·매매 신호 아님"**(엣지 없음 측정). nowflation 데이터 **CC BY 4.0 출처 표기 유지**.
> (직전 10-19: nowflation 클론 A~F 이식 = `/inflation` 6그룹 18페이지 허브. 상세는 CHANGELOG.)
> **위치:** `C:\Users\GB\Documents\kospi-lab`
> **GitHub:** `cslis07/kospi-lab` · 기본=현재 브랜치 `main` · ⚠️ **저장소 공개(public)** · 커밋은 `Co-Authored-By: Claude Opus 4.8` 포함(이 레포 관행)
> **배포:** [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel `cslis07` · **git push → 자동 배포** · 함수 리전 **icn1(서울, `vercel.json`)** · 배포 성공 시 `warm-cache` 워크플로가 CDN 캐시 채움
> **APK:** TWA(배포 URL 로드형 — 콘텐츠는 배포 즉시 반영). packageId **`app.kospilab.twa`**. 서명키 `Documents\키스토어\kospi-lab-twa.jks`(비번 메모리 `reference_kospi_lab_twa_apk`). 최신 `Documents\KOSPILAB_v1.0.1.apk`(v1.0.1/code 2) · 다음 재빌드 code 3. 이번 세션 변경 전부 웹 → **재빌드 불필요**
> **외부 서비스:** Supabase `zsjdilispaoqlcdywxky`(공용, 이 앱은 `kl_sync` 하나) · 텔레그램 봇 `@cirin0913_bot`(posteady 공용) → **"kospi lab" 그룹 `chat_id -5009047152`** · Google AI Studio(Gemini) · ~~OpenAI~~(10-01 삭제) · Vercel 크론용 env(CRON_SECRET·TELEGRAM_BOT_TOKEN·TELEGRAM_CHAT_ID, §6) · **CRON_SECRET 10-13 교체** · 🆕 **`APP_ACCESS_TOKEN`**(`/api/nf`·분석 게이트, `.env.local`+Vercel, §6) · 🆕 **nowflation 데이터 출처 `nowprice-local`→nowflation.com 중계**(§10·§12)
> **규모:** API 라우트 ~71 · 페이지 **66**(page.tsx, `/inflation` 허브 18 포함) · lib ~73(신규 없음·`lib/inflation.ts` 대폭 확장) · components ~60(신규 `MarketBenchmark`·`inflation/InflationNav`·`InflationChart(Lazy)`·`NowcastStrip` 등) · tests 18파일 중 `inflation.test.ts` **27 케이스** · 인베스팅 수집 `public/data/investing/` 27종
> **기록 문서:** [CHANGELOG.md](CHANGELOG.md)(161차까지) · [COMPLETENESS.md](COMPLETENESS.md)(6차 2026-10-07 ~86% — 주식8·9 기능 미반영). 상태 파일 `project-state.json`(자동관리, 커밋 안 함). 중복 서술 안 함

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — 미커밋 0(PROJECT_STATUS.md만, 규칙상 커밋 안 함) · 미푸시 0 · stash 0. HEAD `c73b5bc` = main·origin/main 동일, Vercel 자동 배포 완료(이번 세션 전 커밋 전부 push·배포, 헤드리스 실측까지 끝냄). 게이트: **tsc 0 · build 0 · test 통과**. 검증: 로컬 `next start` + **헤드리스 CDP**(1440·390px 라이트, 쿠키 `kl_auth`=APP_ACCESS_TOKEN 시드, `?symbol=ETHUSDT&run=1`, `/api/sync` 차단. 메모리 `reference_headless_cdp_audit`) + 실데이터 대조.
> 🧹 작업트리에 **빈 파일 `n`**(untracked, 0바이트·실수 생성) 하나 있음 — 무해, `rm n`으로 지워도 됨(이번 세션 산출물 아님, 규칙상 손 안 댐).
> ⚠️ **헤드리스 검증 시 `next start` 서버가 콜드면 `/api/nf/*` 첫 중계가 10초+ 걸려 pulse 미로드→드릴다운/카드 안 뜸.** 이번 세션에 이걸로 헛검증 몇 번 함. **먼저 `curl -H "x-app-token: <APP_ACCESS_TOKEN>" .../api/nf/pulse.json` 등으로 relay 워밍** 후 페이지 열 것.

### 이번 세션(10-20)에 끝낸 것 — 전부 push·배포 (커밋 ~c73b5bc)
- **코인 분석 재구성·팝업화·점검**(6234836~86ce1bd): 진입 판단 추천가+상세보기 토글(단기신호·가격대 사다리·롱숏·체크리스트·분봉표·피보나치), 섹션 순서 이미지대로, 서킷브레이커 '정상' 숨김, 뉴스·청산/고래 3초 회전 티커. 흐름·거시·리스크·매매일지·진입판단·시간대별 → 상단 버튼 BottomSheet 팝업. 점검 반영: **룰엔진 성적표 제거·종합판단 슬림화(레버리지·경고만 리스크 패널로)·오더북 유지**.
- **모든 메뉴 홈 fin-card 통일**(150459e~86ce1bd): 국내·해외·자산·성과·매매일지·종목 분석·더보기 도구·코인 분석·물가 허브 중성 카드 → `fin-card`/`fin-sec`/`fin-row`/`fin-chip`. 메뉴 7개 숨김(`MenuItem.hidden`), 상단 '더보기' 알약(→`/tools`).
- **대시보드 통합**(e6fa34d·a0ac5b8): `/inflation` 허브 라이브 요약 카드+도구 그리드 / **`/tools` 신설**(경제지표·캘린더·뉴스 위젯+도구 그리드).
- **경제 캘린더 강화**(e3c79eb·ac11670·c73b5bc): `EconCalendarMonth`(월간 달력)·`NextReleases`(카운트다운+컨센서스·나우캐스트·직전)·`PastReleases`(실제 vs 컨센서스 서프라이즈). `/calendar`·`/tools`에.

### 🟢 다음 채팅 — 깨끗한 상태, 급한 것 없음. 남은 다듬기(§4) 중 택1:
- **달력 날짜 클릭 → 그날 일정 상세(바텀시트)** 열기(현재 월간 그리드는 보기 전용).
- `/tools` 대시보드에 **매매일지 성적·가격 알림 요약 위젯** 추가.
- nowprice-local의 다른 페이지(고용·경기침체·GDP 나우캐스트)도 참고해 지표 보강.
- **MarketBenchmark 단위 테스트**(가장 쉬움): `IndexReturnGrid`·`MonthlyCompare`·`renderMine` 분기.
- ⚠️ 재개 시 작업 디렉토리 **kospi-lab 확인**(이전 세션들 change_directory 거절 이력 — 절대경로로).

**이전 후보(여전히 후순위):** 인베스팅 예측 갱신 / COMPLETENESS 7차(주식8·9 미반영) / `/inflation`·`/api/nf` warm-cache 워밍(콜드 지연 해소).

### 🔴 사용자가 직접 해야 할 것
- 📊 **Vercel Cron Jobs 탭** — `/api/econ/alert`·`/api/brief/telegram` 2개 등록 확인(CLI `vercel crons ls`로 10-13 확인 완료, Hobby 2개 한도에 딱 맞음). ※ Supabase Cron(pg_cron)과 혼동 주의 — 거기 `rhythmlog-*`는 리듬로그 것.
- 🔋 **Anthropic 크레딧 충전** — AI 종목·코인 분석·복기 코치 비활성(400 크레딧). 충전 시 코드 변경 없이 복구(홈 브리핑은 Gemini라 영향 없음).
- 🔑 봇 토큰은 posteady 공용이라 노출 인지(교체 부담). ~~CRON_SECRET 노출~~ **10-13 교체 완료**. Gemini 키 교체 검토.
- 📱 실기기 확인(복기 카드·새 /simulate·/releases 폰 표시) · 텔레그램 "kospi lab" 그룹 봇 내보내지 말 것 · 분석 페이지 잠금 해제(브라우저 1회, §6).
- ⏸ KRX API 키 재발급 — 사용자 보류(수용 리스크).

**남은 결정(사용자 몫):** ① 옛 코인 엔진 vs 3모드 엔진 은퇴 ② `/principles` '오늘의 리스크' 2곳 ③ `/growth` 정리.

### 🔬 엔진 엣지 측정 결과 — 이 프로젝트의 가장 중요한 사실
**측정 가능한 엣지가 어디에도 없다.** 코인 727건 49.7%·파생 407건 48.4%·펀딩 되돌림=하락장 베타·3모드 81건 41.7%·주식 362건 54.1% < 대조군 54.8%(상승장 베타). 스크립트 `scripts/backtest-{lab,deriv,modes,stock-lab}.ts`·`validate-funding.ts`. → UI 전체를 "신호"가 아닌 **리스크 도구**로 정의. 🟡 감사 잔여: M-7 trigger 방향 미기억 · M-8 저널 R 회계 · 옛 훅 스키마 버전 없음.

---

## 1. 프로젝트 목적
**국내·해외 주식 + 코인 + 선물 통합 투자 리스크 관리 앱.** 방향 판단은 사용자, 앱은 손절·사이징·청산가·기록·복기. 코인 작업 정본(08-21 coin-signal 이관).
- 08-07 "지금 사도 되나" → "얼마나 걸고 어디서 끊나"(엣지 없음 측정) · 09-16 매매 규율 도구 · 09-29 Copilot 다크 + 하단 3탭 · 09-30 **시장 정보 포털화**(네이버 금융/증권 구성).
- 10-01: 속도·실시간 최우선 → 캐시 원칙 섹션별로 갈림. 복기 도구 강화.
- 10-01~04: **매매일지를 복기 분석 허브로**(TraderSync·Edgewonk 비교). "엣지 없음"을 역으로 살려 방향 예측은 안 만들고 사후 복기·규율 진단·공부법(`/study`)에 집중.
- 🆕 **주식5(102~106차): 아침 시장 맥락 + 복기 심화.** 모닝 브리핑(`/brief`)·텔레그램 발송으로 "아침에 시장 한눈에"(사용자 요청). "예측 확률 높여달라" → 지어내지 않고 **과거 통계로 측정해 보여줌**(결과: BTC·S&P 우연, 코스피는 시가 갭 반영 — 매매 우위 없음). 매매일지에 출금·요일시간대·목표선·확신 추가.
- ⚠️ 정직성 원칙: 못 하는 걸 하는 척 안 함. 소스 없는 필드는 대체 기준을 **화면에 명시**. 목표가는 애널리스트 의견, 쏠림 기준선은 "앱 기준선·매도 권유 아님", 알림은 "앱 열려 있을 때만".
- 스택: Next.js 16 App Router · React 19 · TS · Tailwind v4 · SWR · Recharts(지연 로딩). 로그인 없음(localStorage + 선택 클라우드 동기화).

---

## 2. 현재 구현된 기능

### 홈 `/` ✅ (`components/home/naver/*`, `app/page.tsx`)
| 블록 | 내용 | 데이터 |
|---|---|---|
| 지수 레일 | 코스피·코스닥·USD·S&P500·나스닥·다우, 10초 갱신 | `/api/home/indices` |
| 중앙 보드 | 1일/1개월/3개월/1년 · 라인/캔들 · 호버 · 시장현황 · 52주 · 투자자 · 프로그램매매(로딩 자리 실측 높이) | `/api/home/board` |
| AI 브리핑 | 국내/해외/코인 탭 × **Gemini 카드 1개**, 1시간 주기 | `/api/home/briefing` |
| 뉴스 | 해외 주요 뉴스(하단) · 최근 소식=국내(사이드) | `/api/news` |
| 인기/관심 | 🆕 인기=**네이버 실시간 인기(조회 많은 순, 20초)**, 실패 시 KRX 전 거래일 · 관심=watchlist | `/api/home/status` |
| 시장 섹션 5종 | 실시간 랭킹→산업 트렌드→리서치→테마 ETF→환율·시장지표 — **모든 폭**, 섹션별 800px 앞 지연 마운트, 출처 문구 노출 | `/api/naver/*` |

### 🆕 모닝 브리핑 `/brief` ✅ (주식5, EXTRAS·홈 DEFAULT_QUICK·sitemap 등록, 아이콘 `sunrise`)
- 증시 탭 3(코인·국내·해외). 각 탭: **지금 수치**(선행/시장/금리유가/코인수급 묶음, `/api/brief/macro` 1분 폴링·네이버 실시간) + **AI 요약**(Gemini, 수치 자동 대조·근거 없는 숫자 문장 제외) + **과거 통계 표**(`/api/brief/edge`, 요인 급변 다음날 상승비율 vs 대조군·시가→종가 분리·사전 고정 판정) + 전쟁/지정학 + 관련 뉴스(코인은 CoinDesk·The Block 등 해외 전문매체 우선) + 오늘 일정.
- 텔레그램: 아침 07:30 KST 자동 발송(§7). 🆕 **정본=Vercel 크론 `/api/brief/telegram`**("kospi lab" 그룹 -5009047152). 로직은 공용 `lib/briefTelegram`(📊시장지표+증시별 핵심·뉴스 5건+지정학/정치 ⚠️/🏛). 미리보기 `/api/brief/telegram?dry=1`(Bearer) 또는 `BRIEF_TG_DRY=1 npx tsx scripts/briefTelegram.mts`.

### 🆕 주식7 신규 페이지 (✅배포)
- **`/macro`** — 경제지표(FRED): CPI·PPI·달러지수(DTWEXBGS)·유가(WTI)·원달러(DEXKOUS). 실제·이전·전월(전일)대비·YoY·히스토리 차트(`MacroChart`)·발표일정·코인/주식 영향. `lib/macroData`·`/api/macro/indicators`. 예측(컨센서스)은 무료 소스 없어 생략.
- **`/releases`** — 지표 발표 이력(인베스팅 27종, `public/data/investing/*.json`): 지표 선택+연도 필터+**결과 추이 차트**(`ReleaseChart`, 1/2/5년·최대 토글·호버 날짜/결과/예측/이전)+인베스팅 스타일 표(결과 색=예측 상회 파랑/하회 빨강)+**서프라이즈→다음날 BTC·S&P·코스피 반응**(`lib/releaseReaction`·`/api/macro/daily`). `?id=` 딥링크. /macro↔/releases 상호링크.
- **`/study/reentry`** — 진입 전 7문항 + 손절 후 재진입 프로토콜(STOP 60분 타이머→MAP→CLOSE→RETEST→RISK). "신호 아님·규율 도구".
- **`/simulate` 강화** — 코인 레버리지: 진입가(기준가) 직접 입력, 메이커/테이커 수수료+펀딩 실손익 토글, 리스크 역산(손절가→권장 증거금·청산여유 경고), 청산가 Bitget 공식.

### 🆕 실시간 물가 허브 `/inflation` ✅ (주식9, nowflation 클론 A~F 이식)
게이트 뒤(잠금 해제 기기만 수치 표시, 공개 라우트라 UnlockGate 대신 조용히 숨김). 데이터 전부 `/api/nf/*` 중계(실패 시 `seed/nf/` 48개 스냅샷 폴백). 공통 `app/inflation/layout.tsx` + `components/inflation/InflationNav.tsx`(6그룹 가로 서브내비·`SECTIONS` 단일 소스). 각 페이지 `components/InflationChartLazy`(Recharts, kind=compare/forecast/trend/price). 모두 "예측·매매 신호 아님" 명시.
- **게이지**(`/inflation` 루트): 나우캐스트 vs 공식 CPI 게이지·추이·품목 기여 드릴다운(막대 클릭→바텀시트: quilt 24/48/102개월 토글·전체 CPI 게이지 오버레이 토글·sparks 12개월 폴백).
- **오늘 왜**(`/why`)·**CPI 격차**(`/gap`)·**vs Truflation**(`/truflation`)·**리드 테스트**(`/lead`).
- **예측 스코어보드**(`/scoreboard`)·**발표 일정**(`/calendar`, 앱 `/calendar`와 역할 구분)·**예측시장**(`/markets`)·**Fed watch**(`/fed`).
- **데일리 브리핑**(`/brief`, 앱 모닝 `/brief`와 별개)·**발표일 분석**(`/analysis`, nextprint→`print_<월>.json`)·**경제 기사**(`/articles`, 외부 링크).
- **품목별 가격**(`/prices`)·**장바구니**(`/cart`, 이 기기 저장 `kospi-lab-inflation-cart`).
- **고용**(`/jobs`)·**경기 열지수**(`/heatcheck`)·**인플레 히트맵**(`/quilt`).
- **인플레 계산기**(`/calculator`)·**내 물가**(`/my`, 비중 조정 `kospi-lab-inflation-myweights`)·**방법론**(`/methodology`).

### 🆕 더보기 도구 대시보드 `/tools` ✅ (주식9 후반) — 상단 '더보기' 알약이 연결
흩어진 보조 도구를 한 화면에: **경제지표 미니**(`/api/macro/indicators` CPI·달러·유가·원달러) + **경제 캘린더 위젯**(아래) + **최신 뉴스**(홈 `HomeNews` 재사용) + **도구 전체 그리드**(EXTRAS 아이콘, hidden 제외). 각 섹션 `fin-sec` 헤더+전체보기 드릴다운.

### 🆕 경제 캘린더 강화 ✅ (주식9 후반, `/calendar`·`/tools` 공용 컴포넌트, Nowflation 참고)
- **월간 달력**(`EconCalendarMonth`): 그리드·오늘 강조·prev/next, 정적 `CALENDAR_EVENTS`(FOMC·한은·실적·휴장) + `release_calendar.json` 미국 지표 발표일 칩 병합·범례.
- **다음 발표 카운트다운**(`NextReleases`): 가까운 발표(CPI·PCE·고용…)별 라이브 D-N·HH:MM:SS(datetime_utc 또는 date+13:30Z=08:30 ET) + 컨센서스(street)·나우캐스트(nowflation_forecast)·직전(prior).
- **지난 발표 서프라이즈**(`PastReleases`): `econcal_window.json` 미국 High/Medium 중 actual·estimate 있는 과거 발표, 서프라이즈=실제−컨센서스(상회 빨강/하회 파랑)·직전. "매매 신호 아님".
- `/calendar` 기존 분류 칩·필터 바텀시트·날짜별 묶음 카드는 유지(위 3종이 상단에 추가됨).

### 🆕 홈 대시보드(fin-card) 디자인 전 메뉴 통일 ✅ (주식9 후반)
홈 네이버 금융 디자인(`fin-card` 24px 라운드·헤어라인·`fin-sec` 헤더+전체보기·`fin-row` 상승 빨강/하락 파랑 좌측 바·`fin-chip` 변화 배지)을 국내·해외·자산·성과·매매일지·종목 분석·더보기 도구·코인 분석·물가 허브까지 확장. 색상 상태 카드(경고·체제 보드 등)는 그대로. 메뉴 7개 숨김(리포트·품목별 가격·장바구니·경기 열지수·인플레 계산기·내 물가·방법론 — `MenuItem.hidden`).

### 메뉴 (`lib/menu.ts` 단일 소스)
- 하단 3탭: 홈 · 시장(국내·해외·코인·선물·산업 트렌드·실시간 랭킹·시장지표·테마 ETF·리서치) · 자산 `/assets`. 상단 내비에 '더보기' 알약(→`/tools`).
- 더보기 도구(EXTRAS): 모닝 브리핑 `/brief`·관심종목·종목 비교·리포트·매매일지·가격 알림·뉴스·경제 캘린더·🆕 **경제지표 `/macro`**·🆕 **지표 발표 이력 `/releases`**·매매 대원칙·공부법 `/study`·🆕 **진입·재진입 체크리스트 `/study/reentry`**·가상투자·투자설계·세제·시뮬·증권사.
- 🆕 **매매일지 `/journal`(복기 분석 허브, 코인선물 Bitget 청산 기준)** — 아래 전부 이번 세션. 성과 `/performance`는 R 기록 기준(청산 시각·손절·규모 없음 → 해당 탭/카드 자동 숨김).
  - **성적 요약**(승률·손익비·Profit Factor·기대값·평균 익절/손절·손익분기 승률) · **비용 분석**(매매손익→수수료→펀딩→순손익, 번 돈 중 비용 몫·뒤집힌 매매·실효 수수료율·보유시간별 비용).
  - **손익 분해 표 탭 7개**: 요일·시간대·종목·**롱/숏**·**보유시간**(스캘핑~포지션)·**손절 유무**·**진입 규모 분위수**. 좁은 화면은 탭 줄 가로 스크롤.
  - **자산 곡선+MDD**(Recharts, `next/dynamic`만) · **일별 손익 달력**(날짜 클릭→그날 매매→행 클릭 편집) · **연속 승/패 스트릭** · **연패 직후 매매**(틸트) · **하루 매매 횟수**(과매매).
  - **MAE/MFE**: 매매 편집 시트 건별 + 요약 카드(버튼 실행, 결과 기기 저장). 캔들 = 공개 `/api/candles`(Bitget, 200봉 상한·429 레이트리밋 대응). 손절가 있는 매매만 R 환산. 🆕 **'지켰으면 손실 아니었을 매매' 건별 목록**(진입가·최고 유리가·청산가, 104차).
  - **셋업·실수 태그**(positionId 오버레이) → 태그별 성적 · **차트 스냅샷**(IndexedDB, 기기 저장·동기화 제외).
  - 🆕 **비용 분석 › 출금**(104차): Bitget 입출금 자동 조회(`/api/bitget/transfers`), 도착금액=보낸금액−출금수수료(실계좌 210.5/58.5/83.5 일치). 비용 기간은 날짜 명시("2026.9.6~10.6").
  - 🆕 **복기 3종**(106차): **요일×시간대 히트맵**(`WeekdayHourHeatmap`) · **자산곡선 월 목표선**(월 목표 USDT 입력→목표선 겹침+페이스) · **확신(1~5)별 성적**(`ConvictionCard`, 복기 시트 확신 셀렉터).
- **코인 기초 공부법 `/study`** (더보기 도구): 개요 + `/study/{chart,indicators,fibonacci,macro}` 4과정 + SVG 그림 13종(`components/study/*`, `lib/studyData` 가상 데이터·실제 지표 공식). 방향 예측 아님 명시.
- **자산 `/assets` › 보유 주식 비중**: 종목/업종 도넛 + 경고선(종목 25%·업종 40%). **가격 알림 `/alerts`** + 전역 `PriceAlertWatcher`(앱 열렸을 때 30초, 한 번 울리면 꺼짐).
- 테마: 기본 다크 + 라이트 토글(`kl-theme`). 기존 기능(분석·성장주·KRX·동기화 등)은 CHANGELOG 참고.

### "이상해 보이지만 정상"
- 해외 지수 한국 낮엔 '장마감' · 시장지표 일부 '10분 지연'(네이버 표기) · 시장 섹션 배지는 **평일 09:00~15:30만 '실시간'**(공휴일 판단 못함, 값은 원본 그대로).
- AI 브리핑은 탭별 1시간에 한 번 생성 · Gemini 과부하 땐 폴백 모델명 또는 "○분 전 요약".
- **배포 직후 첫 방문만 느릴 수 있음**(CDN 비워짐 — warm-cache가 1~2분 내 채움).
- 한글은 **기기 기본 폰트**(Pretendard 아님 — 10-01 결정, 예전에도 실제로는 적용된 적 없음).
- 가격 알림: **앱이 열려 있을 때만** 확인(서버 푸시 아님). 기준 넘은 상태에서 다시 켜면 **곧바로 다시 울리고 꺼짐**(정상).
- 목표주가 카드 클릭 = **네이버 리포트 새 탭**(앱 종목 상세 아님). 증권사 로고 자리는 이름 첫 글자 배지.
- 국내/해외 목록은 처음 40행만 — 스크롤하면 추가. 분해 표의 흐린 칸 = 표본 5건 미만.
- 미국 테마 ETF=거래대금 순, 코인 '인기'=거래대금 기준(화면 명시). 투자의견은 한국어로 통일.
- 🆕 **손절 걸어둔 매매가 전부 손실(승률 0%)** = 손절이 작동해 손실로 끊긴 것(나쁘다는 뜻 아님, 손절 탭에 명시).
- 🆕 **MAE/MFE가 봉 3개보다 짧은 매매는 '근사'** 표기(진입·청산 봉 전체 범위 섞임, 실제보다 크게 나올 수 있음). 손절가 넘은 역행 = 손절 옮겼거나 근사.
- 🆕 **MAE/MFE 요약은 버튼 눌러야 계산**(캔들 조회 비용 때문). 공부법 그림은 '설명용 가상 데이터'(실제 시세 아님).
- 🆕 **브리핑**: 수치는 네이버 실시간(0~15분 지연, 기준 시각 표기)이 주력 — FRED는 1~5영업일 늦어 폴백·과거통계 전용. 국내 탭은 아침에 코스피가 '개장 전'(전일 종가)이라 변화 0%일 수 있음. 과거 통계가 '유의'여도 "시가 갭에 반영 — 장중 우위 없음" 각주가 붙으면 그게 결론. **룰 엔진 성적표의 숏 0건은 상위 추세 역행 차단 때문**(숏 불리 아님, 화면에 집계).

---

## 3. 수정한 주요 파일

### 🆕 2026-10-20 ("주식9" 후반) — 홈 대시보드 통일·물가/더보기 통합·경제 캘린더 강화
| 경로 | 역할 |
|---|---|
| `app/coin-analysis/page.tsx` ✏️ | 진입 판단 추천가+상세보기 토글·롱숏 양방향·섹션 재배치·버튼 BottomSheet 팝업(진입판단·시간대별·흐름·거시·리스크·매매일지)·종합판단 슬림화·룰엔진 성적표 제거·9개 중성 카드 fin-card |
| `components/DerivFlowCompact.tsx` 🆕 | 파생 수급 정밀 요약(헤더 옆 배치용 컴팩트 카드) |
| `components/ui/RotatingTicker.tsx` 🆕 | 3초 회전 티커(뉴스·청산/고래) + 펼침. `.mfade` 재사용 |
| `components/{CircuitBreakerBar,WhaleLiquidationPanel}.tsx` ✏️ | '정상' 상태 숨김(early return) / `symbol` 필터 + RotatingTicker |
| `components/NavTabs.tsx` ✏️ | NAV_GROUPS에 '더보기' 알약(단일 → `/tools` Link), 물가 알약 제거 |
| `lib/menu.ts` ✏️ | `MenuItem.hidden` 추가·7개 숨김, FLAT이 hidden 제외, `/tools` OWN_H1_ROUTES·drillTitle |
| `app/tools/page.tsx` 🆕 | 더보기 도구 대시보드(경제지표 미니+경제캘린더 위젯+HomeNews+EXTRAS 그리드) |
| `app/inflation/page.tsx` ✏️ | 허브 통합: fedwatch·labor·release_calendar·predmarkets 라이브 요약 카드 + 물가 도구 전체 그리드 |
| `components/EconCalendarMonth.tsx` 🆕 | 월간 달력 그리드(`CalEvt` tone fomc/bok/ind/earn/holi, 오늘 강조·이벤트 칩·prev/next) |
| `components/NextReleases.tsx` 🆕 | 다음 발표 라이브 카운트다운(`relTs`=datetime_utc 또는 date+13:30Z) + 컨센서스·나우캐스트·직전 |
| `components/PastReleases.tsx` 🆕 | 지난 발표 서프라이즈 표(US High/Medium, actual−estimate, 상회 빨강/하회 파랑) |
| `lib/inflation.ts` ✏️ | `ReleaseEvent`에 `datetime_utc?`·`preview_url?` 추가 |
| `app/calendar/page.tsx` ✏️ | NextReleases(상단)+EconCalendarMonth(월간)+PastReleases(서프라이즈), release_calendar·econcal_window SWR, CALENDAR_EVENTS 병합 |
| `app/{domestic,overseas,assets,performance,journal,stock-analysis,brief,releases,screener,my-stocks,invest,tax,simulate,brokerage,virtual}/page.tsx`·`components/MacroDetail.tsx` ✏️ | 홈 fin-card/fin-sec/fin-row/fin-chip 일괄 통일(중성 카드만, 색상 상태 카드 유지) |

*(2026-10-19 "주식9" 전반 nowflation A~F 이식 = `lib/inflation.ts` 대폭 확장·`app/inflation/*` 6그룹 18페이지·`components/inflation/*`·`MarketBenchmark`·`NowcastStrip` — 상세는 CHANGELOG 148~161차)*

### 🆕 2026-10-12~13 ("주식7") — 시뮬 강화·경제지표·인베스팅 수집·발표 알림
| 경로 | 역할 |
|---|---|
| `lib/positionSizing.ts` ✏️ | `isolatedLiqPrice` Bitget 나눗셈형+taker로 승격(단일 소스), `notionForRisk` 비용 차감, `liqSafety` taker |
| `lib/circuitBreaker.ts` ✏️ | `perTradeLossLimitUsdt`(1회 손실 한도) 추가 |
| `app/simulate/page.tsx` ✏️ | 진입가 직접 입력·메이커/테이커 수수료+펀딩 실손익·리스크 역산·청산가 단일화 |
| `app/study/reentry/page.tsx` 🆕 | 진입 7문항+재진입 프로토콜(STOP 60분 타이머) |
| `lib/newsFeeds.ts` ✏️ | `fetchGenews`(글로벌이코노믹 list.php HTML 파싱, international) |
| `lib/macroData.ts` 🆕 · `app/api/macro/indicators/route.ts` 🆕 · `app/macro/page.tsx` 🆕 · `components/MacroChart(Lazy).tsx` 🆕 | 경제지표 FRED 페이지(CPI·PPI·DXY·WTI·원달러) |
| `app/releases/page.tsx` 🆕 · `public/data/investing/*.json`(27종+index) 🆕 · `scripts/buildInvestingIndex.mjs` 🆕 | 지표 발표 이력(인베스팅 수집) + 색인 |
| `components/ReleaseChart(Lazy).tsx` 🆕 | 결과 추이 차트(기간 토글·호버 툴팁) |
| `lib/releaseReaction.ts` 🆕 · `app/api/macro/daily/route.ts` 🆕 | 서프라이즈→다음날 반응(BTC·S&P·나스닥 FRED+코스피 네이버 일별) |
| `lib/econAlert.ts` 🆕 · `app/api/econ/alert/route.ts` 🆕 · `vercel.json` ✏️ | 경제지표 발표 텔레그램 알림(FRED last_updated 기반, 크론) |
| `lib/menu.ts`·`app/sitemap.ts` ✏️ | /macro·/releases·/study/reentry 등록(EXTRAS·sitemap·OWN_H1_ROUTES) |
| `tests/{releaseReaction,econAlert}.test.ts` 🆕 · `engine.test.ts`·`package.json` ✏️ | 순수함수 테스트(총 16파일) |

### 🆕 2026-10-07 ("주식6") — 거시 배경·복기 허브·브리핑 정시화·지정학 뉴스
| 경로 | 역할 |
|---|---|
| `lib/coinMacroContext.ts` 🆕 | 10년물·실질금리·DXY 같은 방향 판정(순풍/맞바람/엇갈림). 룰 점수엔 미반영. 테스트 9 |
| `lib/brief.ts` ✏️ | WAR_RE 확장(공격·드론·피습·보복…)+`POLITIC_RE` 신설(트럼프·무역전쟁·셧다운), `newsScore`가 지정학·정치 점수화, `NewsTag`에 `geo` |
| `lib/briefTelegram.ts` 🆕 | 브리핑 텔레그램 메시지 빌드·발송 공용(fetch만). `scripts/briefTelegram.mts`(얇은 래퍼)·`/api/brief/telegram` 공용 |
| `app/api/brief/telegram/route.ts` 🆕 | Vercel 크론 발송 라우트(CRON_SECRET Bearer 보호, `maxDuration=60`) |
| `vercel.json` ✏️ | `crons: [{/api/brief/telegram, '30 22 * * *'}]`(regions icn1 유지) |
| `lib/tradeBreakdown.ts` ✏️ | `bandOf`·`rowKeyOf`·`notionalQuartileEdges`(드릴다운·히트맵 공용) |
| `lib/tradeTags.ts` ✏️ | `convictionBySetup/ByMistake/Coaching`·`tagDistribution`·`HIGH_CONVICTION` |
| `lib/journalAnalytics.ts` ✏️ | `goalLine(linear/stepped)` 월 목표선 |
| `components/{WeekdayHourHeatmap,BreakdownTables,EquityCurve,SetupConvictionCard,TagPicker,home/MyReviewLine}.tsx` | 드릴다운·계단식·교차카드·태그피커·홈 복기 한 줄 |
| `app/journal/page.tsx` ✏️ | 드릴다운·태그분포·구간CSV·확신 보정·기간 토글·상단 앵커 목차 + 섹션 id |
| `app/{coin-analysis,stock-analysis,performance}/page.tsx` ✏️ | 거시 배경 카드 / R-기록 인라인 태거(저장 직후 자동 펼침) / R 교차표·행 드릴다운·기간 토글 |
| `hooks/{useCoinJournal,useStockJournal}.ts` ✏️ | R-기록에 `setups/mistakes/conviction` 필드 |
| `app/study/macro/page.tsx` ✏️ · `app/page.tsx` ✏️ | 금리·달러 조합표 / 홈 `MyReviewLine` |
| `.github/workflows/brief-warm.yml` ✏️ | 'Send to Telegram' 스텝 제거(cutover) → CDN 워밍만 |
| `tests/{coinMacroContext,brief,tags,breakdown,journalAnalytics}.test.ts` | 순수함수 테스트 고정(14파일) |

### 🆕 2026-10-06 ("주식5") — 모닝 브리핑 + 텔레그램 + 일지 보강
| 경로 | 역할 |
|---|---|
| `lib/brief.ts` 🆕 | 브리핑 수치(네이버 실시간 `marketindex/bond`·`energy`·`index/.VIX`·`futures`·`exchange/.DXY`, FRED 폴백)·뉴스 `rankNews`(점수·중복제거·노이즈·매체상한)·`verifyAi`(AI 숫자 대조)·`fetchCryptoNews`(코인 해외 피드)·`buildBriefPrompt`·`tagOf`/`WAR_RE`. 테스트 40 |
| `lib/briefEdge.ts` 🆕 | 과거 통계 — 요인(美10Y·VIX·WTI·나스닥) 급변 다음 거래일 상승비율 vs 대조군, 판정 사전 고정(n≥30·\|z\|≥2.58·반분 일관)·시가→종가 분리. FRED 3년 일별 |
| `app/api/brief/{route,macro/route,edge/route}.ts` 🆕 | 요약(1h 캐시·inflight·stale) · 수치(45초) · 과거통계(6h) |
| `app/brief/page.tsx` 🆕 · `lib/menu.ts`·`app/sitemap.ts` ✏️ | 3탭 페이지 + EXTRAS(sunrise)·DEFAULT_QUICK·sitemap |
| `scripts/briefTelegram.mts` 🆕 · `.github/workflows/brief-warm.yml` ✏️ | 텔레그램 발송(시장지표+뉴스 중심) + 크론에 checkout·node·발송 스텝 |
| `lib/tradeCosts.ts` ✏️ · `app/api/bitget/transfers/route.ts` 🆕 · `components/CostCard.tsx` ✏️ | `cashFlow`(출금 도착금액) + 입출금 조회(90일 분할·게이트) + 출금 블록 |
| `lib/tradeBreakdown.ts` ✏️ · `components/WeekdayHourHeatmap.tsx` 🆕 | `weekdayHourHeatmap`(요일×시간대 교차) + 히트맵 |
| `lib/tradeTags.ts` ✏️ · `hooks/useTradeTags.ts` ✏️ · `components/ConvictionCard.tsx` 🆕 | `TradeTagSet.conviction`·`CONVICTIONS`·`convictionStats` + 확신 카드 |
| `components/EquityCurve.tsx` ✏️ | 월 목표선(점선)·목표 대비 페이스·`kospi-lab-monthly-target`(동기화) |
| `components/ExcursionSummaryCard.tsx` ✏️ · `lib/tradeAutopsy.ts` ✏️ | '지켰으면 손실 아니었을 매매' 건별 목록·`isGaveBack`·`peakPrice` |
| `app/coin-analysis/page.tsx` ✏️ · `lib/coinBacktest.ts` ✏️ | 시간대별 롱/숏 조건(`tfBias`·`TFSummary`)·성적표 과거기록 안내·숏0건 이유(`blocked`·`leanCounts`)·지지저항 터치 설명 |
| `tests/{brief,breakdown}.test.ts` 🆕 · `tests/{tags,costs,autopsy}.test.ts` ✏️ · `package.json` ✏️ | 순수함수 테스트 고정 |

### 이전 세션 요약 (상세 CHANGELOG)
- **주식4(10-01~04, 93~101차)** — 매매일지 분석 허브: `lib/journalAnalytics`(자산곡선/MDD·스트릭·edgeSummary·afterLossStreaks·tradesPerDay)·`tradeBreakdown`(byHoldBand·bySide·byStopPresence·byNotionalQuartile)·`tradeCosts`·`tradeAutopsy`(MAE/MFE)·`excursionFetch`·`tradeTags`/`useTradeTags`·`snapshotStore` + 공부법 `/study`(`studyData`·`components/study`) + `/api/candles` limit 200. 전부 테스트 고정.
- 주식3(09-30~10-01, 83~92차): 속도(icn1·withCdn·Recharts 지연·CLS)·시장 섹션 실시간·Gemini 단일·분해/CSV/알림/도넛. 주식2(09-30): 라이트 토글·네이버 홈·시장 메뉴 5종. 그 이전: IA 6탭·자산 허브·08-21 coin-signal 이관.

---

## 4. 남은 작업
### ~~🔴 1순위 — nowflation 로컬클론 병합~~ ✅ **완료 (2026-10-19, 주식9)**
A~F 전수 이식(1~4단계 전부 + 데이터셋 확장까지). `/api/nf/*` 중계+`seed/nf/` 48개 폴백·middleware 잠금·`/inflation` 6그룹 18페이지 허브·`/macro`·`/brief` 연결 완료. 상세 CHANGELOG 148~161차·§0·§2. **nowflation.com 중계는 실측으로 됨**(§12 보류 해소).

### ~~전 메뉴 홈 fin-card 통일 · 물가/더보기 대시보드 통합 · 경제 캘린더 강화~~ ✅ **완료 (2026-10-20, 주식9 후반)**
코인 분석 재구성·팝업화·점검 반영 / 전 메뉴 fin-card / `/tools` 신설 / `/inflation` 요약 카드 통합 / 월간 달력·카운트다운·서프라이즈 표(§0·§2·§3).

### 다듬기 (후순위, 전부 선택)
- [ ] **달력 날짜 클릭 → 그날 일정 상세(바텀시트)** (월간 그리드 현재 보기 전용)
- [ ] `/tools` 대시보드에 매매일지 성적·가격 알림 요약 위젯 추가
- [ ] nowprice-local 다른 페이지(고용·경기침체·GDP 나우캐스트) 참고해 지표 보강
- [ ] **MarketBenchmark 공용 컴포넌트 단위 테스트** (가장 쉬움)
- [ ] `/inflation`·주요 `/api/nf` warm-cache 워밍(콜드 첫 방문 지연, §0 경고)
- [ ] COMPLETENESS 7차(주식7·8·9 기능 미반영) · 두 코인 엔진 은퇴(사용자 결정)
- [ ] 히트맵 칸 드릴다운(TraderSync) · 확신×셋업 교차(Edgewonk) · 경제지표 자산 오버레이(TradingView) · 품목 오버레이 vs Truflation

### 개선 여지
- [ ] 거시 DXY를 네이버 `.DXY`로 교체 검토(§12 트리거 충족, 의도적 후순위)
- [ ] 미국 섹터 우선주 코드 → `/overseas/` 상세 링크 · 미청산 기분 승계 · `/assets` 30/90일 그래프 · 해외 시총 "—" · M-7/M-8 · `api/debug/naver` 제거 · KRX 채권/파생 활용신청

---

## 5. 실행 명령어
```bash
cd C:\Users\GB\Documents\kospi-lab
npm test                     # 전체(tests 13파일: engine·target·autopsy·cache·tradeReport·headings·insights·journalAnalytics·tags·study·costs·brief·breakdown)
npx tsc --noEmit             # 타입체크 (라우트 삭제 후 에러나면 rm -rf .next/types)
npm run build                # 빌드 — 네트워크 필요(next/font)
git push origin main         # = 배포 (+ warm-cache 워크플로 자동)
gh api repos/cslis07/kospi-lab/commits/<sha>/status   # 배포 성공 확인
```
- ⚠️ 로컬 `npm run dev`(Turbopack) 대신 **`npm run build && npx next start -p 3456`**(백그라운드). 서버 종료는 **포트 3456 PID만**(node 전체 kill 금지 — MCP까지 죽음).
- 실측: 헤드리스 Chrome **CDP 스크립트**(Node22 WebSocket만, 레시피 메모리 `reference_headless_cdp_audit`) — 390px·4G·CPU 4배·localStorage 시드·API 빈값 가로채기. 화면 캡처는 `chrome.exe --headless=new --screenshot` + `py`/PIL(경로 `C:/…`).
- 커밋 전: test·tsc·build → `git add <경로 지정>`(`-A` 금지) → `git diff --cached | grep -cE '<키 접두>'` 0.
- **스모크(재개 직후):** `curl -sI https://kospi-lab.vercel.app/api/naver/ranking?tab=value | grep -i x-vercel-id` → `icn1::icn1`이면 서울 리전 정상. 브리핑: `curl -s "…/api/brief?market=coin" | …`(ai.headline·macro 확인).
- 크론: `gh workflow run coin-track.yml` / `warm-cache.yml` / `brief-warm.yml`(텔레그램 발송·`telegram: 200 ok=true` 확인) → `gh run view <id> --log`.
- 🆕 **git push 500(Internal Server Error)**: 분기 아님(ahead 1). `gh auth setup-git`으로 git 자격증명을 gh 토큰과 재동기화하면 풀림(403과 다름 — 403은 계정 전환).
- 🆕 브리핑 텔레그램 미리보기: `BRIEF_TG_DRY=1 npx tsx scripts/briefTelegram.mts`(토큰 없이 메시지만 출력).

---

## 6. 배포·환경
- gh 두 계정 `cslis07`(소유자)·`histobio0302-oss`. push 403 → `gh auth switch --user cslis07 && gh auth setup-git`.
- Vercel 무료 배포 한도 100/일. data 브랜치 커밋은 `vercel.json`으로 배포 미생성(§8). 🆕 **배포마다 CDN 캐시 비워짐** → warm-cache.

### 환경변수 (이름만)
| 키 | 용도 | 설정된 곳 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 게이트(미설정 시 503) | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX(국내 TOP·대체 인기·상장정보) | 양쪽 · ⏸재발급 보류 |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART | Vercel만 |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기 전용 | 양쪽 + Actions Secrets |
| `ANTHROPIC_API_KEY` | 종목·코인 분석 AI, 복기 코치(홈 브리핑엔 안 씀) | 양쪽 |
| `GEMINI_API_KEY` | 홈 AI 브리핑(무료 티어, 유일한 브리핑 모델) | `.env.local` + Vercel production |
| ~~`OPENAI_API_KEY`~~ | 10-01 삭제(Vercel production + `.env.local`) — ChatGPT 제거 | — |
| `GEMINI_MODEL` | 모델 오버라이드(선택) | **미설정**(기본 `gemini-3.6-flash`) |
| `ECOS_API_KEY`·`FRED_API_KEY`·`CUSTOMS_API_KEY` | 한국은행·FRED·관세청 | 양쪽 |
| `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` | 클라우드 동기화 | 양쪽 + Actions Secrets |
| `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`·`KL_TELEGRAM_CHAT_ID` | coin-track 알림 | Actions Secrets (`KL_TELEGRAM_BOT_TOKEN` 비어 공용봇) |
| `CRON_SECRET`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` | **Vercel 크론**(브리핑 `/api/brief/telegram` + 🆕 **지표 알림 `/api/econ/alert`** — 둘이 같은 env 공용) | **Vercel Production**. `TELEGRAM_CHAT_ID=-5009047152`(그룹). 라우트는 `KL_TELEGRAM_CHAT_ID‖TELEGRAM_CHAT_ID`·`KL_TELEGRAM_BOT_TOKEN‖TELEGRAM_BOT_TOKEN`. **값 바꾸면 재배포해야 적용**. 🆕 **CRON_SECRET 10-13 교체**(rm+add+빈커밋 재배포, 이전 노출값 폐기, 새 값 Vercel에만·채팅 미노출·로컬 없음) |
| 🆕 `kospi-lab-monthly-target`(localStorage) | 자산곡선 월 목표(USDT) | 브라우저·cloudSync 동기화(기기 간) |
- 키 등록은 **파일에서 파이프(stdin, 끝 줄바꿈 제거)** → `vercel env add <KEY> production`. 변경은 **재배포해야 적용**. 목록 확인은 `vercel env ls`(값 안 나옴).

### git에 없는 필수 로컬 파일
`.env.local`(16키) · `Documents\키스토어\kospi-lab-twa.jks` · `Documents\키스토어\kospilab-twa-manifest.json` · `Documents\KOSPILAB_v1.0.1.apk` · `project-state.json`(다른 도구가 관리, gitignore — 지우지 말 것)

### 게이트·리전·캐시
- `middleware.ts` 게이트: `/api/bitget/*`·`/api/analyze`·`/api/stock-analysis`·`/api/coin-analysis`·`/api/debug/*`·`/api/sync`·`/api/coach`. 홈·네이버·시세·업종 라우트는 공개(의도).
- **함수 리전 = `vercel.json` icn1**. 라우트별 `preferredRegion`은 무료 요금제에서 무시(실측 `icn1::iad1`). 확인은 `x-vercel-id` 두 번째 값.
- **캐시 원칙(10-01 확정)**: 시세(시장 섹션·인기)=`LIVE` no-store + CDN 5~15초·**swr 없음** · 홈 지수/보드/뉴스/KRX/리포트=짧은 신선 + 긴 swr(`withCdn`) · 개인·게이트 라우트=캐시 금지.
- `/api/home/briefing` `maxDuration=60` · 분석 라우트 30초.

---

## 7. 무인 실행되는 것
| 이름 | 주기 | 역할 | 끄는 법 |
|---|---|---|---|
| `.github/workflows/warm-cache.yml` | 프로덕션 배포 성공 시 1회(`deployment_status`) | 공개 API 20여 개·화면 9개 호출해 CDN 캐시 채움 | `gh workflow disable warm-cache.yml` |
| **Vercel 크론 `/api/brief/telegram`** | 매일 07:30 KST(`vercel.json crons` `30 22 * * *`, Hobby는 ±1h) | **모닝 브리핑 텔레그램 발송**(정본). "kospi lab" 그룹(-5009047152). CRON_SECRET Bearer 보호 | Vercel 대시보드 Crons 탭에서 비활성, 또는 `vercel.json` crons 제거 |
| 🆕 **Vercel 크론 `/api/econ/alert`**(주식7) | 평일 07:00 KST(`0 22 * * 1-5`) | **경제지표 발표 알림** — FRED `last_updated` 26h 이내면 '방금 발표'로 보고 "kospi lab" 그룹 발송(CPI·근원CPI·근원PPI·산업생산·수입물가 MoM+신규/연속 실업청구 건수). 상태저장 없음(1일1회+window로 중복방지), 발표 없는 날 미발송. CRON_SECRET 보호. `?dry=1` 미리보기·`?all=1` 강제전부 | `vercel.json` crons 제거 또는 대시보드. ⚠️ Hobby 크론 2개 한도(이것+브리핑으로 꽉 참) |
| `.github/workflows/brief-warm.yml` | 매일 07:30 KST(`30 22 * * *`) | 🆕 **CDN 워밍만**(텔레그램 발송 스텝 제거=cutover). 3시장 미리 생성 | `gh workflow disable brief-warm.yml` |
| `.github/workflows/coin-track.yml` → `scripts/coinTrack.mts` | 15분(지연·누락 잦음) | 스캘프 판정·포지션 감시·규율 알림 → 텔레그램 "kospi lab", data 브랜치 커밋(트리에 vercel.json) | `gh workflow disable coin-track.yml`. ⚠️ 저장소 비활동 시 자동 비활성 이력 → `gh workflow list` |
- 가격 알림 감시(`PriceAlertWatcher`)는 **브라우저 안**에서만 — 앱을 닫으면 멈춤. AI 브리핑·네이버 데이터도 크론 아님(요청 시).

---

## 8. 최근 발생한 에러와 해결 (누적)
| 증상 | 원인 | 해결 | 날짜 |
|---|---|---|---|
| 🆕 **인베스팅 서버/curl 접근 403**(지표 이력) | Cloudflare가 데이터센터·자동화 IP 차단. WebFetch는 되지만 기본 10행만(더보기=POST 클릭 불가) | **Claude for Chrome 확장**으로 사용자 브라우저에서 '더보기' 반복→blob 다운로드→`public/data/investing/*.json` 정적 저장. 재수집 레시피 메모리 `reference_investing_scrape_chrome` | 10-12 |
| 🆕 **Chrome 2번째 자동 다운로드부터 차단** + 같은 파일명 재다운로드 `(1)` 접미사 | 브라우저 보안(멀티 다운로드 권한) | 사이트 '자동 다운로드' 1회 허용 + **완전히 펼친 뒤 한 번만** 다운로드 | 10-12 |
| 🆕 **지표 알림 CPI YoY가 인베스팅과 어긋남**(FRED 3.7 vs 인베스팅 3.4) | FRED CPIAUCSL은 **계절조정(SA)**, BLS/인베스팅 헤드라인 YoY는 **NSA(CPIAUCNS)**. SA로 YoY 계산하면 틀림 | 인베스팅 수집본과 전수 대조해 **일치하는 MoM(SA)·건수만** 알림 포함. YoY(NSA 불일치)·소매 control group(시리즈 불일치) 제외. 근원 PPI는 PPIFES | 10-13 |
| 🆕 **FRED `last_updated` 파싱 실패(isFresh 항상 false)** | FRED 오프셋 형식 `-05`(분 없음)을 `Date.parse`가 못 읽음 | `-05`→`-05:00` 보강 후 파싱(`lib/econAlert.isFresh`) | 10-13 |
| 🆕 **PowerShell에서 `curl -s -H` 실패**(SessionVariable 오류) | PS의 `curl`은 `Invoke-WebRequest` 별칭 | `curl.exe` 또는 `Invoke-RestMethod -Headers @{Authorization=...}` 사용 | 10-13 |
| 🆕 **CRON_SECRET 값 Vercel에서 확인 불가** | Vercel은 env를 암호화 저장, 생성 후 값 조회 불가(이전 채팅에 평문 붙여넣음) | §6대로 **교체(rm+add+재배포)**가 정답. 10-13 새 값으로 교체 완료(채팅 미노출) | 10-13 |
| 🆕 **Vercel env 추가했는데 라우트 503(CRON_SECRET 미설정)** | Vercel env는 **추가만으론 미적용 — 재배포 필요**(기존 배포는 옛 env) | 빈 커밋 push로 재배포 트리거 → 401(인증 요구)·dry ok=true | 10-07 |
| 🆕 **공용 봇 getUpdates 항상 0건**(그룹 id 못 뽑음) | 봇이 posteady 공용이라 **다른 폴러가 업데이트 소비** + 봇 **privacy mode ON**(그룹 일반 메시지 안 보임) | `@getidsbot`을 그룹에 넣어 chat_id -5009047152 확보. getChat으로 확인 | 10-07 |
| 🆕 **Vercel 브리핑이 그룹 아닌 DM으로 감** | `KL_TELEGRAM_CHAT_ID` 대신 `TELEGRAM_CHAT_ID=8710847228`(='시린' DM)을 넣음 | Vercel `TELEGRAM_CHAT_ID`를 그룹 `-5009047152`로 변경+재배포 → 그룹 수신 확인 | 10-07 |
| 🆕 **`next start` ENOENT prerender-manifest.json** | `.next` 빌드 산출물 불완전(중단·경합) | `npm run build` 재실행하면 생성됨 | 10-07 |
| 🆕 **git push → remote rejected (Internal Server Error 500)** | git HTTPS 자격증명이 gh 토큰과 어긋남(GitHub·계정·권한은 정상) | `gh auth setup-git` 후 재시도 성공 | 10-06 |
| 🆕 **브리핑 WTI가 $96 인데 실제 $90** | FRED는 1~5영업일 지연치 | 표시 수치를 네이버 실시간으로, FRED는 폴백·과거통계 전용 | 10-06 |
| 🆕 **CNBC "geopolitical" 뉴스레터가 3섹션 전부 ⚠️ 반복** | `WAR_RE`가 "geopolitical" 느슨 매칭 + 전쟁 강제 프리펜드 | 텔레그램은 war 프리펜드 제거(랭킹 뉴스만), `tagOf`에서 `treasury SPAC`는 금리 아님 | 10-06 |
| 🆕 **코인 뉴스가 국내 매체로만 참** | 일반 금융 RSS엔 코인 기사 드묾 | CoinDesk·Cointelegraph·Decrypt·The Block RSS(`fetchCryptoNews`) 추가·최신순 | 10-06 |
| 🆕 ⚠️ **(미확인) 주식9 헤드리스 시드가 kl_sync로 유출됐을 수 있음** | /inflation은 게이트라 검증에 `kl_auth` 쿠키가 **필수** → 켠 채 `kospi-lab-crypto-watchlist`(BTC·ETH·SOL)·`kospi-lab-coin-journal`·`kospi-lab-stock-journal`에 **가짜 데이터 시드**(chksort·chkperf·chkbm). 이 3키는 SYNC_EXCLUDE 아님 → `useCloudSync`가 kl_sync로 올렸을 가능성(94차와 동일 메커니즘). **확인/정리 필요**: 실기기에서 관심코인·코인/주식 매매일지에 BTCUSDT·ETHUSDT·SOLUSDT·삼성전자(005930) 가짜 기록이 섞였는지 보고, 있으면 삭제. (헤드리스 프로필은 매번 새로 버려지지만 **서버 kl_sync는 공용**이라 전파 가능.) | 미해결(2026-10-19) |
| **테스트 시드가 사용자 클라우드로 유출** | 헤드리스 검증에 잠금 쿠키(`kl_auth`)를 넣으면 `useCloudSync`가 켜져 `kospi-lab-*` 전 키를 동기화 → 94차 때 심은 테스트 태그 3건이 `kl_sync`에 업로드됨 | 사용자 승인 후 빈 값으로 덮어 정리(10-04). 재발 방지: 시드 검증은 **쿠키 없이**(동기화 잠김), 메모리 `env_kospi_lab_headless_sync_pollution`. ⚠️ 단 /api/nf 게이트 페이지는 쿠키가 필수라 이 수칙과 충돌 — **시드 키를 SYNC_EXCLUDE에 임시 추가하거나 시드 없이 relay만 확인할 것** | 10-04 |
| **MAE/MFE 캔들 44건 중 25건 429** | Bitget 공개 API 동시 3건이면 Too Many Requests | 요청 시작 간격 220ms + 429 재시도 3회(`lib/excursionFetch`) | 10-04 |
| **캔들 999 요청하면 빈 결과** | Bitget history-candles 최대 200봉(40053) | `/api/candles` limit 상한 200 | 10-04 |
| MAE/MFE 문구 오독 | "손절 직전까지 몰렸음"·"−178% 챙김" | "기록된 손절가 넘어 역행"·"손실로 청산"으로 수정 | 10-04 |
| **가격 알림이 한 번도 안 울림** | 종목 상세가 `kospi-lab-alerts`에 저장만, 가격 확인 코드 없음 | `PriceAlertWatcher`(30초·한 번만) + `/alerts` | 10-01 |
| 캘린더가 사라짐 | 유일한 진입점(홈 '주요 이벤트')이 09-30 홈 개편으로 빠짐 | 더보기 도구에 추가, 홈 tabExtra 제거 | 10-01 |
| 창을 줄이면 홈 시장 섹션 5종 안 뜸 | `min-width:1024px`에서만 마운트, 배율 150% 노트북=CSS 960px | 모든 폭 + LazyMount, 중간 폭 레이아웃·헤더 넘침(768~1023) 수정 | 10-01 |
| 목표주가 카드 구분 안 됨 | 라이트에서 카드 #f6f7f9·상자 #eef1f5 거의 같은 색 | 라이트 카드 흰 바탕+테두리, 상자 `--surface` | 10-01 |
| 실시간 갱신 시각이 한 번씩 건너뜀 | CDN `stale-while-revalidate=5`로 폴링 2번에 1번 직전 응답 | 시세 라우트 swr 제거(`s-maxage`만) | 10-01 |
| 시장 섹션 첫 화면 최대 하루 묵음·테마ETF/리서치 갱신 없음 | 데이터 캐시+CDN+긴 swr 3겹, 폴링 없음 | `LIVE` no-store·CDN 5~15초·폴링 10~30초 | 10-01 |
| Pretendard 빌드 경고("@import must precede") | Tailwind v4 `@import "tailwindcss"` 뒤의 `@import url()`은 빌드에서 빠짐(적용된 적 없음) | `@import` 삭제, 웹폰트 미사용 결정(용량 2배 실측) | 10-01 |
| 09-30~10-01(주식3) 다수: CLS·로딩 5초·40행 멈춤·리서치 카드·Gemini 503·국내 뉴스 0·52주 최저·차트 잘림·data 브랜치 등 | 각 원인 상이 | icn1·withCdn·CSS미디어쿼리·thinking minimal·네이버 뉴스 JSON·`/day?startDateTime` 등 | CHANGELOG 83~92차 |
| 그 이전(09-28 이하: 시장탭·셸·DART·favicon·백테스트 과대·키 유출) | — | CHANGELOG 참조 | 07-27~09-28 |

---

## 9. API 구조
**내부(공개):** `/api/home/{indices,board,briefing,status}` · `/api/naver/{industry,ranking,indicators,theme-etf,research}` · `/api/brief`(요약 1h)·`/api/brief/macro`(45초)·`/api/brief/edge`(6h) · `/api/stock/sectors` · `/api/news` · market·stock/*·overseas/*·crypto/*·krx/*·dart/*·coin-env·etf·whale·candles·search 등(`withCdn`). **게이트:** bitget/*(`transfers` 포함)·analyze·stock/coin-analysis·debug·sync·coach.
- 🆕 **`/api/brief/telegram`**(GET): Vercel 크론용 모닝 브리핑 발송. 미들웨어 게이트 밖(공개)이지만 **`CRON_SECRET` Bearer 자체 보호** — 미설정 시 503, 불일치 401. `?dry=1`로 발송 없이 메시지 미리보기. `maxDuration=60`.
- 🆕 브리핑 수치 네이버 엔드포인트: `api.stock.naver.com/marketindex/bond/US10YT=RR`·`US2YT=RR`·`energy/CLcv1`(WTI)·`exchange/.DXY`·`futures/NQcv1·EScv1/basic`·`index/.VIX/basic`. `.DXY`는 `marketindex/exchange/.DXY`(점 필수, `DXY`는 404).

| 외부 API | 키 | 함정 |
|---|---|---|
| **stock.naver.com `/api/...`**(비공식) | 무 | 번들 분석 경로(`lib/naverStock.ts` 헤더). 랭킹·산업·지표·테마 ETF·리서치·인기. 🆕 업종 전체표 = `rankings/v2/domestic/industries?size=100`(79개). 목표주가 API엔 **로고·업종 없음**(로고=`ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock{code}.svg`). 구조 변경 시 빈 값 → `[naver]` 로그 |
| 네이버 모바일/차트 | 무 | `m.stock.naver.com/api/stock/{code}/integration`의 `industryCode`(🆕 업종 판정) · 지수 basic/integration · 차트 `/day?startDateTime`(count 무시) · 뉴스 `api/news/list` |
| Gemini | 유(무료 티어) | 기본 `gemini-3.6-flash` → 3.1-flash-lite → flash-lite-latest → 3.5-flash. thinking이 출력 한도 소모 → minimal |
| ~~OpenAI~~ | — | 10-01 제거 |
| KRX | 유 | 활용신청·MKTCAP 원·**전 거래일** · 🆕 **GET 쿼리로도 동작**(데이터 캐시 가능), 시장당 2.6~2.9초 |
| KIS · ECOS · 관세청 · Bitget · SoSoValue · 온체인 · OKX · FRED · Yahoo | 유/무 | VTS `:29443`·토큰 1분 1회 · 문자열 % · XML · granularity·90봉 · ETF POST · FRED `"."` · crumb |
| Anthropic | 유 | 401 키/400 크레딧 · temperature 넣으면 400 |
| Telegram · Google Fonts · 기타 무키 | — | 추방 시 Forbidden · 빌드 시 네트워크 · alternative.me·업비트·Deribit·CoinGecko·BLS·Frankfurter |

---

## 10. 결정 기록 (코드로 역추적 불가)
- **색은 한국 관행 상승=빨강·하락=파랑**(라이트 동일). 🆕 차트·도넛 슬라이스는 빨강 제외(경고 전용).
- 디자인 참고는 구조만(상용 에셋 복사 금지) — 🆕 그래서 **증권사 로고는 이름 첫 글자 배지**(네이버 앱 내장 아이콘이라 URL 없음). 09-29 예외: Copilot 토큰 원본값.
- Copilot(09-29): Space Grotesk+Inter, 본문 300. 라이트 테마(09-30): 토글로 둘 다, 기본 다크(APK 스플래시 일관).
- 홈 네이버 스타일(09-30 단계별: 미리보기→모바일→데스크탑) · 모바일 아코디언 easing은 사용자 첨부 코드 그대로.
- **AI 브리핑**: Claude 홈 호출 제거 → Gemini·ChatGPT → 🆕 **10-01 Gemini 하나만**(ChatGPT 코드·키 삭제, Gemini 키 교체 안 함=수용).
- Gemini 키를 다른 프로젝트에서 복사하려다 권한 정책 차단 → 사용자가 직접 제공.
- 뉴스 분리(국내=사이드, 해외=하단) · 시장 메뉴 5종 = 시장 탭 하위(번들 정적분석으로 API 확정).
- **홈 시장 섹션 5종**: ~~PC(≥1024)만~~ → 🆕 10-01 **'어떤 상황에서도 노출'로 모든 폭**, LazyMount. 순서는 네이버 홈 배치.
- 목표주가·투자의견은 **애널리스트 의견으로만**. 🆕 **카드 클릭 = 네이버 리포트 상세**(사용자 지정 `stock.naver.com/research/company/{최신 nid}`), 카드 디자인은 네이버 캡처 기준.
- 🆕 **속도 우선(10-01)**: icn1 · warm-cache · Recharts 지연 · 40행 점진 · 프리페치 끔 · **Pretendard 미사용**(실측 화면당 300~500KB·용량 2배) · 검색 노출 차단(noindex, 개인용·네이버 데이터 재노출 방지 — sitemap은 색인 제거 가속용으로 유지).
- 🆕 **실시간 우선(10-01)**: 시장 섹션 시세는 캐시보다 신선도 — `LIVE` + 짧은 CDN + 폴링(랭킹·지표 10초, 산업·ETF 15초, 리서치 30초, 홈 인기 20초).
- 🆕 **91차 기준선**: 쏠림 경고 **한 종목 25%·한 업종 40%**(반토막 시 계좌 12.5% 선, 앱 기준·매도 권유 아님) · 가격 알림 **한 번 울리면 꺼짐**(TradingView '한 번만') · 분해 표 표본 **5건 미만 흐리게** · CSV는 BOM·KST·수식 주입 방지.
- 🆕 **10-01 결정 묶음**: 실기기 확인 완료 · Pretendard 미사용 · Gemini 단일 · 홈 섹션 출처 문구(축 9) · 미참조 컴포넌트 14개 삭제(git 이력으로 복구 가능).
- 🆕 **매매일지 분석 기능 선정 = TraderSync·Edgewonk 비교**(기준 앱 비교 원칙). 전부 **순수함수+테스트 고정 → Bitget 실데이터로 앱 코드 없이 독립 재계산 대조**(검증 표준).
- 🆕 **공부법은 '예측 기능' 안 만듦**: 엣지 없음 측정 + 기사는 사후 설명이라 예측은 과신→손실. 대신 요인 읽는 법·"오늘 위험 큰 날인가" 판단으로.
- 🆕 **진입 규모는 절대 금액 아닌 분위수**(계좌 규모·시드 변해도 '내 매매 중 크게 건 쪽' 유지). **MAE/MFE 단일 정의 `priceExcursion`**(숫자 두 벌 방지). **차트 스냅샷·MAE/MFE 캐시는 기기에만**(동기화 제외).
- 🆕 **브리핑(주식5)**: "예측 확률 높여달라" → 지어낸 확률 대신 **과거 통계로 측정**(`briefEdge`, 사전 고정 판정). 실측 결과 BTC·S&P 우연·코스피는 시가 갭 반영 → 매매 우위 없음을 화면에 그대로. 수치는 **네이버 실시간이 진실**(FRED 지연), 수치·요약 분리(요약 1h·수치 1분). AI 요약은 근거 숫자 자동 대조(`verifyAi`)로 환각 차단. 코인 뉴스는 해외 전문매체 우선.
- 🆕 **텔레그램 포맷(사용자 2차 피드백)**: 📊시장지표(유가·美국채금리·달러·VIX) 맨 위 + 증시별 핵심 한 줄 + 영향 뉴스 5건. 중복 숫자/출처 뺌, 같은 사건 중복 제거(핵심어 2개↑). `scripts/briefTelegram.mts`는 앱 import 없이 배포 API만 fetch(독립).
- 🆕 **월 목표선은 선형**(순손익 기준, 입금 정보 없음) · 확신은 자기 판단 보정용(방향 예측 아님) · 룰 성적표는 "과거 신호 기록"임을 명시(지금 방향 아님).
- 하단 3탭·분석 2단계·매매일지 코인선물 전용·텔레그램 범위 등 이전 결정 유지(CHANGELOG 66~74차). 크론 스냅샷=data 브랜치 · KRX 재발급 보류 · "무조건 수익" 거절.
- 🆕 **(주식7) 인베스팅은 공식 무료 API 없음·서버 403** → 예측(컨센서스) 포함 데이터는 **Claude for Chrome 확장으로 1회 수집해 정적 저장**(`/releases`), 자동 갱신 포기. `/macro`는 FRED(무료·공식)로 예측 없이 실제·추세만. 둘을 상호 링크.
- 🆕 **(주식7) 지표 발표 알림은 FRED MoM·건수만** — FRED 계산을 인베스팅 수집본과 전수 대조해 **일치하는 것만** 발송(YoY는 FRED SA≠인베스팅 NSA라 제외, 소매 control group 시리즈 불일치 제외). 틀린 숫자를 그룹에 보내지 않기 위함. 예측은 무료 소스 없어 결과·이전·변화만.
- 🆕 **(주식7) 서프라이즈 반응 타이밍**: 美 지표라 S&P·BTC는 발표 당일(offset0), 코스피는 다음 세션(offset1). 결과는 "경향"일 뿐 엣지 아님 명시(CPI 상회→위험자산↓는 뚜렷했으나 상관≠인과).
- 🆕 **(주식7) 청산가 공식 단일 소스** `lib/positionSizing.isolatedLiqPrice`(Bitget 고립 나눗셈형) — simulate 인라인 제거, "숫자 두 벌 방지" 원칙.
- 🆕 **(주식8) 해외 지수는 데이터만·투자자/프로그램/시장현황 숨김** — 네이버는 해외 지수 **분봉 미제공**(chart/foreign minute=빈배열)이라 1일 탭 없이 일봉만, 52주는 1년 일봉 max/min으로 계산(basic엔 없음). 투자자·프로그램·등락종목수는 해외에 해당 없어 숨김.
- 🆕 **(주식8) recharts 번들**: 이미 Next 기본 `optimizePackageImports`에 포함돼 tree-shake됨 → 설정 추가 무의미. 차트는 전부 dynamic 지연 로딩(첫 번들에서 제외)이 정답. 356KB 차트청크가 페이지별로 나뉘는 건 Turbopack 특성(완전 중복 아님).
- 🆕 **(주식8→9) nowflation 로컬클론 병합 결정(2026-10-15 승인) → ✅ A~F 전수 이식 완료(2026-10-19, 주식9)** — nowprice-local의 실시간 인플레이션 데이터 전부를 KOSPI LAB에 넣는다. 원칙 3가지: ① **혼자 사용 → 기존 잠금(`APP_ACCESS_TOKEN` 미들웨어, `/bitget` 패턴) 뒤에**(트레이드드레스 회피). ② **클론 픽셀복제 아님 — 데이터만 우리 디자인(Recharts)으로** 재구현(nowprice-local은 연구용으로 그대로 둠). ③ **스택 달라 '합치기' 아니라 '중계 재구현'**(클론=Python+ECharts6, 앱=Next+Recharts): `server.py`의 `/api/nf/<name>` 중계·캐시·`seed/nf/` 폴백을 Next 라우트로 포팅. **결과: `/inflation` 6그룹 18페이지 허브**(§2). 사용자가 중간에 "기능을 그대로 이식"으로 범위 확정 → nav.json 전수 조사 후 A~F 단계로 나눠 각 단계 승인받아 진행. 반복 UI는 지양(그룹 대표 페이지 위주), 소스 없는 것(세계경제 208국·century 100년)은 **명시적으로 제외**.

---

## 11. ⛔ 하지 말 것
- **시크릿 하드코딩 폴백 금지**(public 저장소) · **키 값을 로그·응답·커밋에 금지** — 커밋 전 키 접두 grep 0.
- **`vercel env pull` 절대 금지**(로컬 전용 키 삭제). `vercel env add`(stdin)·`vercel env rm`·`vercel env ls`만.
- **`git add -A` 금지**(`project-state.json` 등 섞임) — 경로 지정 add.
- 🆕 **`vercel.json` `regions: ["icn1"]` 지우지 말 것** — 지우면 iad1로 돌아가 한국 API 왕복(홈 5초).
- 🆕 **`PriceAlertWatcher`(레이아웃)를 "화면 없는 컴포넌트"라고 지우지 말 것** — 가격 알림의 유일한 확인 로직.
- 🆕 **`components/detail/chartLayout.ts`를 차트 파일로 합치지 말 것** — 상수 import만으로 Recharts가 페이지 번들에 딸려 옴. Recharts는 `next/dynamic`으로만.
- **시장 섹션 시세 호출에 데이터 캐시(`nget` revalidate>0)·CDN swr 다시 걸지 말 것**(실시간 요구) · **시장 섹션 5종을 화면 폭으로 숨기지 말 것**.
- **화면 폭 JS 판별로 레이아웃 바꾸지 말 것**(CSS로, 훅 초기값 모바일) · **`useSearchParams`를 본문 컴포넌트에 쓰지 말 것**.
- 🆕 **Pretendard 등 웹폰트를 `globals.css` `@import`로 넣지 말 것**(빌드에서 빠짐) — 넣으려면 먼저 용량 실측 수치를 사용자에게 보여 줄 것.
- 다른 프로젝트 키를 스크립트로 복사하지 말 것 · `APP_ACCESS_TOKEN` 삭제 금지(503) · `.env.local` 커밋 금지.
- `/api/kis/:path*` 통째 게이트 금지 · 코인 신호·시장환경·ETF·고래·캔들·홈·네이버·업종 라우트 게이트 금지.
- 배포 확인에 UI 한글 grep 금지(span 분할) → JSON/status · `git push` 전 `git fetch && git rebase origin/main`.
- 엣지 근거 없이 진입 신호로 읽히는 UI 금지 · 파라미터 튜닝으로 통과 조합 찾기 금지.
- 목록 행을 렌더 함수 안 컴포넌트로 정의 금지 · 관심목록은 `useSyncedList` · 메뉴·탭은 `lib/menu.ts`만 · 🆕 새 페이지에 `<h1>` 넣으면 `OWN_H1_ROUTES` 등록(테스트가 잡음).
- styled-jsx로 변수 JSX 레이아웃 금지 · 차트 `count` 기간 금지 · 국내 뉴스 RSS 의존 금지 · KRX 값 '실시간' 표기 금지.
- Gemini 기본 `flash-latest` 금지 · thinking 켠 채 낮은 출력 한도 금지 · AI 브리핑 1시간 캐시 줄이지 말 것.
- 크론 data 트리 `vercel.json` 빼지 말 것 · 텔레그램 봇 추방·토큰 revoke 금지 · Actions 시크릿 삭제 주의.
- 색·테마 하드코딩 금지(토큰/@theme, 로고색 예외) · u-tabs sticky 직계 자식 · BottomSheet portal · 정적 자산만 바꿔도 push 전 build.
- ~~라이트 모드·테마 토글 재도입 금지~~ 09-30 해제.
- `python3`/`python` 금지 → `py`(경로 `C:/…`) · 서버 종료는 포트 PID만.
- 🆕 **localStorage 시드가 필요한 검증은 잠금 쿠키(`kl_auth`) 없이** 할 것 — 쿠키 있으면 동기화가 켜져 시드가 사용자 클라우드로 올라감(§8). 쿠키 필요(Bitget 실데이터)하면 **읽기만**.
- 🆕 **새 `kospi-lab-*` localStorage 키는 '기기 간 동기화 vs 이 기기 캐시' 판단** — 캐시면 `lib/cloudSync.ts` `SYNC_EXCLUDE`에 추가(안 그러면 "기기에만 저장" 안내와 어긋남).
- 🆕 **`/api/candles` limit 상한 200 지우지 말 것**(Bitget 최대) · MAE/MFE·태그·스냅샷 계산식 바꾸면 `excursionFetch` VERSION·태그 캐시 올려 옛 캐시 버릴 것.
- 🆕 **브리핑 수치를 FRED로 되돌리지 말 것**(1~5일 지연) — 네이버 실시간 주력, FRED는 폴백·과거통계용 · **브리핑 과거통계 판정 기준(n≥30·\|z\|≥2.58·반분 일관) 튜닝 금지**(파라미터로 통과 조합 찾기 금지, 앱 원칙).
- 🆕 **코인선물 분석 화면 테스트는 `?symbol=XXXUSDT&run=1`**(run=1 없으면 자동 실행 안 함).
- 🆕 **모닝 브리핑 텔레그램 발송은 이제 Vercel 크론**(`/api/brief/telegram`) — `brief-warm.yml`에 'Send to Telegram' 스텝 **다시 넣지 말 것**(이중 발송). 발송 확인은 `curl -H "Authorization: Bearer <CRON_SECRET>" .../api/brief/telegram?dry=1`.
- 🆕 **`vercel.json` `crons` 지우지 말 것** — 브리핑+지표알림 2개(Hobby 한도 꽉 참) · **`/api/brief/telegram`·`/api/econ/alert` CRON_SECRET 보호 제거 금지**(그룹 스팸 방지).
- 🆕 **`public/data/investing/*.json`·`index.json` 지우지 말 것**(인베스팅 수집 스냅샷, 서버 재수집 불가·Chrome 확장으로만). 재색인은 `node scripts/buildInvestingIndex.mjs`.
- 🆕 **지표 알림에 YoY/소매 함부로 추가 금지** — FRED SA로 YoY 계산하면 인베스팅(NSA)과 어긋남(§8). NSA 시리즈 매핑 확인 후에만. `lib/econAlert.TRACKED`는 인베스팅 대조로 일치하는 것만 둠.
- 🆕 **`isolatedLiqPrice`(lib/positionSizing)는 단일 소스** — simulate/RiskPanel이 공유. 공식 바꾸면 테스트(engine)·양쪽 같이 확인.
- 🆕 **PowerShell에서 curl에 `-s/-H` 쓰지 말 것**(Invoke-WebRequest 별칭) → `curl.exe` 또는 `Invoke-RestMethod -Headers`.
- 🆕 **Vercel env 변경 후 반드시 재배포**(빈 커밋이라도) — 안 하면 기존 배포가 옛 env로 동작(503/엉뚱한 chat).
- 🆕 **지정학/정치 뉴스 RE(`WAR_RE`·`POLITIC_RE`) 넓힐 때 오탐 주의** — '공격적(aggressive)·드론 배송·공격수' 같은 비분쟁 표현은 안 잡히게 구체 표현만(테스트가 잡음).
- 🆕 **봇 토큰·CRON_SECRET을 채팅/로그/커밋에 쓰지 말 것** — posteady .env.local에서 Vercel로 직접 복사.

---

## 12. ❌ 보류 / 구조적 한계
- ❌ 온체인 거래소 유입출 정확값·청산 히트맵(유료) · Bitget 카피·주문(의도 제외) · 토스증권 API 없음 · KRX MDC(anti-bot).
- ❌ 청산가 정확 계산(MMR 근사) · 이벤트 방향 예측 · 성장주 점수 백테스트 · 펀딩 추가 검증(90일 상한).
- ~~⏸ DXY ICE — 네이버 `.DXY` 교체~~ **10-06 해결**: 브리핑 선행 지표로 `marketindex/exchange/.DXY` 사용(실시간). (시장지표 `/indicators` 화면 교체는 여전히 미적용 — 필요 시)
- ❌ 해외 종목 시총 대부분 "—" · 해외 전용 분석엔진 · 해외 목록 TOP 카드 전체시장 랭킹(시장 메뉴에선 해소).
- ❌ 기분 미기록·목표 이탈 텔레그램 — 트리거: `/api/sync`에 `kospi-lab-trade-mood` 추가 시.
- ❌ Jokker·Matter 상용 폰트 · 텔레그램 ID 조회 봇 · 네이버 '오늘아침 라이브' 영상 · 토론 버튼 · 해외 지수 분봉·환율 차트 · 미국 테마 ETF 1주 수익률·코인 '인기'(거래대금 대체).
- 🆕 ❌ **증권사 로고** — 네이버 앱 내장 아이콘(URL 없음) + 상용 자산 복사 금지 → 이름 첫 글자.
- 🆕 ⏸ **가격 알림 서버 푸시**(앱을 닫아도 알림) — 웹푸시(VAPID)+크론 필요. 트리거: 사용자 요청 시(리듬로그에 웹푸시 구현 사례 있음).
- 🆕 ⏸ **배포 직후 첫 방문 지연** — CDN 캐시가 배포마다 비워지는 Vercel 구조, warm-cache로 완화만.
- ~~⏸ ChatGPT 요약~~ 10-01 제거 · ⏸ Chrome 확장 연결 불안정 → 헤드리스 CDP로 대체(탭 백그라운드면 멈춤 주의).
- 🆕 ❌ **MAE/MFE 분 단위 정밀** — Bitget 캔들 200봉 상한이라 긴 보유는 봉이 굵어짐(`pickGranularity`로 자동 선택, 짧은 매매는 '근사'). 손절가는 44건 중 9건만 복구(SL 주문 있을 때만).
- 🆕 ❌ **공부법 그림에 실시간 시세** — 설명용 가상 데이터 고정(실제 종목 차트는 상세 페이지에서). 옵션(풋·콜)·거래소 전체 순유출 정확값은 유료라 외부 출처 안내만.
- 🆕 ⏸ **성과(기록 R) 매매일지엔 보유시간·손절·규모·MAE/MFE 없음** — 청산 시각·거래소 체결 정보가 없어서. 코인선물(Bitget)에서만 전체 분석.
- 🆕 ❌ **모닝 브리핑(텔레그램)에 '내 복기' 넣기** — 브리핑은 **서버 생성**인데 복기(확신 보정)는 **기기 localStorage 태그 + Bitget 개인 데이터**라 서버가 못 읽음. 그래서 홈(`MyReviewLine`, 클라이언트)에만 노출. 트리거: 태그를 서버(Supabase)에 동기화+서버에서 Bitget 읽기 구현 시(큰 변경·프라이버시).
- 🆕 ⏸ **지정학/정치 뉴스 반영(116차) 효과는 큰 뉴스 있는 날에만 확인 가능** — 조용한 날엔 ⚠️/🏛 안 뜨는 게 정상. 하루 모니터 필요.
- 🆕 ❌ **인베스팅 무료 API 없음 + 서버 접근 403** — 공식 무료 API 無, investpy 차단·ToS. `/releases` 데이터는 **수집 시점 스냅샷**(자동 갱신 불가). 갱신 트리거: Claude for Chrome 확장으로 재수집(레시피 메모리 `reference_investing_scrape_chrome`).
- 🆕 ❌ **인베스팅 예측(컨센서스) 자동 갱신 불가** — 무료 소스 없음. `/releases`·지표 알림의 예측은 2026-10-12 수집분까지만. 이후 발표는 예측 공란(알림은 결과·이전·변화만).
- 🆕 ⏸ **지표 알림에 YoY·소매판매 미포함** — FRED YoY는 NSA(CPIAUCNS 등), 소매 control group은 전용 시리즈라 인베스팅과 정확히 안 맞음(§8). 트리거: NSA 시리즈 매핑·control group 시리즈 확정하면 추가.
- 🆕 ⏸ **ADP주간(2025-10~)·GDPNow(2023-10~)·소매재고(일부)** — 신설/격주 지표라 인베스팅에 2021 이전 데이터 자체가 없음. 가용 기간만 수집(정상).
- ~~🆕 ⏸ **nowflation 중계 Vercel 차단 여부 미확인(2026-10-15)**~~ ✅ **해소(2026-10-19)** — nowflation.com 엔드포인트는 **Vercel/서버에서 fetch 됨**(인베스팅과 달리 차단 안 됨, 1단계 실측 통과). `/api/nf/[...name]` 라우트가 상류 fetch 성공 시 그대로(6h Data Cache), 실패 시 `seed/nf/` 48개 폴백. **남은 주의**: 게이트 뒤라 `no-store`(withCdn 금지) + 콜드 서버 첫 중계 지연(§0).

---

## 13. 용어
| 대화 속 이름 | 실제 |
|---|---|
| 주식2~9 (세션) | 사이드바 세션명(날짜순 아님). **주식9** = 이번(nowflation A~F 이식·허브 진입점·목록 정렬·성과 벤치마크·드릴다운 토글/오버레이, CHANGELOG 148~161차) · 주식8 = 시장지표↔경제지표 통합·해외지수 탭·ETH PDF · 주식7 = 시뮬·/macro·/releases · 주식6 = 107~118차 · 주식5 = 102~106차 |
| nowflation 로컬클론 · nowprice-local | `C:\Users\GB\Documents\mcp\nowprice-local`(포트 8799, Python `server.py`+ECharts6, nowflation.com 픽셀 복제·로컬 연구용). 데이터는 CC BY 4.0 중계+`seed/nf/` 48개 폴백. ✅ **주식9에 `/inflation` 허브로 A~F 전수 이식 완료**(§2·§10) |
| A~F 단계 | nowflation 기능 이식을 nav.json 기준 6묶음으로: A 게이지허브 · B 예측/Fed · C 브리핑/분석/기사 · D 가격/장바구니 · E 경제(고용·열지수·히트맵) · F 도구/사이트(계산기·내물가·방법론) |
| quilt / sparks | 품목 추이 소스. quilt=`quilt_months_{24,48,102}.json`(품목×월 yoy·bls_yoy, 길다). sparks=`compare.json`의 품목별 12개월(짧음, quilt 없을 때 폴백) |
| 시장지표 상세 시트 · 경제지표 그룹 · 해외지수 탭 | `/indicators` 카드 클릭→`BottomSheet`+`MarketIndicatorDetail`(live)/`MacroDetail`(FRED) · 경제지표=FRED+나스닥 · `IndexBoard` 나스닥/S&P500/다우(`US_REUTERS`) |
| 실전 체계 공부 · 가격별 손익 사다리 | `/study/execution`(다중시간봉·추세선·지표 줄이기·OI/CVD) · `/simulate` USDT탭 `quickRows`(실제가격 양방향+청산 행) |
| 지표 발표 이력 · 서프라이즈 반응 · 발표 알림 | `/releases`(인베스팅 27종, `public/data/investing/*.json`) · `lib/releaseReaction`(결과−예측 부호별 다음날 BTC·S&P·코스피) · `lib/econAlert`·`/api/econ/alert`(FRED 발표 시 텔레그램) |
| 경제지표 FRED 페이지 · 진입/재진입 체크리스트 | `/macro`(`lib/macroData`·`/api/macro/indicators`) · `/study/reentry`(진입 7문항+STOP 60분 프로토콜) |
| 진입가(기준가) · 실손익 · 리스크 역산 | `/simulate` 코인탭 — entry 수동입력 · 메이커/테이커 수수료+펀딩 반영 · `notionForRisk`(비용차감)·`liqSafety` |
| 모닝 브리핑 · 시장지표 · 과거 통계 · 선행 지표 | `/brief`·`lib/brief`·`briefEdge`(요인 급변 다음날 실측)·VIX/DXY/선물/장단기금리차·코인수급 |
| 요일×시간대 히트맵 · 월 목표선 · 확신 | `weekdayHourHeatmap`·`WeekdayHourHeatmap` / `EquityCurve` 목표선(`kospi-lab-monthly-target`) / `convictionStats`·`ConvictionCard`(1~5) |
| 출금 도착금액 · 롱숏 조건 | `cashFlow`(보낸−수수료) / `tfBias`·`TFSummary`(코인선물 분석) |
| 복기 분석 허브 · 손익비/PF · 포착률 · 틸트 · 과매매 | `/journal` 분석 카드들 · `edgeSummary` · MAE/MFE 요약(순행 챙긴 비율) · `afterLossStreaks` · `tradesPerDay` |
| MAE/MFE · underwater | 최대 역행/순행(`tradeAutopsy`·`ExcursionPanel`) · 자산곡선 아래 낙폭 띠 |
| 공부법 · 그림 13종 | `/study` 4과정 · `components/study/Diagrams`(가상 데이터 `lib/studyData`) |
| 화이트 버전 / 네이버 스타일 홈 | `html.light`+`ThemeToggle` / `components/home/naver/NaverHome` |
| 지수 레일 / 큰 차트(보드) / 접기 | `IndexRail` / `IndexBoard` / `Fold` |
| 시장 메뉴 5종 = 홈 시장 섹션 = PC 홈 섹션 | 산업 트렌드·실시간 랭킹·시장지표·테마 ETF·리서치(`components/naver/sections/*`, 홈은 `PcMarketSections` — 이름만 PC) |
| 실시간 배지 / 반짝임 | `LiveStamp` / `Flash`(`components/naver/ui.tsx`) |
| 목표주가 카드 | `ResearchSection`의 `GoalCard`(`.nv-gc*`) |
| 손익 분해 표 | `BreakdownTables` + `lib/tradeBreakdown` |
| 가격 알림 관리 / 알림 감시 | `/alerts` / `PriceAlertWatcher` |
| 보유 비중 도넛 / 쏠림 경고선 | `HoldingsConcentration` + `lib/concentration`(25%/40%) |
| 캐시 채우기 | `.github/workflows/warm-cache.yml` |
| 더보기 도구 · 간단/분석 · 규율 알림 · kospi lab 방 · 기분 · 자산 허브 · 3모드/옛 엔진 · N차 · data 브랜치 | `EXTRAS`·`/screener`/분석 3종·크론 알림·텔레그램 그룹(-5009047152)·`lib/tradeMood`·`/assets`·`coinSignalModes`/`coinAnalysis`·CHANGELOG 차수·크론 스냅샷 브랜치 |
| 🆕 거시 배경 · 드릴다운 · 교차 · 확신 보정 · 내 복기 | `coinMacroContext`(순풍/맞바람/엇갈림) · `BucketTrades`(칸·행 그 구간 매매) · `convictionBySetup/ByMistake`(셋업/실수×확신) · `convictionCoaching`(🎯/⚠️ 한 줄) · 홈 `MyReviewLine` |
| 🆕 태그 피커 · geo 태그 · cutover | 공용 `components/TagPicker`(셋업·실수·확신 입력) · 뉴스 지정학(⚠️war)/정치(🏛geo) · GitHub→Vercel 크론 발송 전환 |

---

## 14. 디렉토리 구조
```
kospi-lab/
├── vercel.json                        # ★ regions icn1
├── middleware.ts                      # 게이트(§6)
├── app/globals.css                    # ★ 토큰(다크+html.light)·nv-*·nv-gc*·hit·nv-fold/nv-m-only
├── app/page.tsx                       # 홈 = NaverHome + PcMarketSections(모든 폭)
├── app/{industry,ranking,indicators,theme-etf,research}/ · app/alerts/ · app/calendar/
├── app/api/{home,naver,stock/sectors,…}/   # 60 라우트(공개는 withCdn/LIVE)
├── lib/menu.ts                        # ★ IA 단일 소스(3탭·시장 9·EXTRAS·OWN_H1_ROUTES)
├── app/brief/ app/api/brief/{route,macro,edge}/ · app/api/bitget/transfers/  # 🆕 모닝 브리핑·출금
├── app/journal/ app/performance/ app/study/{chart,indicators,fibonacci,macro}/  # 분석 허브·공부법
├── lib/{brief,briefEdge,naverStock,krx,cdn,tradeBreakdown,tradeCosts,tradeAutopsy,journalAnalytics,tradeTags,…}.ts  # 64
├── components/{WeekdayHourHeatmap,ConvictionCard,EquityCurve,Cost,Excursion,Edge Summary…}.tsx · components/study/  # 47
├── components/home/naver/ · components/naver/{ui.tsx,sections/} · components/detail/{chartLayout…}
├── hooks/ (20) · tests/ (13파일) · scripts/ (13 — coinTrack.mts·briefTelegram.mts=크론)
├── .github/workflows/{coin-track,warm-cache,brief-warm}.yml
└── PROJECT_STATUS.md · CHANGELOG.md · COMPLETENESS.md
```

---

## 15. 다음 세션 시작 문구 (복붙용)
> "KOSPI LAB(C:\Users\GB\Documents\kospi-lab) 이어서 할게. PROJECT_STATUS.md 읽고 §0 확인 — **깨끗함**(HEAD ccd1370=main, 주식9 전부 push·배포, tsc0·build0·inflation.test 27). **주식9에 nowflation 클론 기능 A~F를 `/inflation` 6그룹 18페이지 허브로 전수 이식 완료** + 진입점(홈·브리핑·메뉴)·목록 52주 정렬·성과 벤치마크·드릴다운 24/48/102 토글·전체 CPI 게이지 오버레이까지 끝남. 데이터는 전부 `/api/nf` 게이트 중계(seed/nf 48개 폴백)·CC BY 출처표기 유지. **지금 급한 것 없음** — §4 다듬기 중 택1(제일 쉬운 건 MarketBenchmark 공용 컴포넌트 단위 테스트). ⚠️ 헤드리스 검증 전 `/api/nf/pulse.json` 등 relay 워밍(콜드 서버 첫 중계 지연, §0). 시작 전 작업 디렉토리 kospi-lab 확인. ⛔ 커밋은 경로지정 add(-A 금지)+키 grep 0(APP_ACCESS_TOKEN 등)+Co-Authored-By(Claude Opus 4.8). 검증 npm test+tsc+build→next start 3456+헤드리스 390px(새 프로필·kl_auth 쿠키 시드). project-state.json은 자동관리·커밋 안 함."
