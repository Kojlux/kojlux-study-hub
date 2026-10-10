const DAY_MS: number = 24 * 60 * 60 * 1000;

export function getGreeting(date: Date = new Date()): string {
  const hour: number = date.getHours();
  if (hour < 5) return 'Still up studying';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatRelativeTime(iso: string): string {
  const date: Date = new Date(iso);
  const diffDays: number = Math.floor((Date.now() - date.getTime()) / DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
