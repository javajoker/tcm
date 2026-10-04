/** A random local id (assessment, draft). Not a secret and carries no personal data; used in URLs and storage keys. */
export function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID().replaceAll("-", "").slice(0, 16);
  const bytes = new Uint8Array(8);
  if (c?.getRandomValues) c.getRandomValues(bytes); else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
