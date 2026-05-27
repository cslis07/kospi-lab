import type { CalendarEvent } from '@/lib/types';

export const CALENDAR_EVENTS: CalendarEvent[] = [
  // ── FOMC 2025 ──────────────────────────────────
  { date: '2025-10-28', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '10월 연방공개시장위원회 기준금리 발표' },
  { date: '2025-12-17', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '12월 연방공개시장위원회 기준금리 발표' },

  // ── FOMC 2026 ──────────────────────────────────
  { date: '2026-01-28', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '1월 연방공개시장위원회 기준금리 발표' },
  { date: '2026-03-18', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '3월 FOMC + 점도표 (SEP) 발표' },
  { date: '2026-04-29', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high' },
  { date: '2026-06-10', title: 'FOMC 금리 결정', category: 'fomc', country: 'US', importance: 'high', desc: '6월 FOMC + 점도표 발표' },
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
  { date: '2026-01-15', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-02-06', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-02-12', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-03-06', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-03-12', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-04-03', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-04-10', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-05-08', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-05-13', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-06-05', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-06-11', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-07-02', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-07-14', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-08-07', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-08-13', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-09-04', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-09-10', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-10-02', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-10-13', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-11-06', title: '미국 고용보고서 (NFP)', category: 'indicator', country: 'US', importance: 'high' },
  { date: '2026-11-12', title: '미국 CPI (소비자물가)', category: 'indicator', country: 'US', importance: 'high' },
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
  { date: '2026-01-27', title: '설 연휴 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-01-28', title: '설날 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-01-29', title: '설 연휴 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-01-19', title: 'MLK Day (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-02-16', title: "Presidents' Day (미국 휴장)", category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-04-03', title: '성금요일 (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-05-05', title: '어린이날 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-05-25', title: 'Memorial Day (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-06-04', title: '현충일 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-07-04', title: '독립기념일 (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-08-17', title: '광복절 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-09-07', title: 'Labor Day (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-09-24', title: '추석 연휴 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-09-25', title: '추석 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-10-03', title: '개천절 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-10-09', title: '한글날 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
  { date: '2026-11-26', title: 'Thanksgiving (미국 휴장)', category: 'holiday', country: 'US', importance: 'low' },
  { date: '2026-12-25', title: '크리스마스 (한국·미국 휴장)', category: 'holiday', country: 'global', importance: 'low' },
  { date: '2026-12-31', title: '연말 (한국 휴장)', category: 'holiday', country: 'KR', importance: 'low' },
];
