// Record real replies of Anthropic's Messages API for the adapter's contract tests (task PM-49; apps/ai-gateway/test/fixtures/anthropic/README.md).
//   node scripts/ai/record.ts                                  print what a run would do and cost in calls — nothing is sent
//   ANTHROPIC_API_KEY=… node scripts/ai/record.ts --run         run it: the scripted personas of the evaluation talk with the real model, and each raw response is saved
//   options: --out <dir> (apps/ai-gateway/test/fixtures/anthropic/recorded) · --personas <n> (2) · --langs zh-Hant,zh-Hans,en (all three) · --turns <n> (4 per conversation) · --model <name>
// The personas are the evaluation's synthetic typical patients: no real person's words are ever sent or written. The key is read from the environment, used for the calls and never written.
// Each file holds the request's conversation (language, messages, confirmed ids — the vocabulary is rebuilt from the data) and the raw response; the adapter's tests replay them.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGS, validateReply } from "../../packages/ai/src/index.ts";
import type { Lang } from "../../packages/ai/src/index.ts";
import { anthropicProvider } from "../../apps/ai-gateway/src/anthropic.ts";
import { converse, personas } from "./eval.ts";
import type { Turn } from "./eval.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DEFAULT_OUT = join(root, "apps", "ai-gateway", "test", "fixtures", "anthropic", "recorded");

export interface RecordOptions { readonly apiKey: string; readonly model: string; readonly baseUrl: string; readonly out: string; readonly fetch?: typeof fetch }

/** A turn that asks the real model and saves the raw response beside the conversation it answered; what it returns is what the gateway would let through. */
export function recordingTurn(o: RecordOptions, counter: { n: number }): Turn {
  mkdirSync(o.out, { recursive: true });
  const send = o.fetch ?? fetch;
  return async (request) => {
    let raw: unknown;
    const provider = anthropicProvider({
      apiKey: o.apiKey, model: o.model, baseUrl: o.baseUrl, maxTokens: 1024, promptCache: false,
      fetch: (async (url: string | URL, init?: RequestInit) => { const r = await send(url, init); raw = await r.clone().json().catch(() => undefined); return r; }) as typeof fetch,
    });
    try {
      const reply = await provider.turn(request, AbortSignal.timeout(60_000));
      writeFileSync(join(o.out, `${String(++counter.n).padStart(3, "0")}-${request.lang}.json`), `${JSON.stringify({ lang: request.lang, messages: request.messages, confirmed: request.confirmed, response: raw }, null, 2)}\n`);
      return validateReply(reply, request).reply;
    } catch (e) {
      return { error: e instanceof Error ? e.name : "Error" };
    }
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const langs = (opt("--langs")?.split(",") ?? [...LANGS]) as Lang[];
  const bad = langs.filter((l) => !LANGS.includes(l));
  if (bad.length > 0) { process.stderr.write(`unknown language: ${bad.join(", ")}\n`); process.exit(2); }
  const perLang = Number(opt("--personas") ?? "2"), turns = Number(opt("--turns") ?? "4");
  const out = resolve(opt("--out") ?? DEFAULT_OUT);
  const calls = langs.length * perLang * turns;
  process.stdout.write(`${langs.length} language(s) × ${perLang} persona(s) × up to ${turns} turn(s) = up to ${calls} call(s); about 7–9 thousand input tokens and 0.3 thousand output tokens each; into ${out}\n`);
  if (!args.includes("--run")) { process.stdout.write("nothing sent: add --run (and ANTHROPIC_API_KEY) to run it\n"); process.exit(0); }
  const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
  if (apiKey.length < 20) { process.stderr.write("ANTHROPIC_API_KEY is not set\n"); process.exit(2); }
  const options: RecordOptions = { apiKey, model: opt("--model") ?? process.env["AI_MODEL"] ?? "claude-sonnet-5-5", baseUrl: process.env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com", out };
  const counter = { n: 0 };
  const turn = recordingTurn(options, counter);
  let failed = 0;
  for (const lang of langs) for (const p of personas(lang).slice(0, perLang)) { const r = await converse(p, turn, turns); if (r.error !== null) failed++; }
  process.stdout.write(`${counter.n} response(s) saved; ${failed} conversation(s) ended in an error\n`);
  process.exit(failed > 0 ? 1 : 0);
}
