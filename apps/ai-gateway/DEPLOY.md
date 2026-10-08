# Deploying the AI help gateway

For the owner (who deploys it and holds the provider's key). Nothing here is done by the repository: no key is in it, nothing is deployed, and a release build of the app cannot turn AI help on
(`check-release` rule 17). Read the [impact assessment](../../docs/post-mvp/privacy/ai-help-dpia.md) first — a public use needs its reviews and signatures.

## 1. What is deployed

One Worker, `src/worker.ts`: five routes (`/v1/config`, `/v1/session`, `/v1/intake/turn`, and the two photo routes `/v1/observe/tongue` and `/v1/observe/face`), signed session tokens, budgets and rate limits, the validator of every reply, a log of counts and codes,
a kill switch. It stores nothing. It calls Anthropic's Messages API with the key it holds (`src/anthropic.ts`). It runs the same on Node (`src/node.ts`) if you prefer another host.

## 2. Before the first deploy — the provider

- [ ] A commercial agreement with the provider that makes it **your processor**: the DPA checklist in the impact assessment §7 (no training on the data, **zero data retention** or the shortest offered,
      the region of processing, sub-processors, breach notice, deletion). Zero retention is an arrangement with the provider, not a flag of a request.
- [ ] The key: an API key made for this gateway only, with a spending limit set at the provider.
- [ ] **Prompt caching** (`AI_PROMPT_CACHE`) stays off unless the agreement says a provider-side copy of the unchanging prefix (the rules and the vocabulary, no words of a person, kept for minutes) is
      acceptable. Without it each turn sends about 7–9 thousand input tokens; with it the repeated part is billed at a lower rate.
- [ ] **Photos (PM-50)** — only if the deployment serves a development or closed-beta build of the app (a release build has no photo code and cannot turn them on): the agreement's **zero data retention must cover image inputs**, in writing, and no use of the pictures for training or evaluation; until then do not put `tongue` or `face` in `AI_MODULES` for anyone but yourself, with your own photos. A photo of a face is personal data and may be biometric data: the impact assessment's §3.2, §6 and §9 (items 8–10) are for the reviewers before any real person's photo is sent. A photo costs more than a turn (an image of about 1024 px is roughly a thousand input tokens plus the features), which is why photos have their own budgets (`AI_PHOTOS_PER_SESSION`, `_PER_MINUTE`, `_PER_DAY`).
- [ ] The model: `AI_MODEL` (default `claude-sonnet-5-5`), which must accept images if the photo modules are on. A lighter model costs less and answers faster; the evaluation (§5) is how you compare them.

## 3. Configure

1. `cp wrangler.example.toml wrangler.toml`; set `name`, the route, and `AI_ALLOWED_ORIGINS` to **the app's origin only** (`https://app.example.org`; no wildcard exists).
2. Secrets — run from `apps/ai-gateway`:
   ```bash
   openssl rand -hex 32 | npx wrangler secret put AI_SECRET      # signs the session tokens; rotating it ends every session
   npx wrangler secret put ANTHROPIC_API_KEY                      # paste the key when asked; it is never echoed or written to a file
   ```
3. Review the variables of [`src/config.ts`](src/config.ts) (the table in the [README](README.md)): the budgets are the cost ceilings. A gateway configured wrongly refuses to start.

## 4. Logs and privacy — a checklist for the deployment

The gateway logs one JSON line per request — route, method, status, milliseconds, an error code, the turn's number, how many characters a person wrote, counts of proposals and drops, and for a photo its module and size in bytes — **never content**
(a test runs a whole session with marked words and a marked picture and finds none in the log; the adapter's errors are class names). The host's own request log must not keep bodies: a photo is a body of up to 768 KiB. What the platform records is yours to check:

- [ ] What the host's own request log keeps (URL, method, **headers** — the bearer token of a session —, client address, geography) and for how long; set the shortest retention that serves you.
- [ ] No Logpush job, tail consumer or analytics integration adds request **headers or bodies** (a photo travels in a body).
- [ ] `[observability]` in `wrangler.toml` is your decision: `false` keeps the gateway's own lines to a live `wrangler tail`; `true` stores them (counts and codes) for the retention you set.
- [ ] The statement of the app (privacy §8) names the gateway's host and the provider and the region.

## 5. Deploy and verify

```bash
npx wrangler deploy
curl -s https://ai.example.org/v1/config -H "Origin: https://app.example.org"      # modules on, limits
curl -s -o /dev/null -w "%{http_code}\n" https://ai.example.org/v1/config             # 403: no origin, no service
```

Then run the evaluation against it — synthetic personas only (the 23 typical patients and 27 red-flag statements in three languages; about 700 calls, so check the spending limit first):

```bash
node scripts/ai/eval.ts --gateway https://ai.example.org --origin https://app.example.org --out docs/ai-evaluation-anthropic.md
```

It judges the design's lines per language (recall ≥ 85 %, precision ≥ 90 %, the leading pattern ≥ 90 %, every red flag found on the device); a language below a line keeps AI help off. To record real replies
for the adapter's tests (a few dozen calls), run `ANTHROPIC_API_KEY=… node scripts/ai/record.ts --run` and commit the files it writes in
`test/fixtures/anthropic/recorded/` (synthetic text only).

## 6. The app side

- A release build of the app **cannot** enable AI help (the release profile's `ai` section is off, `check-release` rule 17, and the page's CSP has no gateway origin). Turning it on for a closed beta is a
  change of the profile — a decision of the owner, after the reviews — and then `APP_AI_ENDPOINT=https://ai.example.org` names the gateway at build time (https only).
- The development profile points at `http://127.0.0.1:8787` and has the conversation and the two photo modules on. To try the real model locally: in one terminal
  `ANTHROPIC_API_KEY=… AI_PROVIDER=anthropic pnpm --filter @tcm/ai-gateway dev`, in another `pnpm dev`, then turn AI help on in Settings.

## 7. Operating it

- **Kill switch.** Set `AI_KILL = "1"` (dashboard or file) and deploy: `/v1/config` says every module is off, no session is issued, and the app answers *the service is switched off; the questions work as usual*. To switch the photos off alone, take `tongue` and `face` out of `AI_MODULES` and deploy: the conversation goes on.
- **Cost.** `AI_TURNS_PER_SESSION`, `AI_TURNS_PER_MINUTE` and `AI_TURNS_PER_DAY` — and, for photos, `AI_PHOTOS_PER_SESSION`, `AI_PHOTOS_PER_MINUTE` and `AI_PHOTOS_PER_DAY` — bound it per instance, in memory; add a rate-limiting rule of the host in front (for example 60 requests a minute per client on `/v1/*`)
  — a host that runs many instances multiplies the daily ceiling.
- **Keys.** Rotate `ANTHROPIC_API_KEY` at the provider and `wrangler secret put` again; rotating `AI_SECRET` ends every session (the app starts a new one).
- **An incident** — a key that leaked, content that appears in a log, a reply that names a formula: set the kill switch, rotate the secrets, then follow the [safety policy §8](../../docs/safety-policy.md) and the privacy
  notification duties of your regime. The validator already drops a reply that names a pattern, a herb or an amount; report such a reply as a finding.

## 8. What a deployment must never do

Log or store a request or a reply; add an analytics script or a tracker; widen `AI_ALLOWED_ORIGINS` beyond the app's origin; cache a response (every answer says `cache-control: no-store`); send anything the
app's request builder does not — the profile, birth data, notes, the history (privacy §6 rule 7); accept a photo that carries metadata (the gateway refuses it) or keep one for later.
