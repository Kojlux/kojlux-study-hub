// Namespaces a storage key to the active user so account-specific data
// (recents, recall cards, streak, etc.) never leaks between two different
// signed-in accounts on the same device, or between an account and a guest
// session. `scopeId` should be the signed-in user's uid/email, or a stable
// sentinel like 'guest' when nobody is signed in. Keys that are genuinely
// device-wide (dark mode, notification prefs) should NOT be scoped — pass
// them straight to loadLocal/saveLocal instead.
export function scopedKey(baseKey: string, scopeId: string): string {
  return `${baseKey}::${scopeId}`;
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Failed to persist ${key}`, err);
  }
}

export function clearLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`Failed to clear ${key}`, err);
  }
}