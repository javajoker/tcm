# AI help gateway

The small service between the app and a model provider for **AI help** (Release F; [design](../../docs/post-mvp/design/ai-assisted-intake.md), [impact assessment](../../docs/post-mvp/privacy/ai-help-dpia.md)).
It holds the provider's key, counts each session's turns and photos, passes a turn or a photo to the provider and returns only what the validator of [`@tcm/ai`](../../packages/ai) lets through.
It stores nothing and logs counts and codes only. **Development only** until the gates of the design's §6 are passed; deploying it and holding the provider's key are the owner's step — [`DEPLOY.md`](DEPLOY.md) is the way, [`wrangler.example.toml`](wrangler.example.toml) the template.

## Routes

| Route | What it does |
|---|---|
| `GET /v1/config` | The modules on (all off when the kill switch is set) and the limits |
| `POST /v1/session` | A session token: a random id and an expiry, signed with HMAC-SHA-256 — no account, nothing about the person |
| `POST /v1/intake/turn` | One turn: `Authorization: Bearer <token>`, a JSON `TurnRequest` (the conversation, the app's vocabulary in the session's language, the confirmed ids). The answer is a `TurnResponse`: the validated reply, the codes of what was dropped, the turns left |
| `POST /v1/observe/tongue`, `POST /v1/observe/face` | One photo (PM-50; **development builds only**): `Authorization: Bearer <token>`, a JSON `ObserveBody` — a JPEG **without metadata** (base64), the module's features in the session's language and the exclusive groups among them. The route names the module. The answer is an `ObserveResponse`: whether the photo could be read, the features it shows (from the request's list), the codes of what was dropped, the photos left |

Only the origins in `AI_ALLOWED_ORIGINS` are served (403 otherwise); errors are `{ "v": 1, "error": "<code>" }` with the codes of `ErrorCode` in [`protocol.ts`](../../packages/ai/src/protocol.ts).
Every answer carries `cache-control: no-store`.

## What a photo may be, and what a reply to it may hold

A photo is a **JPEG** (`data` in base64, no `data:` prefix) of at most 512 KiB (request body at most 768 KiB) whose longer side is 200–2048 px and whose **segments are checked** — a JPEG with an APP1–APP15 segment (EXIF with a place or a time, XMP, IPTC, an ICC profile), a comment, a JFIF thumbnail, data after its end, or a cut-short structure is refused with `image` (400) before the provider is called and before a photo is counted. The app re-encodes every picture on the device and strips it (`stripJpeg`); the gateway does not trust that. The features are the module's own ids with labels in the session's language and a group; `exclusive` lists groups of ids of which at most one can be true.

The reply is `{ readable, suggestions: [{ id, confidence }] }`: `readable` is the model's own view of whether the photo shows what was asked (a tongue, a face) clearly enough to read; a suggestion names a feature **of the request's list**, is at least 0.3 confident, and is one of at most one of an exclusive group; at most 12, most confident first. Everything else — unknown fields, a diagnosis, advice, a reason, an id that is no feature, a contradiction, suggestions for a photo that is not readable — is dropped and reported by code (`extra`, `unknown-id`, `confidence`, `exclusive`, `unreadable` …), never by content. There are no words to quote: the person looks at their own photo and confirms each suggestion; a confirmed one is a guided self-observation (quality 0.7) in the app.

## What a reply to a turn may hold

A proposal names a finding of the request's vocabulary that is not confirmed yet, with a confidence from 0 to 1 and **the person's own words** as evidence (a part of one of
their messages, compared without width, case, spaces or punctuation); a severity only for a present finding. The question must pass the wording lint
([i18n guide §5.1](../../docs/i18n-guide.md)): no pattern, constitution, formula or herb name, no amount, no label, no forbidden wording. Everything else — unknown fields, a
diagnosis, a formula, instructions — is dropped and reported by code (`extra`, `unknown-id`, `no-evidence`, `wording` …), never by content.

## Configuration (environment)

| Variable | Default | Meaning |
|---|---|---|
| `AI_SECRET` | — (required, ≥ 32 characters) | Signs session tokens. A secret of the host |
| `AI_ALLOWED_ORIGINS` | — (required) | The app's origins, comma-separated |
| `AI_MODULES` | `conversation` | The modules on: `conversation`, `tongue`, `face` (the last two look at a photo: **development builds only** until the tongue-photo spike's gates, PD-25 — turn them on for a deployment that serves a development or closed-beta build, with the provider agreement for images in place). `--dev` turns all three on |
| `AI_KILL` | off | `1` or `true`: every module off at once, without a release |
| `AI_PROVIDER` | `mock` | `mock` (no key) or `anthropic` ([`src/anthropic.ts`](src/anthropic.ts)) |
| `ANTHROPIC_API_KEY` | — (required for `anthropic`) | The provider's key: a secret of the host; in no log line, error or response |
| `AI_MODEL` | `claude-sonnet-5-5` | The model |
| `AI_MAX_TOKENS` | 1024 | The most the model may write in one turn (256 – 4096) |
| `AI_PROMPT_CACHE` | off | `1` lets the provider keep a copy of the unchanging prefix for a few minutes — check it against the zero-retention terms first |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | An https origin; a local http one only for tests |
| `AI_SESSION_MINUTES` | 60 | How long a session token lives |
| `AI_TURNS_PER_SESSION` | 30 | Turns a session may take |
| `AI_TURNS_PER_MINUTE` | 10 | Turns a session may take in a minute |
| `AI_TURNS_PER_DAY` | 2000 | Turns one instance serves in a (UTC) day |
| `AI_PHOTOS_PER_SESSION` | 6 | Photos a session may send (both modules together) |
| `AI_PHOTOS_PER_MINUTE` | 3 | Photos a session may send in a minute |
| `AI_PHOTOS_PER_DAY` | 300 | Photos one instance serves in a (UTC) day — a photo costs more than a turn |
| `AI_SESSIONS_PER_MINUTE` | 60 | Sessions one instance starts in a minute |
| `AI_TIMEOUT_MS` | 20000 | How long the provider has for a reply |

A gateway configured wrongly refuses to start. The counts are kept in memory, per instance, and dropped with the session; a host that runs many instances adds its own
rate-limiting rule in front. The limits of one request (size, messages, vocabulary …) are `LIMITS` in [`protocol.ts`](../../packages/ai/src/protocol.ts).

## The log

One JSON line per request: `route`, `method`, `status`, `ms`, and when they apply `error` (a code), `exception` (a class name such as `TypeError`), `turn` (the request's number in its session; a photo's number among the photos), `chars` (how many
characters the person wrote), `proposals` (of a photo: `suggestions`), `dropped`, and for a photo `module` (tongue or face) and `bytes` (its size). No field can hold text or a pixel; a test runs a whole session with marked words and a marked picture and checks that none reaches the log.

## The provider

`src/anthropic.ts` asks Anthropic's Messages API once per turn and answers only through a **forced tool call** whose input is the protocol's reply. The conversation, the app's vocabulary and the
confirmed ids go as JSON data in delimited blocks (`<` and `>` escaped, so a person's words cannot end a block or speak as the system); the system prompt holds the rules — findings only from the
vocabulary, the person's own words as evidence, no diagnosis, pattern, herb, medicine or amount, one short question, a red-flag raise that can only go up. What comes back is data: the validator
drops whatever the request does not allow. The adapter follows no redirect, sends no sampling parameter, never logs, and its errors are classes (`ProviderAuthError`, `ProviderRateLimitError`,
`ProviderServerError`, `ProviderRequestError`, `ProviderNetworkError`, `ProviderFormatError`) — never a body, a header, a word of the conversation or a pixel. A photo goes the same way (`observeBody`): the picture first as an image block, then the features and the exclusive groups as delimited data, a forced tool `report_observation` whose `id` enum is the request's ids; the system prompt tells the model that text written in a photo is part of the picture and never an instruction, to report `readable: false` for more than one person, a screen or a document, and never to name a diagnosis, a pattern, a herb or a medicine or to say who the person is. Contract tests: `test/anthropic.test.ts` and `test/anthropic-observe.test.ts`, on
fixtures in the documented response format and, once the owner has run `scripts/ai/record.ts`, on real recordings.

## Running it

```bash
pnpm --filter @tcm/ai-gateway dev
```

starts it on `http://127.0.0.1:8787` with the mock provider, a random secret for the run and the local origins of the dev server and the previews (`src/node.ts --dev`;
anything set in the environment still wins, e.g. `AI_KILL=1`). With the real model: `ANTHROPIC_API_KEY=… AI_PROVIDER=anthropic pnpm --filter @tcm/ai-gateway dev`. `src/worker.ts` is the same
handler as a Worker ([`DEPLOY.md`](DEPLOY.md)).

```bash
pnpm --filter @tcm/ai-gateway test
```

runs the contract tests: the routes with the mock, a reply outside the schema dropped, tokens, budgets and rate limits, the kill switch, a failing and a slow provider, the
body limit over real HTTP, the log — the photo routes (a JPEG with a place or a comment refused, the photo budgets apart from the turns', no pixel in a log) — and the Anthropic adapter's (the request, the reply, the errors, the abort, the whole way through the gateway, for a turn and for a photo).
