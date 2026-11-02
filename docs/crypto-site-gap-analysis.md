# 코인 정보 사이트 기능 비교 · KOSPI LAB 빈틈 분석 (2026-10-31)

조사 대상 **약 85곳**의 공개 화면·도움말·API 문서·앱스토어 소개에서 **근거가 있는 기능만** 모았다.
무료 데이터 경로는 2026-10-31 이 PC(한국 IP)에서 **키 없이 curl 로 직접 호출해** 상태를 확인했다(아래 '실측'). Vercel icn1 에서는 아직 호출해 보지 않았다.

- **시세·차트·거래소·국내**: CoinMarketCap · CoinGecko · CoinPaprika · CoinCodex · CoinStats · Delta · TradingView(히트맵·스크리너·TOTAL/TOTAL2/USDT.D) · Binance(Trading Data) · OKX(Rubik 통계 15종) · Bybit · Bitget · Coinbase · 업비트(앱·데이터랩·투자주의 5종) · 빗썸(시장경보) · 김프가 · cryprice · 코인니스 · 쟁글 · 코인판 · 크립토퀀트 한국어(403, 미확인)
- **파생·주문흐름·ETF 흐름**: CoinGlass · Coinalyze · Laevitas · Velo · Hyblock · Kingfisher · TensorCharts · Exocharts · Aggr.trade · Tradinglite · Deribit Metrics · Amberdata · Greeks.live · The Block Data · Hyperdash · HyperTracker · Hypurrscan · Farside · SoSoValue · CoinShares 주간 펀드흐름 · CFTC COT
- **온체인·펀더멘털·DeFi**: Glassnode · CryptoQuant · Santiment · IntoTheBlock(Sentora) · Nansen · Arkham · Dune · Whale Alert · DefiLlama · Token Terminal · Artemis · Messari · Tokenomist · L2Beat · ultrasound.money · beaconcha.in · validatorqueue · mempool.space · blockchain.com · BitInfoCharts · Look Into Bitcoin(구 Bitcoin Magazine Pro) · Checkonchain · Woocharts · CBBI · Bitcoin Rainbow · BitcoinTreasuries
- **심리·뉴스·캘린더·포트폴리오·저널·예측시장**: alternative.me · CMC 공포탐욕·알트시즌 · Blockchaincenter 알트시즌 · LunarCrush · Kaito · Google Trends · CryptoPanic · Tree News · CoinMarketCal · DropsTab · Airdrops.io · ForexFactory · CoinTracker · Koinly · Kubera · Tradervue · TraderSync · Edgewonk · Tradezella · 3Commas · Cornix · TradingView 알림 · Polymarket · Kalshi · Coinbase Institutional · Messari 브리프 · Glassnode Week On-chain · CoinDesk CD20

## 1. 이미 있는 것 (다른 사이트와 겹침 — 추가 불필요)

| 기능 | 같은 기능이 있는 곳 | 우리 위치 |
|---|---|---|
| 펀딩비(현재·다음 정산·이력)·계정/포지션 롱숏비·테이커 매수/매도·간이 CVD·OI 1h 변화 | CoinGlass, Coinalyze, Binance·Bitget 데이터 탭 | 코인 분석 › 파생 수급 정밀(Bitget, OI 이력 Bybit·OKX) |
| 오더북 불균형·매수/매도벽 | CoinGlass, Hyblock | 코인 분석 › 오더북 유동성(50호가 스냅샷) |
| 실시간 청산 체결 피드·거래소 대량 체결·온체인 대량 전송 | CoinGlass, Aggr, Whale Alert | 코인 분석 › 청산·고래 패널 |
| BTC DVOL·ETH 옵션 만기별 OI·맥스페인 | Deribit, Laevitas, CoinGlass | 코인 분석 심리 · ETH 체제 |
| 코인베이스 프리미엄(ETH)·김프(평균·분석 코인)·스테이블 총공급·stETH·CEX 총 리저브·현물 CVD | CryptoQuant, cryprice, 김프가, DefiLlama | ETH 체제 · 코인 시장환경 |
| 현물 ETF 일별 순유입·연속일·과거 통계 | Farside, SoSoValue, CMC, Look Into Bitcoin | 코인 · 모닝 브리핑 |
| 공포·탐욕·BTC/ETH 도미넌스·총시총 24h | alternative.me, CMC, 업비트 데이터랩 | 코인 시장환경 · 코인 분석 |
| USDT 무기한 전 종목 가격·펀딩·OI 정렬 | CoinGlass, Binance 마켓 | 선물 |
| 업비트·빗썸 원화마켓 거래대금·상승·하락 랭킹 | 업비트, 데이터랩, 코인판 | 실시간 랭킹 |
| 계절성(BTC 월별 20년)·보유 자산 상관관계 | TradingView Seasonals, Koyfin | 계절성 · 내 자산 |
| 가격·조건 알림(앱 열림 시)·텔레그램 포지션 가드·아침 브리핑 | cryprice, CoinStats, TradingView | 가격 알림 · 무인 가드(5분) · 07:30 브리핑 |
| **매매일지 분석** — 기대값·PF·R 분포·MAE/MFE·포착률·요일×시간 히트맵·보유시간 구간·롱/숏·종목·손절 유무·포지션 크기 4분위·연패 후 성적(틸트)·과매매일·이익 반납·복구 매매·셋업별 포착률·주간 리뷰·비용 누수·가정(손절 배수) | Tradervue, TraderSync, Edgewonk, Tradezella | 복기 대시보드 · 매매일지 4탭 |

→ 저널 분석은 **4개 유료 저널 앱의 합집합 대부분**을 이미 갖고 있다. 대부분 사이트에 없는 강점이다.

## 2. 아직 없는 것 — 우선순위

판정 기준: (1) BTC·ETH 무기한 선물 매매에 직접 쓰이는가 (2) 키 없는 무료 경로가 실측으로 되는가 (3) 앱 원칙(방향 예측·진입 신호처럼 읽히는 UI 금지, XRP·SOL 전용 기능 금지)에 맞는가.

### 상 — 무료·실측 OK, 매매에 직접 쓰임

| 기능 | 있는 곳 | 무료 데이터(실측) | 메모 |
|---|---|---|---|
| **거래소 합산 OI + 가격 4분면**(OI↑가격↑ = 새 롱 유입 등) | CoinGlass, Coinalyze, Velo | Binance `futures/data/openInterestHist` 200 · Bybit `v5/market/open-interest` 200 · OKX `rubik/stat/contracts/open-interest-volume` 200 · Bitget 200 · Hyperliquid `metaAndAssetCtxs` 200 | 지금은 Bitget 단일 값. 단위(코인/USD) 통일 필요. Binance 파생 통계는 30일 한도 |
| **거래소 간 펀딩 비교**(Binance·Bybit·Hyperliquid 예상 펀딩·정산 주기) | CoinGlass Arbitrage, Coinalyze | Hyperliquid `POST /info {"type":"predictedFundings"}` **한 번 호출로 3거래소** 200 | 과열 쏠림 확인용. 정산 주기 다름(HL 1h·Binance 8h/4h) 표기 |
| **탑트레이더 vs 전체 계정 롱숏 델타** | CoinGlass, Hyblock(고래−개미) | Binance `topLongShortPositionRatio`·`topLongShortAccountRatio` 200 · OKX `long-short-account-ratio-contract-top-trader` 200 | 지금은 전체 계정 비율만. '탑' 정의는 거래소가 정함 |
| **베이시스(선물−현물)·연환산** | CoinGlass, Velo, Laevitas | Binance `futures/data/basis` 200(`basisRate`) | 펀딩과 함께 레버리지 비용·과열 판단 |
| **BTC 옵션 확장 — 맥스페인·행사가별 OI·풋/콜 비율·25델타 스큐·IV 기간구조** | Deribit Metrics, Laevitas, CoinGlass, Amberdata | Deribit `get_book_summary_by_currency?currency=BTC&kind=option` 200 · OKX `rubik/stat/option/open-interest-volume-ratio` 200 · Binance `eapi/v1/mark`(IV·델타 제공) | ETH 전용 코드(lib/coinOptions) 재사용. 맥스페인 '자석' 해석은 근거 약함 → 문구로 고지 |
| **코인별 김프 표**(업비트·빗썸 × 바이낸스, 환율 기준·USDT 기준 두 가지) + **테더 프리미엄** + **BTC 코인베이스 프리미엄** | 김프가, cryprice, 코인판, 데이터랩, CryptoQuant | 업비트 `v1/ticker/all?quote_currencies=KRW` 200 · 빗썸 `public/ticker/ALL_KRW` 200 · 바이낸스 `data-api.binance.vision` 200 · Coinbase `products/BTC-USD/ticker` 200 · frankfurter 환율 200 | 지금은 평균·분석 코인 1개, 코인베이스 프리미엄은 ETH만 |
| **업비트·빗썸 유의종목·투자주의·입출금 중단 + 상장·거래지원 종료 공지** | 업비트, 빗썸, 코인니스, Tree News | 업비트 `market/all?isDetails=true` 200 → 오늘 **유의 17개·주의 플래그 195개**(가격 급등락·거래량 급등·입금량 급등·글로벌 시세차·소수계정 집중) · 빗썸 `v1/market/virtual_asset_warning` 200 · 빗썸 `assetsstatus/ALL` 200 · 업비트 공지 `api-manager.upbit.com/api/v1/announcements` 200(비공식) · 바이낸스 신규 상장 CMS 200(비공식) | 관심 코인·보유 코인에 걸리면 표시. 공지 API는 비공식 → 실패 시 카드 숨김 |

### 중 — 무료지만 저장·배치가 필요하거나 해석 주의가 큼

| 기능 | 있는 곳 | 무료 데이터(실측) | 메모 |
|---|---|---|---|
| **코인 섹터·카테고리 성과 + 코인 히트맵** | CMC, CoinGecko, TradingView, 데이터랩 | CoinGecko `coins/categories` 200 · 업비트 ticker/all | 주식용 lib/treemap 재사용 가능 |
| **알트시즌 지수**(상위 50 중 90일 BTC 초과 비율) + **TOTAL2·TOTAL3·USDT.D 추이** | Blockchaincenter, CMC, TradingView, 데이터랩 | 직접 계산(CoinGecko 시총 상위 + 90일 수익률) · CMC 내부 `data-api/v3/altcoin-season/chart` 200(비공식) | 추이는 매일 스냅샷 저장 필요(data 브랜치) |
| **공포·탐욕 이력 + BTC 가격 겹쳐 보기** | CMC, alternative.me | `api.alternative.me/fng/?limit=0` 200(전 이력) | 현재값만 있음 → 차트 추가는 작음 |
| **온체인 밸류에이션 패널**: MVRV·실현가·거래소 보유량·넷플로(BTC·ETH) | Glassnode, CryptoQuant, Santiment, Look Into Bitcoin | CoinMetrics community `CapMVRVCur`·`SplyExNtv`·`FlowInExNtv` 200(비상업 라이선스) · 실현가 = 시총÷MVRV÷공급 · bitcoin-data.com STH 실현가·SOPR·NUPL(시간 10회·일 15회, 일부 7일 지연) | **사후·느린 지표** — 국면 참고·사이징용, 진입 신호 아님. 하루 1회 캐시 |
| **추정 레버리지 비율**(OI ÷ 거래소 보유량) | CryptoQuant | Binance OI + CoinMetrics `SplyExNtv` | CQ 값과 정의가 다름(거래소별 vs 합산) — 이름에 '근사' |
| **예측시장 BTC 가격 확률 래더**(날짜별 X달러 이상 확률) + Deribit 내재확률 비교 | Polymarket, Kalshi, Deribit Metrics | Polymarket gamma `public-search`·`events` 200 · Kalshi `KXBTCD` 200 · Deribit 옵션 IV | 이미 /inflation/markets 에 거시 예측시장 있음 → 코인 버전 |
| **크립토 일정 캘린더**(BTC·ETH 옵션 만기·CME 만기·FOMC·주요 거시) | CoinMarketCal, ForexFactory, Coinglass | Deribit 만기(상품명) · ForexFactory `ff_calendar_thisweek.json` 200 · Fed `calendar.json` 200 | 언락·업그레이드는 무료 경로 없음 → 제외 |
| **Hyperliquid 고래 포지션·실제 청산가** | CoinGlass HL, Hyperdash, HyperTracker | `stats-data.hyperliquid.xyz/Mainnet/leaderboard` 200 → 주소별 `clearinghouseState` 200(`liquidationPx`) | 추정이 아닌 **온체인 실측 청산가**. 단 HL 은 시장 일부·교차마진은 청산가가 움직임. 호출 수 많아 캐시 필요 |
| **CME COT — 레버리지 펀드·자산운용사 BTC/ETH 포지션(주간)** | Velo, Checkonchain 일부 | CFTC Socrata `gpe5-46if` 200 | 화요일 기준·금요일 공개(지연 명시) |
| **서버 알림 확장** — 김프·펀딩·유의종목·상장 공지 임계 텔레그램 | cryprice, CoinGlass, Hyblock | 기존 5분 pg_cron 가드 경로에 규칙 추가 | Vercel 크론 한도 이미 참 → 가드 경로에 얹기 |
| ETH 소각·발행·순공급 / 스테이킹 진입·퇴출 대기열 | ultrasound.money, validatorqueue | ultrasound `api/v2/fees/burn-sums` 200(비공식) · publicnode 비컨 `pending_deposits` 200 | ETH 체제 공급층 보강 후보(blockers 의 beaconcha.in 키 대안) |
| BTC 네트워크: 해시레이트·난이도 조정 예측·수수료 | mempool.space, Look Into Bitcoin | mempool `difficulty-adjustment` 200 · `mining/hashrate/3m` 200 | 정보 표시용(매매 영향 작음) |
| 트레저리(기업 보유 BTC·ETH) | BitcoinTreasuries, CoinGecko | CoinGecko `companies/public_treasury/bitcoin` 200 | 갱신 지연 가능 |

### 하 — 장기 맥락용이거나 과적합·가치 낮음

| 기능 | 있는 곳 | 메모 |
|---|---|---|
| 사이클 패널(Pi Cycle·200주 MA·Mayer·레인보우·CBBI) | Look Into Bitcoin, CBBI, blockchaincenter | 가격만으로 계산 가능하지만 **표본 4사이클 곡선 맞춤 — 과적합 위험 최대**. 선물 진입과 무관 |
| Bitfinex 마진 롱/숏·OKX 마진 대출 비율·보험기금 | CoinGlass, OKX | 무료 200이지만 한 거래소·소수 고래 위주 |
| 스테이블 SSR·체인별 분포·DeFi TVL·DEX 거래량·L2 | DefiLlama, L2Beat | 무료 200. BTC/ETH 선물 매매와 거리 있음 |
| 저널 추가: 샤프·소르티노·회복계수, 세션(아시아·유럽·미국) 분해, 종합 점수 레이더(Zella 가중식), 체크리스트 준수 여부별 성적 | Edgewonk, Tradezella | 이미 있는 데이터로 계산. 시간대 분해(KST 4시간)는 있음 |

### 막힘 — 무료 경로 없음 / 정직성 문제

| 기능 | 있는 곳 | 이유 |
|---|---|---|
| 청산 히트맵(CoinGlass 식) | CoinGlass, Hyblock, Kingfisher | **실제 주문이 아니라 모델**(OI 증가분 × 가정 레버리지 25/50/100x → 청산가). 만들려면 '레버리지 몰렸을 가능성 구간 · 모델 추정' 배지 필수. 공식 API 는 키 필요 |
| 오더북 히트맵·풋프린트 | TensorCharts, Exocharts | 호가·체결을 계속 저장해야 함(서버리스 단독 불가) |
| 스마트머니·엔티티 라벨 지갑 | Nansen, Arkham | 유료·키 |
| 소셜 볼륨·마인드셰어·Galaxy Score | Santiment, Kaito, LunarCrush | 무료는 30일 지연·429 / 401 / 유료 |
| 뉴스 투표 감성 | CryptoPanic | 무료 API 폐지(developer 경로 404) |
| 토큰 언락·에어드랍 | Tokenomist, DefiLlama, DropsTab | 유료(Pro·$999/월)·공개 API 없음. BTC·ETH 무관 |
| 고래 보유 분포·HODL Waves·LTH 공급 | Glassnode, BitInfoCharts | CoinMetrics 해당 지표 403, BitInfoCharts Cloudflare |
| CoinGecko 상승/하락·신규 코인 | CoinGecko | PRO 전용(401) → 업비트 ticker 정렬로 대체 가능 |

## 3. 원칙 (모든 추가 기능 공통)

- **방향 예측·진입 신호처럼 읽히는 UI 금지**(코인 727건 49.7% — 엣지 없음 측정). 새 지표는 "현재 상태·과거 빈도"로만 표시하고 엔진 점수에 넣지 않는다. 측정 판정 기준·신호 정의·모의 테스트 규칙은 건드리지 않는다.
- 모델 추정(청산 레벨·추정 레버리지·GEX)은 이름과 배지에 **'추정'**, 사후 지표(MVRV·실현가·사이클)는 **'느린 지표'** 를 붙인다.
- 비공식 엔드포인트(CMC data-api·업비트 api-manager·바이낸스 bapi·ultrasound·CBBI)는 형식이 바뀌면 카드째 숨김(지어낸 숫자 없음), 파서는 단위 테스트로 고정.
- Binance·Bybit·업비트는 미국 IP 차단 → 라우트 `preferredRegion='icn1'` 유지, Binance 현물은 `data-api.binance.vision` 대체 경로.
- 한도가 빡빡한 소스(bitcoin-data.com 일 15회, CoinGecko 무키, OKX 2초 5회)는 서버 캐시로 하루·시간 단위 1회.
- XRP·SOL 전용 기능은 만들지 않는다(전 종목 표·4코인 공통은 가능).
