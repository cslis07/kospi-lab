import type { CalendarEvent } from '@/lib/types';

/**
 * 정적 일정(오프라인·서버 분석 공용). 미국 FOMC·고용·CPI 날짜는 공식 일정으로 맞춤(2026-11-04 확인):
 * FOMC = 연준 fomccalendars(결정 = 회의 둘째 날), 고용·CPI = BLS 일정(FRED release calendar 10·50 로 대조).
 * 경제 캘린더 화면은 여기에 /api/risk/events(공식 일정)를 덮어 쓴다(lib/calendarOfficial) — 날짜가 어긋나면 공식이 우선.
 */

export const CALENDAR_EVENTS: CalendarEvent[] = [
  // ── FOMC 2025 ──────────────────────────────────
  { date: '2025-10-29', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '10월 연방공개시장위원회 기준금리 발표' },
  { date: '2025-12-10', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '12월 연방공개시장위원회 기준금리 발표' },

  // ── FOMC 2026 ──────────────────────────────────
  { date: '2026-01-28', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '1월 연방공개시장위원회 기준금리 발표' },
  { date: '2026-03-18', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '3월 FOMC + 점도표 (SEP) 발표' },
  { date: '2026-04-29', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high' },
  { date: '2026-06-17', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '6월 FOMC + 점도표 발표' },
  { date: '2026-07-29', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high' },
  { date: '2026-09-16', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '9월 FOMC + 점도표 발표' },
  { date: '2026-10-28', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high' },
  { date: '2026-12-09', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '12월 FOMC + 점도표 발표' },

  // ── 한국은행 금통위 2025 ──────────────────────
  { date: '2025-11-28', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },

  // ── 한국은행 금통위 2026 ──────────────────────
  { date: '2026-01-16', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-02-27', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-04-17', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-05-29', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-07-10', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-08-28', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-10-16', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },
  { date: '2026-11-27', title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' },

  // ── 미국 주요 경제지표 (월별 반복) ────────────
  { date: '2026-01-09', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high', desc: '비농업 신규고용·실업률 발표' },
  { date: '2026-01-13', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-02-11', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-02-13', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-03-06', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-03-11', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-04-03', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-04-10', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-05-08', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-05-12', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-06-05', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-06-10', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-07-02', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-07-14', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-08-07', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-08-12', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-09-04', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-09-11', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-10-02', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-10-14', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-11-06', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-11-10', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-12-04', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-12-10', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },

  // ── 국내 실적시즌 ─────────────────────────────
  { date: '2026-01-20', title: '4Q25 실적시즌 시작 (국내)', category: 'earnings', country: 'KR', importance: 'medium', desc: '삼성전자·SK하이닉스 등 주요 기업 4분기 실적 발표' },
  { date: '2026-04-20', title: '1Q26 실적시즌 시작 (국내)', category: 'earnings', country: 'KR', importance: 'medium' },
  { date: '2026-07-20', title: '2Q26 실적시즌 시작 (국내)', category: 'earnings', country: 'KR', importance: 'medium' },
  { date: '2026-10-20', title: '3Q26 실적시즌 시작 (국내)', category: 'earnings', country: 'KR', importance: 'medium' },

  // ── 미국 실적시즌 ─────────────────────────────
  { date: '2026-01-13', title: '4Q25 실적시즌 시작 (미국)', category: 'earnings', country: 'US', importance: 'medium', desc: '빅뱅크(JPM·GS·MS) 실적 발표로 시즌 개막' },
  { date: '2026-04-14', title: '1Q26 실적시즌 시작 (미국)', category: 'earnings', country: 'US', importance: 'medium' },
  { date: '2026-07-14', title: '2Q26 실적시즌 시작 (미국)', category: 'earnings', country: 'US', importance: 'medium' },
  { date: '2026-10-13', title: '3Q26 실적시즌 시작 (미국)', category: 'earnings', country: 'US', importance: 'medium' },

  // ── 공휴일·휴장 ──────────────────────────────
  { date: '2026-01-01', title: '신정 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-02-16', title: '설 연휴 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-02-17', title: '설날 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-02-18', title: '설 연휴 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-06-03', title: '지방선거일 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-07-17', title: '제헌절 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low', desc: '2026년 공휴일 재지정' },
  { date: '2026-06-19', title: 'Juneteenth (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-07-03', title: '독립기념일 대체 (미국 휴장)', category: 'holiday', country: 'US', importance: 'low', desc: '7/4(토) → 7/3(금) 휴장' },
  { date: '2026-01-19', title: 'MLK Day (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-02-16', title: "Presidents' Day (미국 휴장)", category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-04-03', title: '성금요일 (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-05-05', title: '어린이날 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-05-25', title: 'Memorial Day (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-06-04', title: '현충일 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-08-17', title: '광복절 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-09-07', title: 'Labor Day (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-09-24', title: '추석 연휴 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-09-25', title: '추석 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-10-03', title: '개천절 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-10-09', title: '한글날 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-11-26', title: 'Thanksgiving (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-12-25', title: '크리스마스 (한국·미국 휴장)', category: 'holiday', country: 'global', importance: 'low' },
  { date: '2026-12-31', title: '연말 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },

  // ── 2027 (2026-11-06 확인) ─────────────────────
  // 한국은행 통화정책방향 결정회의 8회 — 2026-10-29 금통위 의결(SBS Biz 보도, 한은 홈페이지 최종 확인 권장)
  ...['2027-01-14', '2027-02-25', '2027-04-09', '2027-05-27', '2027-07-15', '2027-08-26', '2027-10-15', '2027-11-25']
    .map((date): CalendarEvent => ({ date, title: '한국은행 기준금리 결정', category: 'bok', country: 'KR', importance: 'high' })),
  // 한국 휴장(평일만) — 한국천문연구원 2027 공휴일(대체공휴일 포함) + 연말 휴장. 임시공휴일은 지정되면 추가
  ...([
    ['2027-01-01', '신정'], ['2027-02-08', '설 연휴'], ['2027-02-09', '설 대체공휴일'], ['2027-03-01', '삼일절'],
    ['2027-05-03', '노동절 대체공휴일'], ['2027-05-05', '어린이날'], ['2027-05-13', '부처님오신날'], ['2027-07-19', '제헌절 대체공휴일'],
    ['2027-08-16', '광복절 대체공휴일'], ['2027-09-14', '추석 연휴'], ['2027-09-15', '추석'], ['2027-09-16', '추석 연휴'],
    ['2027-10-04', '개천절 대체공휴일'], ['2027-10-11', '한글날 대체공휴일'], ['2027-12-27', '성탄절 대체공휴일'], ['2027-12-31', '연말'],
  ] as const).map(([date, t]): CalendarEvent => ({ date, title: `${t} (한국 휴장)`, category: 'holiday', country: 'KR', importance: 'low' })),
  // 미국 휴장 — NYSE 2027 휴장 일정(2025-12 발표). 11/26 13:00 ET 조기 폐장
  ...([
    ['2027-01-01', '신정'], ['2027-01-18', 'MLK Day'], ['2027-02-15', "Presidents' Day"], ['2027-03-26', '성금요일'],
    ['2027-05-31', 'Memorial Day'], ['2027-06-18', 'Juneteenth 대체'], ['2027-07-05', '독립기념일 대체'], ['2027-09-06', 'Labor Day'],
    ['2027-11-25', 'Thanksgiving'], ['2027-12-24', '크리스마스 대체'],
  ] as const).map(([date, t]): CalendarEvent => ({ date, title: `${t} (미국 휴장)`, category: 'holiday', country: 'US', importance: 'low' })),
  // 실적시즌 — 대략적인 시작 무렵(분기 종료 후 3주 전후, 2026년과 같은 관행)
  ...([['2027-01-20', '4Q26'], ['2027-04-20', '1Q27'], ['2027-07-20', '2Q27'], ['2027-10-20', '3Q27']] as const)
    .map(([date, q]): CalendarEvent => ({ date, title: `${q} 실적시즌 시작 (국내)`, category: 'earnings', country: 'KR', importance: 'medium', desc: '대략적 시작 무렵' })),
  ...([['2027-01-12', '4Q26'], ['2027-04-13', '1Q27'], ['2027-07-13', '2Q27'], ['2027-10-12', '3Q27']] as const)
    .map(([date, q]): CalendarEvent => ({ date, title: `${q} 실적시즌 시작 (미국)`, category: 'earnings', country: 'US', importance: 'medium', desc: '대략적 시작 무렵(빅뱅크 실적)' })),
];
