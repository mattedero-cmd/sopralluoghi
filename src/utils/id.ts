export function nuovoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback per ambienti senza Web Crypto (test, browser datati)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
