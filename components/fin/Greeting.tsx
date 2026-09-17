'use client';

/**
 * 홈 상단 인사 헤더(레퍼런스의 'Welcome back' 자리) — 로그인이 없는 앱이라 이름 대신 오늘 날짜와 장 상태.
 * KST 평일 09:00~15:30 기준. ⚠ 공휴일은 반영하지 않는다(헤더의 장 상태와 동일한 한계).
 * SSR 불일치를 피하려고 마운트 후 계산한다.
 */
import { useEffect, useState } from 'react';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function kst() {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
}
function dur(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}시간${r ? ` ${r}분` : ''}` : `${r}분`;
}

export default function Greeting() {
  const [s, setS] = useState<{ date: string; open: boolean; text: string } | null>(null);

  useEffect(() => {
    const calc = () => {
      const k = kst();
      const mins = k.getHours() * 60 + k.getMinutes();
      const weekday = k.getDay() >= 1 && k.getDay() <= 5;
      const open = weekday && mins >= 540 && mins < 930;
      const text = open ? `국내 개장 · 마감까지 ${dur(930 - mins)}`
        : !weekday ? '주말 휴장'
        : mins < 540 ? `국내 개장 전 · ${dur(540 - mins)} 후`
        : '국내 장 마감';
      setS({ date: `${k.getMonth() + 1}월 ${k.getDate()}일 (${DOW[k.getDay()]})`, open, text });
    };
    calc();
    const id = setInterval(calc, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fin-greet">
      <div className="min-w-0">
        <div className="t1">오늘의 시장</div>
        <div className="t2">{s ? s.date : <span className="skeleton h-5 w-28 mt-1" />}</div>
      </div>
      {s && <span className={`fin-status ${s.open ? 'open' : ''}`}><i />{s.text}</span>}
    </div>
  );
}
