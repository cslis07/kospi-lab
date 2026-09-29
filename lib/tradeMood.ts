/**
 * 매매별 '진입 당시 기분(심리)' 상수 — 매매일지 오버레이의 단일 소스.
 * 방향 예측이 아니라 규율 복기용: 어떤 심리 상태에서 낸 매매가 실제로 어땠는지 월별로 되짚는다.
 */
export type MoodKey = 'calm' | 'confident' | 'fomo' | 'anxious' | 'revenge' | 'bored';

export interface MoodMeta {
  key: MoodKey;
  emoji: string;
  label: string;
  /** good=계획적/차분, bad=충동/과열, neutral=애매 — 표시 톤용 */
  tone: 'good' | 'bad' | 'neutral';
}

export const MOODS: MoodMeta[] = [
  { key: 'calm',      emoji: '😌', label: '평온·계획대로', tone: 'good' },
  { key: 'confident', emoji: '😎', label: '자신감',        tone: 'good' },
  { key: 'fomo',      emoji: '🏃', label: '추격·FOMO',     tone: 'bad' },
  { key: 'anxious',   emoji: '😰', label: '불안·조급',      tone: 'bad' },
  { key: 'revenge',   emoji: '😡', label: '복수심·만회',    tone: 'bad' },
  { key: 'bored',     emoji: '🥱', label: '심심풀이',      tone: 'neutral' },
];

export const MOOD_BY_KEY: Map<MoodKey, MoodMeta> = new Map(MOODS.map((m) => [m.key, m]));
