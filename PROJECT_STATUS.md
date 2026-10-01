# KOSPI LAB — Project Status

> **마지막 업데이트: 2026-10-01** (85~90차: 속도·실시간 시장 섹션·결정 정리) · 이전: (세션명 "주식2", 09-30 재개) — **라이트 테마 토글 + 네이버 금융/증권 스타일 홈(모바일·PC) + 네이버 증권 위젯 기반 시장 메뉴 5종 + AI 브리핑 Gemini/ChatGPT 탭**: 지수 실시간화·차트 호버·52주/시장현황 정정·국내 뉴스 복구·PC 홈 섹션 5종·박스 정렬. CHANGELOG 75→82차. (이전: 09-28~30 "주식4" Copilot 다크·3탭·매매일지)
> **위치:** `C:\Users\GB\Documents\kospi-lab`
> **GitHub:** `cslis07/kospi-lab` · 기본=현재 브랜치 `main` · ⚠️ **저장소 공개(public)**
> **배포:** [kospi-lab.vercel.app](https://kospi-lab.vercel.app) · Vercel `cslis07` · **git push → 자동 배포**
> **APK:** TWA(배포 URL 로드형 — 콘텐츠는 배포 즉시 반영, 아이콘·스플래시만 재빌드). packageId **`app.kospilab.twa`**. 서명키 `Documents\키스토어\kospi-lab-twa.jks`(비번은 메모리 `reference_kospi_lab_twa_apk`). 최신 `Documents\KOSPILAB_v1.0.1.apk`(v1.0.1/code 2, 스플래시 `#000814`) · 다음 재빌드 code 3. 이번 세션 변경은 전부 웹이라 **재빌드 불필요**
> **외부 서비스:** Supabase `zsjdilispaoqlcdywxky`(톡메모·naver-ad-bid·youtube-intelligence **공용**, 이 앱은 `kl_sync` 하나) · 텔레그램 봇 `@cirin0913_bot`(posteady 공용, 전용 그룹 "kospi lab") · 🆕 Google AI Studio(Gemini, 프로젝트 번호 168924064536) · 🆕 OpenAI(키만 등록, **크레딧 0**)
> **규모:** API 59 · 페이지 35 · lib 51 · hooks 17 · components 68 · scripts 12 · tests 5파일 **148케이스**(`npm test`)
> **기록 문서:** [CHANGELOG.md](CHANGELOG.md)(최신 82차) · [COMPLETENESS.md](COMPLETENESS.md)(3차 2026-09-17 — **09-29~30 대개편 미반영, 재점검 필요**). 중복 서술 안 함

---

## 0. 지금 하던 일 (WIP)

**깨끗한 상태** — 미커밋 0 · 미푸시 0 · stash 0. HEAD `fe882f8` = 프로덕션 ✅success(82차). 게이트: test 148 · tsc 0 · build OK. 검증은 로컬 `next start` + 헤드리스 Chrome 캡처(1280/1600 PC, 500 모바일) + 프로덕션 API 실호출.

### 이번 세션("주식2", 09-30)에 끝낸 것 — 전부 push·배포 (CHANGELOG 75~82차)
1. **라이트(순백 클린) 테마 + 다크/라이트 토글**(기본 다크, `?theme=light|dark` 딥링크).
2. **홈 = 네이버 금융 스타일**(모바일·PC 공통 `NaverHome`): 지수 레일(실시간)·큰 차트(1일 분봉/1개월/3개월/1년, 호버 툴팁)·시장현황·52주·투자자·프로그램매매·AI 브리핑·해외 주요 뉴스·최근 소식(국내)·인기/관심. 모바일은 차트·뉴스 **스프링 아코디언**.
3. **AI 브리핑 = 국내/해외/코인 탭 × Gemini**(Claude 호출 제거). ~~ChatGPT~~ 10-01 사용자 결정으로 제거 — Gemini 하나만.
4. **시장 탭 메뉴 5종**(stock.naver.com 번들 정적분석으로 API 확정): 산업 트렌드·실시간 랭킹·시장지표·테마 ETF·리서치.
5. **PC 홈(≥1024px)에 위 5종 섹션 전부 노출**(네이버 홈 배치 순서) + 박스 크기·간격·정렬 통일.

### 다음 채팅이 가장 먼저 할 한 가지
급한 일 없음. ✅ 실기기 확인 완료(10-01 사용자: 새 홈·목록 스크롤 추가·상세 차트). 다음 후보: §4 개선 여지(DXY 네이버 교체·인기 탭 실시간화) 또는 두 코인 엔진 은퇴 결정.

### 🔴 사용자가 직접 해야 할 것
- 🔑 ~~Gemini·OpenAI 키 교체 권장~~ — 10-01 사용자 결정: **현재 Gemini 키 하나로 진행**(교체 안 함, 수용). OpenAI 키는 **10-01 삭제**(Vercel·`.env.local`).
- ~~💳 ChatGPT 크레딧 충전~~ — ChatGPT 제거(10-01)로 해당 없음.
- ✅ **Gemini 무료 보장 확인** — AI Studio에서 프로젝트 168924064536에 결제 계정 미연결인지(연결돼 있으면 과금 가능).
- APK v1.0.1 폰 설치(이전부터) · 텔레그램 "kospi lab" 그룹에서 봇 내보내지 말 것 · 분석 페이지 잠금 해제(브라우저 1회, §6) · 비트겟 청산내역 손절가 실계정 확인.
- ⏸ KRX API 키 재발급 — 사용자 보류(09-17), 수용한 리스크.
- ~~ANTHROPIC_API_KEY 무효~~ 09-17 해결 · ~~텔레그램 알림 켜기~~ 09-17 해결 · ~~Bitget 선물 읽기 권한~~ 08-24 해결

**남은 결정(사용자 몫):** ① 옛 코인 엔진 vs 3모드 엔진 은퇴 ② `/principles` '오늘의 리스크' 안내 2곳 정리 ③ `/growth` 정리 ④ 미참조 컴포넌트(`ExchangeReconcile·RetroReport·TradeAutopsy·AiCoach`, 🆕 `MarketHero`·`WatchlistPreview`·`EventCalendar`·`HeroIndex`·`MarketStrip` 등 옛 홈 부품) 삭제 여부.

### 🔬 엔진 엣지 측정 결과 — 이 프로젝트의 가장 중요한 사실
**측정 가능한 엣지가 어디에도 없다.** 코인 727건 49.7%·파생 407건 48.4%·펀딩 되돌림=하락장 베타·3모드 81건 41.7%·주식 362건 54.1% < 대조군 54.8%(상승장 베타). 스크립트 `scripts/backtest-{lab,deriv,modes,stock-lab}.ts`·`validate-funding.ts`. → UI 전체를 "신호"가 아닌 **리스크 도구**로 정의. 🟡 감사 잔여: M-7 trigger 방향 미기억 · M-8 저널 R 회계 · 옛 훅 스키마 버전 없음.

---

## 1. 프로젝트 목적
**국내·해외 주식 + 코인 + 선물 통합 투자 리스크 관리 앱.** 방향 판단은 사용자, 앱은 손절·사이징·청산가·기록·복기. 코인 작업 정본(08-21 coin-signal 이관).
- 08-07 "지금 사도 되나" → "얼마나 걸고 어디서 끊나"(엣지 없음 측정) · 09-16 매매 규율 도구 · 09-18 모바일 앱 수준 UI · 09-29 Copilot 다크 + 하단 3탭.
- 🆕 **09-30 "시장 정보 포털화"**: 홈을 네이버 금융/증권 구성으로(시세·수급·AI 요약·랭킹·산업·리서치·지표·테마 ETF). 방향 판단 금지 원칙은 유지 — 리서치 목표가는 **애널리스트 의견으로만** 표기.
- ⚠️ 정직성 원칙: 못 하는 걸 하는 척 안 함. 소스 없는 필드는 대체 기준을 **화면에 명시**(예: 미국 테마 ETF=거래대금 순).
- 스택: Next.js 16 App Router · React 19 · TS · Tailwind v4 · SWR · Recharts. 로그인 없음(localStorage + 선택 클라우드 동기화).

---

## 2. 현재 구현된 기능

### 홈 `/` ✅ (09-30 전면 교체, `components/home/naver/*`, `app/page.tsx`)
| 블록 | 내용 | 데이터 |
|---|---|---|
| 지수 레일 | 코스피·코스닥·USD·S&P500·나스닥·다우, 10초 갱신, 국내 스파크=당일 분봉(점선=전일), 해외=1개월 | `/api/home/indices` |
| 중앙 보드 | 코스피/코스닥 · 1일/1개월/3개월/1년 · 라인/캔들 · **호버 십자선+툴팁** · 시장현황(실시간 상승/보합/하락·상하한) · 52주 · 투자자 · 프로그램매매 | `/api/home/board` |
| AI 브리핑 | 국내/해외/코인 탭 × Gemini(카드 1개), 1시간 주기 | `/api/home/briefing` |
| 뉴스 | 해외 주요 뉴스(하단) · 최근 소식=국내(사이드) | `/api/news` |
| 인기/관심 | 인기=KRX 전 거래일 거래대금 상위 · 관심=watchlist | `/api/home/status` |
| 🆕 시장 섹션 5종 | 실시간 랭킹 → 산업 트렌드 → 리서치 → 테마 ETF → 환율·시장지표 — **모든 폭**(10-01), 섹션별 화면 800px 앞에서 지연 마운트 | `/api/naver/*` |

### 하단 3탭 + 시장 탭 9항목 (`lib/menu.ts` 단일 소스)
- 홈 `/` · 시장(국내 `/domestic` · 해외 `/overseas` · 코인 `/coins` · 선물 `/futures` · 🆕 **산업 트렌드 `/industry` · 실시간 랭킹 `/ranking` · 시장지표 `/indicators` · 테마 ETF `/theme-etf` · 리서치 `/research`**) · 자산 `/assets`.
- 더보기 도구(EXTRAS): 관심종목·종목 비교(`/screener`)·리포트·매매일지·뉴스·매매 대원칙·가상투자·투자설계·세금·시뮬·증권사.
- 목록 행 **간단**(`/screener`)·**분석**(`/stock-analysis`·`/overseas-analysis`·`/coin-analysis`) 버튼, 상세 3종(`/stock/[ticker]`·`/overseas/[symbol]`·`/crypto/[symbol]`).
- 기존 기능(코인선물 분석·국내 분석·매매일지·성과·계좌·성장주·KRX·캘린더·동기화)은 변동 없음 — CHANGELOG 참고.
- **테마**: 기본 다크(Copilot) + 🆕 라이트(순백 클린) 토글(헤더 해/달). 선택은 `kl-theme`(localStorage).

### "이상해 보이지만 정상"
- 미국 지수·S&P 등 **한국 낮엔 '장마감'**(실시간 표기는 장중만). 시장지표 달러인덱스·WTI·국제금·은은 **'10분 지연'**(네이버 표기 그대로).
- Gemini가 과부하면 폴백 모델명(`gemini-3.1-flash-lite` 등)이 보이거나 **"○분 전 요약"**(직전 성공본) 표시. (ChatGPT 카드는 10-01 제거)
- AI 브리핑은 **탭별 1시간에 한 번**만 새로 생성(무료 한도 보호) — 생성 시각이 안 바뀌어도 정상.
- 인기 탭 가격은 **KRX 전 거래일 기준**(날짜 표기). 미국 테마 ETF는 **거래대금 순**, 코인 '인기'는 **거래대금 기준**(화면 명시).
- 모바일: 차트 기본 펼침·해외 뉴스 기본 접힘. 시장 섹션 5종은 모바일 홈에도 있음(스크롤해 다가가야 로딩 — 첫 로딩엔 호출 0). 데스크탑(≥1024)은 아코디언 없이 항상 펼침.
- 목표주가 투자의견은 증권사 표기(Buy/매수)를 **한국어로 통일**해 보여줌. 이전 세션 항목(테마 토글 없음 등)은 09-30 라이트 토글로 **무효**.

---

## 3. 수정한 주요 파일

### 🆕 2026-09-30 세션 ("주식2")
| 경로 | 역할 |
|---|---|
| `app/globals.css` ✏️ | `html.light` 라이트 토큰 · `.idx-rail/.idx-card/.idx-live` · **`nv-*` 섹션 레이아웃(박스 정렬)** |
| `components/ThemeToggle.tsx` 🆕 · `app/layout.tsx` ✏️ · `components/Header.tsx` ✏️ | 해/달 토글 · FOUC 방지 스크립트·`?theme`·colorScheme · 토글 배치 |
| `app/page.tsx` ♻️ | 홈 = `NaverHome` + `PcMarketSections`(PC) + 도구 역할 안내 |
| `components/home/naver/*` 🆕 | `NaverHome`·`IndexRail`·`IndexBoard`(차트·호버)·`HomeBriefing`·`HomeNews`·`HomeSidebar`·`Fold`(아코디언·`useMediaQuery`)·`PcMarketSections` |
| `lib/naverIndex.ts` 🆕 | 네이버 지수·환율 실시간/일봉/분봉/integration(등락·수급·프로그램·52주) |
| `lib/newsFeeds.ts` 🆕 · `app/api/news/route.ts` ♻️ | 국내=네이버 증권 모바일 뉴스 JSON 주력, RSS 폴백 |
| `lib/llmBriefing.ts` 🆕 · `app/api/home/briefing` ♻️ | Gemini(폴백·thinking minimal)·OpenAI, 탭별 캐시·직전 요약 |
| `app/api/home/{indices,board,status}` 🆕 | 지수 레일 · 보드 · 인기(KRX) — 🗑 `home/kospi`·`index/[code]/investor` 삭제(board로 통합) |
| `lib/naverStock.ts` 🆕 | stock.naver.com 6위젯 호출·정규화(산업·리서치·지표·테마 ETF·랭킹) |
| `app/api/naver/{industry,ranking,indicators,theme-etf,research}` 🆕 | `preferredRegion icn1`, CDN 캐시 |
| `components/naver/ui.tsx` 🆕 · `components/naver/sections/*Section.tsx` 🆕 | 공용 UI(조/억·$억·미니라인·MoreLink) · 페이지·홈 공용 섹션(`home` 모드) |
| `app/{industry,ranking,indicators,theme-etf,research}/page.tsx` 🆕 | 섹션 얇은 래퍼 |
| `lib/menu.ts` ✏️ · `.gitignore` ✏️ | 시장 탭 5항목 추가 · `project-state.json` 무시 |

### 이전 세션 요약
- 09-28~30(주식4): Copilot 토큰·@theme 재매핑, 하단 3탭, 매매일지 재설계(`lib/tradeMood`·`tradeReport`), `/overseas-analysis`, 크론 규율 알림, data 브랜치 `vercel.json`.
- 09-28(주식3) IA 6탭·자산 허브 · 09-17~18 IA 셸·상세 3종 · 09-16 target/leakage/autopsy · 08-21 coin-signal 이관 · 그 이전 성장주·측정 스크립트·동기화.

---

## 4. 남은 작업
### 우선
- [x] **실기기 점검** — 10-01 사용자 확인(새 홈·목록 스크롤 추가·상세 차트)
- [x] **COMPLETENESS.md 4차 재점검** — 09-30 완료(86%)
- [x] ~~키 교체~~ — Gemini 현 키 유지 결정(10-01), ChatGPT 제거
- [ ] **두 코인 엔진 은퇴 여부** — 사용자 결정 대기

### 개선 여지
- [ ] 🆕 **거시 DXY를 네이버 `.DXY`로 교체 검토** — 09-30 `securityService/integration/indicators`에서 실시간 ICE 달러인덱스 확보(§12 트리거 충족). 코인 거시환경 등은 아직 FRED 광의 사용
- [x] 인기 탭(홈 사이드) 네이버 실시간 인기로 교체(10-01, 91차) — 실패 시 KRX 전 거래일 대체
- [x] 미참조 컴포넌트 14개 삭제(10-01, 90차) — AiCoach·ExchangeReconcile·IndexCards·KospiBar·MarketHero·RetroReport·SwipeRow·TradeAutopsy·Greeting·HeroIndex·EventCalendar·EventList·MarketStrip·WatchlistPreview. `lib/` 엔진·테스트·`/api/coach`·`/api/candles` 는 유지(git 이력으로 복구 가능)
- [ ] 🆕 미국 섹터 우선주 코드(`BW PRA` 등) → `/overseas/` 상세 링크 미해결 가능
- [ ] 기분 미기록 텔레그램 알림(§12) · 미청산 기분 승계 · 차트 색 점검 · `/assets` 30/90일 그래프 · 해외 시총 "—" · M-7/M-8 · `api/debug/naver` 제거 · 통합 테스트 · KRX 채권/파생 활용신청

---

## 5. 실행 명령어
```bash
cd C:\Users\GB\Documents\kospi-lab
npm test                     # 148케이스
npx tsc --noEmit             # 타입체크 (라우트 삭제 후 에러나면 rm -rf .next/types)
npm run build                # 빌드 — 네트워크 필요(next/font)
git push origin main         # = 배포
gh api repos/cslis07/kospi-lab/commits/<sha>/status   # 배포 성공 확인
```
- ⚠️ 로컬 `npm run dev`(Turbopack)는 CSS @import 때문에 안 뜸 → **`npm run build && npx next start -p 3456`**(백그라운드) + 헤드리스 Chrome: `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --hide-scrollbars --window-size=1600,5600 --virtual-time-budget=20000 --screenshot=<png> "http://localhost:3456/?theme=light"`. 긴 캡처는 `py`+PIL로 잘라서 확인(**py 경로는 `C:/...`**).
- 커밋 전: test·tsc·build → `git add <경로 지정>`(🆕 `-A` 금지, §11) → `git diff --cached | grep -cE '<키 접두>'` 0 확인.
- **스모크(재개 직후):** `curl -s https://kospi-lab.vercel.app/api/naver/ranking?tab=value | head -c 200` → 국내 주식 JSON이면 정상(네이버 연동 생존 확인).
- 서버 종료는 **포트 3456 PID만** kill(node 전체 kill 금지 — MCP까지 죽음).
- 크론: `gh workflow run coin-track.yml` → `gh run view <id> --log`.

---

## 6. 배포·환경
- gh 두 계정 `cslis07`(소유자)·`histobio0302-oss`. push 403 → `gh auth switch --user cslis07 && gh auth setup-git`.
- Vercel 무료 배포 한도 100/일. data 브랜치 커밋은 `vercel.json`으로 배포 미생성(§8).

### 환경변수 (이름만)
| 키 | 용도 | 설정된 곳 |
|---|---|---|
| `APP_ACCESS_TOKEN` | 게이트(미설정 시 503) | Vercel + `.env.local` |
| `KRX_API_KEY` | KRX(인기 탭 등) | 양쪽 · ⏸재발급 보류 |
| `KIS_APP_KEY`/`SECRET`/`ACCOUNT`/`ACCESS_TOKEN` | KIS(VTS 모의) | 양쪽 |
| `DART_API_KEY` | DART | Vercel만 |
| `BITGET_API_KEY`/`SECRET`/`PASSPHRASE` | 읽기 전용 | 양쪽 + Actions Secrets |
| `ANTHROPIC_API_KEY` | 종목·코인 분석 AI, 복기 코치(홈 브리핑엔 더 안 씀) | 양쪽 |
| 🆕 `GEMINI_API_KEY` | 홈 AI 브리핑(무료 티어) | `.env.local` + Vercel production · 09-30 |
| ~~`OPENAI_API_KEY`~~ | 10-01 삭제(Vercel production + `.env.local`) — ChatGPT 제거 | — |
| 🆕 `GEMINI_MODEL`·`OPENAI_MODEL` | 모델 오버라이드(선택) | **미설정**(기본 `gemini-3.6-flash`·`gpt-5-mini`) |
| `ECOS_API_KEY`·`FRED_API_KEY`·`CUSTOMS_API_KEY` | 한국은행·FRED·관세청 | 양쪽 |
| `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` | 클라우드 동기화 | 양쪽 + Actions Secrets |
| `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`·`KL_TELEGRAM_CHAT_ID` | 크론 알림 | Actions Secrets |
- 키 등록은 값이 화면·로그에 안 남게 **파일에서 파이프(stdin, 끝 줄바꿈 제거)** → `vercel env add <KEY> production`. 환경변수 변경은 **재배포해야 적용**.

### git에 없는 필수 로컬 파일
`.env.local`(16키) · `Documents\키스토어\kospi-lab-twa.jks` · `Documents\키스토어\kospilab-twa-manifest.json` · `Documents\KOSPILAB_v1.0.1.apk` · 🆕 `project-state.json`(다른 도구가 관리하는 로컬 진행 기록, gitignore — 지우지 말 것)

### 게이트·리전·런타임
- `middleware.ts` 게이트: `/api/bitget/*`·`/api/analyze`·`/api/stock-analysis`·`/api/coin-analysis`·`/api/debug/*`·`/api/sync`. 홈·네이버 라우트는 공개(의도).
- 🆕 **함수 리전 = `vercel.json` `regions:["icn1"]`(09-30)**. 라우트별 `preferredRegion='icn1'`은 **무료 요금제에서 무시돼 전부 iad1(미국 동부)에서 돌고 있었음**(`x-vercel-id: icn1::iad1` 실측). 확인: 응답 헤더 `x-vercel-id`가 `icn1::icn1`이면 서울.
- 🆕 **CDN 캐시**: 공개 데이터 라우트는 `lib/cdn.ts withCdn(handler, s-maxage, swr)` 또는 직접 `Cache-Control`. 원칙 = 신선 구간 짧게 + stale-while-revalidate 길게(방문 뜸한 개인 앱이라 만료 상태가 기본). **배포하면 CDN 캐시가 비워져 배포 직후 첫 방문만 느림**(KRX 랭킹 5~9초·AI 브리핑 4초).
- 🆕 `/api/home/briefing` `maxDuration=60`(Gemini 폴백 여유). 분석 라우트 30초.

---

## 7. 무인 실행되는 것
| 이름 | 주기 | 역할 | 끄는 법 |
|---|---|---|---|
| 🆕 `.github/workflows/warm-cache.yml` | 프로덕션 배포 성공 시 1회 | 공개 API·화면 CDN 캐시 채우기(배포하면 CDN이 비워짐) | `gh workflow disable warm-cache.yml` |
| `.github/workflows/coin-track.yml` → `scripts/coinTrack.mts` | 15분(지연·누락 잦음) | 스캘프 신호 판정·포지션 감시·규율 알림(서킷·손절 미설정·주간 복기) → 텔레그램 "kospi lab" 그룹, data 브랜치 커밋(트리에 vercel.json) | `gh workflow disable coin-track.yml`. ⚠️ 저장소 비활동 시 자동 비활성 이력(08-25~09-29) → 알림 끊기면 `gh workflow list` |
- AI 브리핑·네이버 데이터는 **크론 아님**(요청 시 생성 + 캐시). 방문이 없으면 호출도 없음.

---

## 8. 최근 발생한 에러와 해결 (누적)
| 증상 | 원인 | 해결 | 날짜 |
|---|---|---|---|
| 모바일 홈 첫 방문 화면이 크게 밀림(CLS 0.27) · 전체 메뉴 581px 밀림 | ① `useMediaQuery` 첫 값 false → 정적 HTML이 PC 배치 ② 지수 보드 칸이 데이터 도착 시 생김 ③ `useSearchParams`가 정적 HTML에서 메뉴를 빼고 대체 화면만 | 차이는 CSS로·훅 초기값 모바일 기준 · 로딩 자리 실측 높이 · 쿼리는 마운트 후 `location.search` | 09-30 |
| **전 화면 로딩 5초**(홈·국내 스켈레톤 5초) | ① 함수가 iad1에서 돌며 네이버·KRX 태평양 왕복(`preferredRegion` 무시) ② 시세·KRX 등 라우트에 CDN 캐시 없음 ③ 있는 캐시도 swr 30초라 늘 만료 | `vercel.json` icn1 · 공개 라우트 20+개 캐시(`withCdn`) · swr 연장 → 모바일 4G 실측 홈 5.05→0.85초, 국내 5.06→0.97초, 코인 7.7→0.83초 | 09-30 |
| 리서치 목표주가 카드 2장이 세로로 쌓임·박스 크기 제각각 | styled-jsx 범위 클래스가 **변수에 담은 조건부 JSX엔 안 붙음** + 그리드 `align-items:start` | 섹션 레이아웃 전역 `nv-*`로 이전, `stretch`, 랭킹 행 62px·헤더 44px 고정 | 09-30 |
| 커밋에 모르는 `project-state.json` 포함 | `git add -A` | 다음 커밋에서 추적 해제+gitignore(비밀값 없음 확인, 이력엔 남음) | 09-30 |
| `$210억 10천만`·`2조 10000억` | 큰 단위로 나눈 뒤 반올림 → 자리올림 누락 | 최소 단위로 먼저 반올림 후 분할 | 09-30 |
| 국기 이모지가 `KR`·`US` 글자로 보임 | Windows는 국기 이모지 미지원 | 이모지 제거 | 09-30 |
| AI 브리핑 Gemini "응답 형식 오류" | Gemini 3.x **thinking 토큰(983)이 maxOutputTokens(1024)를 소진** → MAX_TOKENS로 JSON 잘림 | `thinkingLevel:'minimal'` + 4096, thought 파트 제외 | 09-30 |
| 해외 탭 Gemini 시간 초과/503 | 무료 티어 수요 폭주, 모델별 응답 2~16초 | 폴백 체인+마감시각 타임아웃, maxDuration 60, 헤드라인 5초 컷, 직전 요약 표시 | 09-30 |
| ChatGPT 항상 실패 | 키 유효·선불 크레딧 0 → 429 `insufficient_quota` | '크레딧 없음 — 결제 후 자동 표시'로 정확히 안내 | 09-30 |
| **프로덕션 국내 뉴스 0건**(최근 소식 빈칸) | 국내 RSS(한경·매경·조선비즈·네이버 RSS)·finance.naver 스크래퍼가 **Vercel(미국 IP)에서 빈 결과** | 네이버 증권 모바일 뉴스 JSON 주력(`lib/newsFeeds.ts`) | 09-30 |
| **52주 최저 5,262(실제 3,440)** | 네이버 차트 `periodType=dayCandle&count=N`이 **기간을 무시**하고 약 5개월만 반환 | `/day?startDateTime&endDateTime` + integration 52주 | 09-30 |
| 시장현황이 실시간이 아님 | KRX 전종목맵은 **전 거래일** 확정치 | 네이버 integration `upDownStockInfo`(실시간) | 09-30 |
| 모바일 차트 아래(개인·프로그램매매) 잘림 | Fold가 첫 마운트에 px로 고정, `none→px`는 트랜지션 없어 transitionend 미발생 | 첫 활성화는 `max-height:none`, 여닫을 때만 애니메이션+600ms 안전 타이머 | 09-30 |
| `/api/home/indices`가 빌드 스냅샷(ISR) | GET이 요청 비의존이라 정적 판정 | `dynamic='force-dynamic'` + CDN s-maxage=10 | 09-30 |
| 실브라우저 테스트 중 "렌더러 멈춤" | **탭이 백그라운드(visibility hidden)** → rAF 정지·타이머 스로틀·스크린샷 CDP 타임아웃(앱 문제 아님) | 대기 없는 이벤트 디스패치로 DOM 검증 | 09-30 |
| 차트 글자 늘어짐·최고/최저 라벨 잘림 | `preserveAspectRatio=none` | ResizeObserver 실측 폭 렌더, 라벨 안쪽 고정 | 09-30 |
| 흰 배경에서 흰 글자·섀도 안 보임 우려 | 다크 전제 rgba(255,255,255) 값 | `html.light`에서 스크롤바·그랩·토스트·스켈레톤 등 교정 | 09-30 |
| data 브랜치 Vercel 빌드 실패 반복 | 크론 JSON 커밋도 배포 시도 | data 트리 `vercel.json {"git":{"deploymentEnabled":false}}` | 09-30 |
| 크론 알림 미발송 / 봇 추방 / chat id 못 얻음 | 워크플로 비활성·시크릿 없음 / 그룹 추방 / privacy 모드 | enable+시크릿 / 재초대 / getUpdates | 09-29 |
| 해외 원화 작음·오늘 포지션 누락·.next/types 스테일·TOP 타입·칩 잘림 | 상세 누락·history는 청산만·삭제 라우트·유니언·음수 여백 | 인라인·positions 병행·`rm -rf .next/types`·명시 타입·`.in-card` | 09-29 |
| `python3` 2분 멈춤 | Store 스텁 | `py` 사용 | 09-30 |
| 시장탭 종목명 안 보임·이익 막대·"0" 표시·재무 결측·데스크탑 알약 | 모바일 6열·NET 그래프·양수 전용 포맷·KIS 단일·토글 전용 | flex/grid·분리 막대·`fmtPnl`·네이버→KIS·Link | 09-28 |
| UI 셸 버그 묶음(하단탭·동기화·플릭·NMS·스와이프·포커스) | 레이어·훅 인스턴스·옛 dx·Yahoo 코드·렌더 함수 안 컴포넌트 | 09-17~23 수정(CHANGELOG) | 09-17~23 |
| DART·시총·호가 / favicon RGB·크론 개행·아이콘 캐시 / 원격 뒤처짐·김프·나스닥·ETF / 백테스트 과대 / 키 유출·게이트 누락 / OI·보유율·KIS 에러 | 각 CHANGELOG 참조 | 동일 | 07-27~09-17 |

---

## 9. API 구조
**내부(09-30 신규):** `/api/home/indices`(10s) · `/api/home/board?code&range`(1d 15s) · `/api/home/briefing?tab=kr|us|coin`(1h) · `/api/home/status`(인기·KRX) · `/api/naver/industry?market&cat&period&size` · `/api/naver/ranking?tab&coin` · `/api/naver/indicators` · `/api/naver/theme-etf?region&theme` · `/api/naver/research?direction&industry` · `/api/news?category`.
**기존:** coin-signal·coin-env·etf·whale·candles(공개) · stock/coin-analysis(게이트) · market·index-spark·overseas/*·screener·sync·bitget/*·krx/*·stock/*·dart/*·kis/price.

| 외부 API | 키 | 함정 |
|---|---|---|
| 🆕 **stock.naver.com `/api/...`**(비공식) | 무 | 번들 분석으로 찾은 경로(`lib/naverStock.ts` 헤더 주석). 열거값: 랭킹 listingType `tradingValueDesc/changeRateDescUpAll/…/marketCapDesc(ETF aumDesc)/tradingVolumeDesc`, 미국 sortType `tradingValue/changeRate/marketCap/tradingVolume`, 코인 `top/up/down/marketValue/quantTop`, 미국 ETF sortType에 1주 수익률 없음, 인기 ETF는 코드·조회수만(시세 보강). 지표 파라미터는 `integration/indicators?indicatorCodes=`(`/v1/`은 빈 응답). 구조 변경 시 빈 값 |
| 🆕 네이버 모바일/차트 | 무 | `m.stock.naver.com/api/index/{KOSPI}/basic·integration·trend`, `api.stock.naver.com/index/{.INX}/basic`, `marketindex/exchange/FX_USDKRW`, 차트 **`/day?startDateTime`**(count 무시 주의)·국내만 `/minute`(해외 분봉 없음, 환율 차트 404). 뉴스 `m.stock.naver.com/api/news/list`(tit·ohnm·dt·oid·aid) |
| 🆕 Gemini | 유(무료 티어) | 기본 `gemini-3.6-flash` → `3.1-flash-lite` → `flash-lite-latest` → `3.5-flash`. `flash-latest` 503 잦음, `2.5-flash` 신규 폐기. **thinking이 출력 한도 소모** → `thinkingLevel:'minimal'`. 키는 `x-goog-api-key` 헤더 |
| 🆕 OpenAI | 유(선불) | 무료 한도 없음. `gpt-5-mini`·`gpt-5.4-mini` 목록에 있음. temperature 미전송, `max_completion_tokens`. 크레딧 0 → 429 `insufficient_quota` |
| Bitget · SoSoValue · 온체인 · OKX | 읽기전용/무 | granularity·90봉·펀딩 270 상한 · ETF POST · XRPL AMM 제외 |
| FRED · Yahoo · 네이버 금융 | 유/무/무 | 미공표 `"."` · crumb·로컬 HeadersOverflow·해외 시총 null · 키 축약(시총·대금) |
| KRX · KIS · ECOS · 관세청 | 유 | 활용신청·MKTCAP 원·**전 거래일** · VTS `:29443`·토큰 1분 1회 · 문자열 % · XML |
| Anthropic | 유 | 401 키/400 크레딧 · temperature 넣으면 400 |
| Telegram · Google Fonts · 무키 기타 | — | getUpdates 가능·추방 시 Forbidden · 빌드 시 네트워크 · alternative.me·업비트·Deribit·CoinGecko·BLS·Frankfurter |

---

## 10. 결정 기록 (코드로 역추적 불가)
- **색은 한국 관행 상승=빨강·하락=파랑**: Coral `#ff4433` / Signal Blue `#1c6cff` — **라이트에서도 동일**. 보조색(green/amber/violet/rose)만 흰 배경 가독용으로 약간 어둡게.
- 디자인 참고는 구조만(상용 에셋 복사 금지). 09-29 예외: Copilot DESIGN.md 토큰은 원본값(사용자 지시).
- Copilot 적용 방식(09-29): 폰트 Space Grotesk+Inter+Pretendard, 본문 300, 마케팅 요소 미적용, 토큰·@theme 재매핑 전략.
- 🆕 **라이트 테마(09-30)**: 사용자 요청 "화이트 버전" → 선택지 중 **토글로 둘 다 + 순백 클린** 선택. 기본은 다크 유지(APK 스플래시 `#000814` 일관). 09-29 "라이트·토글 재도입 금지"는 이 재결정으로 해제.
- 🆕 **홈 네이버 스타일(09-30, 단계별)**: 데스크탑 먼저 설계 → 모바일은 **미리보기(`/preview-home`)로 보여주고 확인 후 적용** → "PC는 현행이 낫다"로 **모바일만** 적용 → 곧바로 "데스크탑도 교체". 미리보기 라우트는 적용 후 삭제.
- 🆕 모바일 아코디언(사용자 첨부 코드 easing 그대로): 본문 `cubic-bezier(.16,1,.3,1)`·셰브론 `(.34,1.56,.64,1)`. 기본값 차트 펼침·뉴스 접힘.
- 🆕 **AI 브리핑 = Gemini·ChatGPT, 무료 한도 내**(사용자 지시): Claude 홈 호출 제거, 탭별 1시간 + CDN 캐시 + 동시요청 합치기. ChatGPT는 무료 한도가 없음을 고지하고 키 게이트로 구현(과금 전 호출 안 함 → 크레딧 0이면 실패만).
- 🆕 **Gemini 키를 다른 프로젝트(histobio-supply)에서 복사하려다 권한 정책(자격증명 이동)으로 차단** → 사용자가 새 키를 직접 제공. 이후 키 교체 권장(채팅 평문).
- 🆕 **뉴스 분리**: 최근 소식=국내(네이버), 하단=해외 주요 뉴스(중복 방지).
- 🆕 **시장 메뉴 5종 = 시장 탭 하위**(하단 탭 추가 안 함 — 09-29 3탭 단순화 유지). 각 위젯 API는 Chrome 확장 미연결로 **번들 정적분석**(`_next` 66청크 + webpack lazy 해시맵·`2248` 별도 규칙, `\uXXXX` 디코딩)으로 확정.
- 🆕 **홈 시장 섹션 5종**: ~~PC(≥1024)만 미마운트~~ → **10-01 '어떤 상황에서도 노출'로 모든 폭**(창을 줄이거나 배율 150% 노트북=CSS 960px에서 사라지던 문제). 대신 섹션별 지연 마운트(`LazyMount`, 800px 앞). 순서는 stock.naver.com `app/page` 청크의 위젯 배치(랭킹→산업→리서치→테마 ETF→지표). 메뉴 페이지와 **같은 섹션 컴포넌트 공유**(`home` 모드).
- 🆕 목표주가·투자의견은 **애널리스트 의견으로만** 표기(앱 신호 아님 명시), 원문은 `finance.naver.com/research/*_read.naver?nid=` 링크.
- 🆕 **10-01 기능 5종(91차)**: 손익 분해 표(매매일지·성과), CSV 내보내기, 가격 알림 관리 `/alerts` + 실제 발동 감시(앱 열려 있을 때 30초·한 번만), 보유 비중 도넛 + 쏠림 경고선(종목 25%·업종 40% — 앱 기준선), 홈 인기 = 네이버 실시간 인기. **가격 알림은 91차 전까지 한 번도 울린 적 없었음**(저장만 하고 확인 코드 없음).
- 🆕 **10-01 결정 묶음**: ① 실기기 확인 완료 ② **Pretendard 웹폰트 안 씀** — 실측(4G) 화면당 조각 11~19개·300~500KB, 페이지 용량 약 2배(홈 408→847KB)·폰트 교체 밀림 증가 → 기기 기본 한글 폰트 유지(원래 `@import`가 빌드에서 빠져 적용된 적 없었음) ③ **AI 브리핑 Gemini 하나만**(ChatGPT 코드 제거, 키 교체 안 함) ④ **홈 섹션에도 출처·신호 아님 문구**(완성도 축 9) ⑤ **미참조 컴포넌트 14개 삭제**.
- 하단 3탭(09-29)·분석 2단계·매매일지 코인선물 전용·텔레그램 알림 범위·Supabase 서비스롤 Actions 등록·해외 TOP 수록 종목 기준·IA 판단 등 이전 결정은 유지(CHANGELOG 66~74차).
- 크론 스냅샷=data 브랜치(+vercel.json) · KRX 재발급 보류 · "무조건 수익" 거절 → 산수 기반.

---

## 11. ⛔ 하지 말 것
- **시크릿 하드코딩 폴백 금지**(public 저장소, KRX 키가 이렇게 유출됨) · 🆕 **키 값을 로그·응답·커밋에 금지** — 커밋 전 `git diff --cached | grep -cE '<키 접두>'` 0 확인.
- **`vercel env pull` 절대 금지**(로컬 전용 키 삭제). `vercel env add`만(stdin).
- 🆕 **시장 섹션 시세 호출에 데이터 캐시(`nget` revalidate>0)·긴 CDN swr을 다시 걸지 말 것** — '실시간' 요구(10/01). 시세는 `LIVE`(no-store)+CDN 5~15초, 화면 10~30초 폴링. 리포트·테마 목록만 길게.
- 🆕 **시장 섹션 5종을 화면 폭으로 숨기지 말 것**(10-01 '어떤 상황에서도 노출'). 768~1023px 헤더는 장 상태·USDT를 lg, 시계를 xl부터만(그 폭에서 넘쳤음).
- 🆕 **화면 폭 JS 판별(`useMediaQuery`)로 레이아웃을 바꾸지 말 것** — 정적 HTML은 폭을 모른다. 차이는 CSS 미디어쿼리, 훅은 동작용·초기값 모바일 기준(`ssrDefault`).
- 🆕 **`useSearchParams`를 화면 본문 컴포넌트에 쓰지 말 것** — 정적 HTML에서 통째로 빠지고 Suspense 대체 화면만 나가 JS 후 밀린다. 강조 표시 정도면 마운트 후 `location.search`.
- 🆕 **Recharts는 `next/dynamic`으로만** — 차트 파일에서 상수 하나만 import해도 라이브러리가 페이지 번들에 딸려 온다(`components/detail/chartLayout.ts`에 둘 것). 동적 상세로 가는 목록 링크는 `prefetch={false}`.
- 🆕 **`git add -A` 금지** — `project-state.json`(다른 도구 로컬 파일) 같은 게 섞여 public에 올라감. 경로 지정 add.
- 🆕 **다른 프로젝트의 키를 스크립트로 복사하지 말 것** — 권한 정책 차단 대상. 사용자에게 받을 것.
- **`APP_ACCESS_TOKEN` Vercel에서 삭제 금지**(게이트 503) · `.env.local` 커밋 금지.
- **`/api/kis/:path*` 통째 게이트 금지** · **코인 신호·시장환경·ETF·고래·캔들·홈·네이버 라우트 게이트 금지**(홈이 즉시 로딩).
- 배포 확인에 UI 한글 grep 금지(React span 분할) → JSON/status로.
- **엣지 근거 없이 진입 신호로 읽히는 UI 금지** · 파라미터 튜닝으로 통과 조합 찾기 금지.
- `git push` 전 `git fetch && git rebase origin/main` 습관.
- 목록 행·입력을 렌더 함수 안 컴포넌트로 정의 금지 · 관심목록은 `useSyncedList` 경유 · 메뉴·탭 하드코딩 금지(`lib/menu.ts`만).
- 🆕 **styled-jsx로 변수에 담은 조건부 JSX 레이아웃 주지 말 것**(범위 클래스 미부착) → 전역 `nv-*`/토큰 사용.
- 🆕 **네이버 차트 `periodType=dayCandle&count`로 기간 데이터 쓰지 말 것**(기간 무시) → `/day?startDateTime`.
- 🆕 **국내 뉴스를 RSS에 의존하지 말 것**(Vercel 차단) · **KRX 값을 '실시간'으로 표기하지 말 것**(전 거래일).
- 🆕 **Gemini 기본을 `gemini-flash-latest`로 두지 말 것**(503) · thinking 켠 채 낮은 `maxOutputTokens` 금지.
- 🆕 AI 브리핑 캐시(1시간) 줄이지 말 것 — 무료 한도.
- u-tabs sticky는 컨테이너 직계 자식·BottomSheet는 portal · 참고 디자인 상용 에셋 복사 금지 · 정적 자산만 바꿔도 push 전 build.
- **크론 data 커밋 트리에서 `vercel.json` 빼지 말 것** · **텔레그램 그룹에서 `@cirin0913_bot` 추방·토큰 revoke 금지** · Actions 시크릿 삭제 주의(조용히 알림만 사라짐).
- **색·테마를 페이지에 하드코딩 금지**(토큰/@theme) — 로고색(#1428A0·#A50034·#F7931A 등) 건드리지 말 것.
- ~~라이트 모드·테마 토글 재도입 금지~~ — 09-30 사용자 재결정으로 해제(라이트 토큰 `html.light` 추가).
- **`python3`/`python` 금지** — `py`(경로는 `C:/…`).
- 서버 종료 시 **포트 PID만** kill(node 전멸 금지).

---

## 12. ❌ 보류 / 구조적 한계
- ❌ 온체인 거래소 유입출 정확값(유료) · 청산 히트맵(유료) · Bitget 카피·주문(의도 제외) · 토스증권 API 없음 · KRX MDC(anti-bot).
- ❌ 청산가 정확 계산(MMR 근사) · 이벤트 방향 예측 · 성장주 점수 백테스트 · 펀딩 추가 검증(90일 상한).
- ⏸→🟡 DXY ICE — ~~무료 소스 없음~~ **09-30 트리거 충족**: 네이버 `.DXY`(10분 지연) 확보. 거시 지표 교체는 미적용(§4).
- ❌ 해외 종목 시총 대부분 "—"(Yahoo null) · 해외 전용 분석엔진 · 해외 전체시장 랭킹(※ 09-30 네이버 `aggregate/foreignStock` 랭킹으로 시장 메뉴에선 해소, 해외 목록 TOP 카드엔 미적용).
- ❌ 기분 미기록·목표 이탈 텔레그램(기분이 localStorage 전용) — 트리거: `/api/sync`에 `kospi-lab-trade-mood` 추가 시.
- ❌ 디자인 원본 폰트 Jokker·Matter(상용) · 텔레그램 ID 조회 봇(privacy).
- 🆕 ❌ 네이버 홈 '오늘아침 라이브' 영상 — 소스 없음. 🆕 ❌ 토론(커뮤니티) 버튼 — 앱에 커뮤니티 없음.
- 🆕 ❌ 해외 지수 분봉·환율 차트 — 네이버 API 빈 배열/404 → 해외는 1개월 일봉, 환율은 frankfurter.
- 🆕 ❌ 미국 테마 ETF 1주 수익률 · 코인 '인기' — 필드 없음 → 거래대금 대체(명시).
- ~~⏸ ChatGPT 요약~~ — 10-01 제거 결정.
- 🆕 ⏸ Chrome 확장(claude-in-chrome) 연결이 오락가락 → 네트워크 수집 대신 번들 정적분석. 연결돼도 **탭이 백그라운드면** rAF·스크린샷 멈춤.

---

## 13. 용어
| 대화 속 이름 | 실제 |
|---|---|
| 주식2 / 주식3 / 주식4 (세션) | 이 프로젝트 작업 세션. 09-30 "주식2 세션 이어서"로 재개한 이번 세션이 라이트·네이버 홈·시장 메뉴 작업 |
| 화이트 버전 | 라이트 테마(`html.light`) + `ThemeToggle` |
| 네이버 스타일 홈 | `components/home/naver/NaverHome`(지수 레일·보드·브리핑·뉴스·사이드) |
| 지수 레일 / 큰 차트(보드) | `IndexRail` / `IndexBoard` |
| 접기 기능 | `Fold`(스프링 아코디언, 모바일만) |
| AI 브리핑 탭 | 국내/해외/코인 × Gemini(`HomeBriefing`, `/api/home/briefing`) |
| 시장 메뉴 5종 / 네이버 기능 | 산업 트렌드·실시간 랭킹·시장지표·테마 ETF·리서치(`components/naver/sections/*`, `/api/naver/*`) |
| PC 홈 섹션 = 홈 시장 섹션 | `PcMarketSections`(이름만 PC, 모든 폭) |
| 박스형 모달 | 섹션 안 카드 박스(`.fin-card`) — 정렬은 `nv-*` 클래스 |
| 더보기 도구 · 간단/분석 · 종목 비교 · 규율 알림 · kospi lab 방 · Copilot 디자인 · 기분 · 자산 허브 · 3모드/옛 엔진 · N차 · data 브랜치 | 이전과 동일(`EXTRAS`·`/screener`·크론 알림·텔레그램 그룹·다크 토큰·`lib/tradeMood`·`/assets`·`coinSignalModes`/`coinAnalysis`·CHANGELOG 차수·크론 스냅샷 브랜치) |

---

## 14. 디렉토리 구조
```
kospi-lab/
├── middleware.ts                      # 게이트(§6)
├── app/globals.css                    # ★ 토큰(다크 기본 + html.light) · @theme · idx-* · nv-*(섹션 정렬)
├── app/page.tsx                       # 홈 = NaverHome + PcMarketSections
├── app/{industry,ranking,indicators,theme-etf,research}/  # 🆕 시장 메뉴(섹션 래퍼)
├── app/api/home/{indices,board,briefing,status}/          # 🆕 홈 데이터
├── app/api/naver/{industry,ranking,indicators,theme-etf,research}/  # 🆕 stock.naver.com
├── lib/menu.ts                        # ★ IA 단일 소스(3탭, 시장 9항목, EXTRAS)
├── lib/{naverIndex,naverStock,newsFeeds,llmBriefing}.ts   # 🆕
├── lib/{coinSignalModes,coinAnalysis,stockAnalysis,…}.ts  # 51
├── components/home/naver/             # 🆕 NaverHome·IndexRail·IndexBoard·HomeBriefing·HomeNews·HomeSidebar·Fold·PcMarketSections
├── components/naver/{ui.tsx,sections/}# 🆕 공용 UI · 5개 섹션(home 모드)
├── components/ThemeToggle.tsx         # 🆕
├── components/ (셸·ui·detail·fin·WatchRow… 총 68)
├── tests/ (7파일 167) · scripts/ (12, coinTrack.mts=크론)
├── .github/workflows/coin-track.yml
└── PROJECT_STATUS.md · CHANGELOG.md · COMPLETENESS.md
```

---

## 15. 다음 세션 시작 문구 (복붙용)
> "KOSPI LAB(C:\Users\GB\Documents\kospi-lab) 이어서 할게. PROJECT_STATUS.md 읽고 §0 확인 — 깨끗하면 실기기 확인이나 COMPLETENESS 4차 재점검, 아니면 §4에서 고를게. 홈은 네이버 스타일 NaverHome(모바일·PC 공통, 모바일은 Fold 아코디언) + 모든 폭 PcMarketSections 5종(지연 마운트), 시장 탭 9항목(국내·해외·코인·선물·산업 트렌드·실시간 랭킹·시장지표·테마 ETF·리서치)은 lib/menu.ts, 네이버 데이터는 lib/naverStock.ts·lib/naverIndex.ts(비공식, icn1), 섹션 정렬은 globals.css nv-*(styled-jsx 금지). 테마는 다크 기본 + 라이트 토글(토큰만, 색 하드코딩 금지). AI 브리핑은 Gemini(3.6-flash, thinking minimal, 탭별 1시간 캐시)·ChatGPT(크레딧 0). 커밋은 경로 지정 add + 키 누출 grep 0 확인, 검증은 npm test(148)+tsc+build → next start 3456 + 헤드리스 Chrome."
