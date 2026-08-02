export const theme = {
  bg: '#0B0D10',
  surface: '#15181D',
  border: '#242A31',
  text: '#F2F4F7',
  muted: '#8A94A3',
  accent: '#FF5A1F',
  good: '#3DDC97',
  bad: '#FF6B6B',
} as const;

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
};
