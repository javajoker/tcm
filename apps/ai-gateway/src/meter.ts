// Budgets and rate limits, counted in memory (docs/post-mvp/design/ai-assisted-intake.md §7): turns per session, turns per session per minute, turns per day and sessions per
// minute for the whole instance. Nothing is stored: a session's count lives as long as its token and is dropped with it. The counts are per instance — a host that runs many
// instances adds its own rate-limiting rule in front (deployment notes, task PM-49).
const MINUTE = 60_000;
const DAY = 86_400_000;

export interface MeterLimits {
  readonly turnsPerSession: number;
  readonly turnsPerMinute: number;
  readonly turnsPerDay: number;
  readonly sessionsPerMinute: number;
}

interface Count { turns: number; minute: number; inMinute: number; readonly expiresAt: number }

export type Admitted = { readonly ok: true; readonly turn: number; readonly left: number } | { readonly ok: false; readonly error: "budget" | "rate" | "busy" };

export class Meter {
  readonly #limits: MeterLimits;
  readonly #sessions = new Map<string, Count>();
  #day = { day: -1, turns: 0 };
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
    this.#prune(now);
    const day = Math.floor(now / DAY);
    if (this.#day.day !== day) this.#day = { day, turns: 0 };
    const minute = Math.floor(now / MINUTE);
    const c = this.#sessions.get(sid) ?? { turns: 0, minute, inMinute: 0, expiresAt };
    if (c.minute !== minute) { c.minute = minute; c.inMinute = 0; }
    if (c.turns >= this.#limits.turnsPerSession) return { ok: false, error: "budget" };
    if (c.inMinute >= this.#limits.turnsPerMinute) return { ok: false, error: "rate" };
    if (this.#day.turns >= this.#limits.turnsPerDay) return { ok: false, error: "busy" };
    c.turns++;
    c.inMinute++;
    this.#day.turns++;
    this.#sessions.set(sid, c);
    return { ok: true, turn: c.turns, left: this.#limits.turnsPerSession - c.turns };
  }

  /** Sessions counted now (for tests). */
  get size(): number {
    return this.#sessions.size;
  }

  #prune(now: number): void {
    for (const [sid, c] of this.#sessions) if (c.expiresAt <= now) this.#sessions.delete(sid);
  }
}
