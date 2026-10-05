// A passphrase for a backup (and, later, for the lock): at least ten characters, and a hint about how it will hold up. Nothing here is stored or sent; it only decides what the dialog says.
// The hint is honest about its limits: it cannot know what an attacker with a copy of the file will try, only that short and common choices fall first.

export const MIN_PASSPHRASE = 10;
export type Strength = "weak" | "fair" | "good";

const COMMON = ["password", "passw0rd", "1234567890", "12345678910", "qwertyuiop", "qwerty123", "iloveyou", "letmein", "welcome", "admin", "abc123", "111111", "000000", "asdfghjkl", "zxcvbnm", "changeme", "football", "baseball", "monkey", "dragon", "master", "login", "princess", "sunshine", "trustno1", "654321", "88888888", "00000000", "woaini", "5201314"];

export interface PassphraseCheck {
  /** Long enough to accept. */
  readonly ok: boolean;
  readonly strength: Strength;
}

export function checkPassphrase(passphrase: string): PassphraseCheck {
  const chars = [...passphrase.normalize("NFKC")];
  if (chars.length < MIN_PASSPHRASE) return { ok: false, strength: "weak" };
  const lower = passphrase.toLowerCase();
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(passphrase)).length;
  const distinct = new Set(chars).size;
  if (COMMON.some((c) => lower.includes(c)) && chars.length < 16) return { ok: true, strength: "weak" };
  if (distinct < 5) return { ok: true, strength: "weak" };
  if (chars.length >= 16 || (chars.length >= 12 && kinds >= 3)) return { ok: true, strength: "good" };
  return { ok: true, strength: "fair" };
}
