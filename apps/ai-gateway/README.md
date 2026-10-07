# AI help gateway

The small service between the app and a model provider for **AI help** (Release F; [design](../../docs/post-mvp/design/ai-assisted-intake.md), [impact assessment](../../docs/post-mvp/privacy/ai-help-dpia.md)).
It holds the provider's key, counts each session's turns, passes a turn to the provider and returns only what the validator of [`@tcm/ai`](../../packages/ai) lets through.
It stores nothing and logs counts and codes only. **Development only** until the gates of the design's §6 are passed; deploying it and the provider's key are the owner's step (task PM-49).

## Routes

| Route | What it does |
|---|---|
| `GET /v1/config` | The modules on (all off when the kill switch is set) and the limits |
| `POST /v1/session` | A session token: a random id and an expiry, signed with HMAC-SHA-256 — no account, nothing about the person |
| `POST /v1/intake/turn` | One turn: `Authorization: Bearer <token>`, a JSON `TurnRequest` (the conversation, the app's vocabulary in the session's language, the confirmed ids). The answer is a `TurnResponse`: the validated reply, the codes of what was dropped, the turns left |

Only the origins in `AI_ALLOWED_ORIGINS` are served (403 otherwise); errors are `{ "v": 1, "error": "<code>" }` with the codes of `ErrorCode` in [`protocol.ts`](../../packages/ai/src/protocol.ts).
Every answer carries `cache-control: no-store`.

## What a reply may hold

A proposal names a finding of the request's vocabulary that is not confirmed yet, with a confidence from 0 to 1 and **the person's own words** as evidence (a part of one of
their messages, compared without width, case, spaces or punctuation); a severity only for a present finding. The question must pass the wording lint
([i18n guide §5.1](../../docs/i18n-guide.md)): no pattern, constitution, formula or herb name, no amount, no label, no forbidden wording. Everything else — unknown fields, a
diagnosis, a formula, instructions — is dropped and reported by code (`extra`, `unknown-id`, `no-evidence`, `wording` …), never by content.

## Configuration (environment)

| Variable | Default | Meaning |
|---|---|---|
| `AI_SECRET` | — (required, ≥ 32 characters) | Signs session tokens. A secret of the host |
| `AI_ALLOWED_ORIGINS` | — (required) | The app's origins, comma-separated |
| `AI_MODULES` | `conversation` | The modules on. `tongue` and `face` are not built (PD-25, PM-50) and are refused |
| `AI_KILL` | off | `1` or `true`: every module off at once, without a release |
| `AI_PROVIDER` | `mock` | The provider. The adapter for Anthropic's API is task PM-49 |
| `AI_SESSION_MINUTES` | 60 | How long a session token lives |
| `AI_TURNS_PER_SESSION` | 30 | Turns a session may take |
| `AI_TURNS_PER_MINUTE` | 10 | Turns a session may take in a minute |
| `AI_TURNS_PER_DAY` | 2000 | Turns one instance serves in a (UTC) day |
| `AI_SESSIONS_PER_MINUTE` | 60 | Sessions one instance starts in a minute |
| `AI_TIMEOUT_MS` | 20000 | How long the provider has for a reply |

A gateway configured wrongly refuses to start. The counts are kept in memory, per instance, and dropped with the session; a host that runs many instances adds its own
rate-limiting rule in front. The limits of one request (size, messages, vocabulary …) are `LIMITS` in [`protocol.ts`](../../packages/ai/src/protocol.ts).

## The log

One JSON line per request: `route`, `method`, `status`, `ms`, and when they apply `error` (a code), `exception` (a class name such as `TypeError`), `turn`, `chars` (how many
characters the person wrote), `proposals`, `dropped`. No field can hold text; a test runs a whole session with marked words and checks that none reaches the log.

## Running it

```bash
pnpm --filter @tcm/ai-gateway dev
```

starts it on `http://127.0.0.1:8787` with the mock provider, a random secret for the run and the local origins of the dev server and the previews (`src/node.ts --dev`;
anything set in the environment still wins, e.g. `AI_KILL=1`). `src/worker.ts` is the same handler as a Worker.

```bash
pnpm --filter @tcm/ai-gateway test
```

runs the contract tests: the routes with the mock, a reply outside the schema dropped, tokens, budgets and rate limits, the kill switch, a failing and a slow provider, the
body limit over real HTTP, and the log.
