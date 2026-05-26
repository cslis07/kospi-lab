'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      document.documentElement.classList.add('light');
      setDark(false);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      title={dark ? '라이트 모드' : '다크 모드'}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-base"
    >
      {dark ? '☀' : '🌙'}
    </button>
  );
}
