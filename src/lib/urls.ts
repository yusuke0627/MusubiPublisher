export function withBase(path: string): string {
  const rawBase = import.meta.env.BASE_URL || '/';
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

export function formatDateJa(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}
