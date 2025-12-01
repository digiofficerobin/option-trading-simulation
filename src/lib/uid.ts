
// src/lib/uid.ts
let __uidCounter = 0;

/** Generate a short unique id with an optional prefix. */
export function uid(prefix = 'id'): string {
  // Use a timestamp + an incrementing counter to avoid collisions within the same ms
  const ts = Date.now().toString(36);
  const cnt = (__uidCounter++).toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${ts}${cnt}${rand}`;
}
