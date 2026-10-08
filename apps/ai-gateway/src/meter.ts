// Budgets and rate limits, counted in memory (docs/post-mvp/design/ai-assisted-intake.md §7): turns of the conversation and photos of the observation, each per session, per session
// per minute and per day for the whole instance, and sessions per minute for the instance. A photo costs more than a turn, so it has budgets of its own. Nothing is stored: a
// session's counts live as long as its token and are dropped with it. The counts are per instance — a host that runs many instances adds its own rate-limiting rule in front
// (deployment notes, task PM-49).
const MINUTE = 60_000;
const DAY = 86_400_000;

export interface MeterLimits {
  readonly turnsPerSession: number;
  readonly turnsPerMinute: number;
  readonly turnsPerDay: number;
  readonly sessionsPerMinute: number;
  readonly photosPerSession: number;
  readonly photosPerMinute: number;
  readonly photosPerDay: number;
}

/** What is counted: a turn of the conversation, or a photo of the observation (PM-50). */
export type Kind = "turn" | "photo";

interface Bucket { used: number; minute: number; inMinute: number }
interface Count { readonly turn: Bucket; readonly photo: Bucket; readonly expiresAt: number }

export type Admitted = { readonly ok: true; readonly turn: number; readonly left: number } | { readonly ok: false; readonly error: "budget" | "rate" | "busy" };

export class Meter {
  readonly #limits: MeterLimits;
  readonly #sessions = new Map<string, Count>();
  #day = { day: -1, turn: 0, photo: 0 };
  #started = { minute: -1, count: 0 };

  constructor(limits: MeterLimits) {
    this.#limits = limits;
  }

  /** A new session may start: the instance has not started too many this minute. */
  admitSession(now: number): boolean {
    const minute = Math.floor(now / MINUTE);
    if (this.#started.minute !== minute) this.#started = { minute, count: 0 };
    if (this.#started.count >= this.#limits.sessionsPerMinute) return false;
    this.#started.count++;
    return true;
  }

  /** One turn of a session, counted when admitted (a turn that fails at the provider still counts). */
  admitTurn(sid: string, expiresAt: number, now: number): Admitted {
    return this.#admit("turn", this.#limits.turnsPerSession, this.#limits.turnsPerMinute, this.#limits.turnsPerDay, sid, expiresAt, now);
  }

  /** One photo of a session, counted when admitted, by the same rule. */
  admitPhoto(sid: string, expiresAt: number, now: number): Admitted {
    return this.#admit("photo", this.#limits.photosPerSession, this.#limits.photosPerMinute, this.#limits.photosPerDay, sid, expiresAt, now);
  }

  #admit(kind: Kind, perSession: number, perMinute: number, perDay: number, sid: string, expiresAt: number, now: number): Admitted {
    this.#prune(now);
    const day = Math.floor(now / DAY);
    if (this.#day.day !== day) this.#day = { day, turn: 0, photo: 0 };
    const minute = Math.floor(now / MINUTE);
    const c = this.#sessions.get(sid) ?? { turn: { used: 0, minute, inMinute: 0 }, photo: { used: 0, minute, inMinute: 0 }, expiresAt };
    const b = c[kind];
    if (b.minute !== minute) { b.minute = minute; b.inMinute = 0; }
    if (b.used >= perSession) return { ok: false, error: "budget" };
    if (b.inMinute >= perMinute) return { ok: false, error: "rate" };
    if (this.#day[kind] >= perDay) return { ok: false, error: "busy" };
    b.used++;
    b.inMinute++;
    this.#day[kind]++;
    this.#sessions.set(sid, c);
    return { ok: true, turn: b.used, left: perSession - b.used };
  }

  /** Sessions counted now (for tests). */
  get size(): number {
    return this.#sessions.size;
  }

  #prune(now: number): void {
    for (const [sid, c] of this.#sessions) if (c.expiresAt <= now) this.#sessions.delete(sid);
  }
}
