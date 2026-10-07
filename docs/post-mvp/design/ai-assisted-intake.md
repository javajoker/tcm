# Design: AI-Assisted Intake — Conversation and Observation

| | |
|---|---|
| **Version** | 0.4 (draft) |
| **Status** | Design for Release F (FR-40 … FR-42; tasks PM-44 … PM-50). **Approved by the owner on 2026-10-07** (PD-21, PD-25): the mock-provider parts are built first; a privacy redesign and a legal view still come before anything reaches the public |
| **Last updated** | 2026-10-07 |
| **Audience** | The owner, engineers, a privacy and a legal reviewer, the clinical content owner |
| **Related** | [Research tracks §2, §5](research-tracks.md) · [Tongue-photo spike](../spikes/tongue-photo.md) · [Privacy](../../privacy.md) · [Safety policy](../../safety-policy.md) · [Decisions Q3, Q4, PD-21 … PD-27](../decisions.md) · [Requirements FR-40 … FR-42](../requirements.md) |

> **Summary.** The owner's direction (2026-10-07): *a configurable diagnosis with AI support from a backend — fewer options to pick, more conversation, and AI looking at the tongue and the face.* This design keeps what makes the app trustworthy — **the deterministic engine decides, every statement is traceable** — and changes what the person does: instead of answering many option lists, they **talk**, and they may **show** their tongue and face; an AI model hosted behind the project's own small gateway **turns that into the findings the engine already understands**, and the person **confirms** them before anything is decided. The AI never names a pattern, never recommends a herb and never gives an amount. It is **off by default** in the public build, **opt-in per person**, sends nothing that identifies the person, and stores nothing. Because data then leaves the device, it overturns the "local-first" promise for the people who turn it on — that is the owner's decision, after a privacy and a legal review.

---

## 1. What the person experiences

**Today.** Profile → red-flag screening → about 20–40 single- and multiple-choice questions → optional tongue map, pulse, constitution quiz → review → result.

**With AI help on.**

1. Profile and **red-flag screening, unchanged and first** — deterministic, never handed to a model.
2. A **conversation**: *「說說最近哪裡不舒服？從什麼時候開始的？」* The assistant asks follow-up questions the way a practitioner would (寒熱、汗、飲食、二便、睡眠、情志…), a few at a time, in the person's language.
3. Optionally, **a photo of the tongue** and **of the face**, with guidance for light and distance; the assistant suggests what it sees from the app's own lists (舌色、苔色、苔質、齒痕、裂紋… 面色、神…).
4. A **summary to confirm**: *"This is what I understood"* — each finding with the words that support it ("「吃完飯就脹」→ 食後腹脹, moderate"); the person ticks, edits or removes each. Only confirmed findings go on.
5. The usual review and the **same result**, made by the same engine.

At any point the person can switch to the classic questions; the two can be mixed (the conversation fills what it can, the questions ask the rest).

## 2. The decisions this changes

| Standing decision | What it said | What this design proposes | Owner's call |
|---|---|---|---|
| **Local-first** (standing constraint 2; PRD G7) | No server that receives answers | For the people who turn AI help on, their conversation and photos go to the project's gateway and on to a model provider, for the time of the request only | ✓ PD-21, approved 2026-10-07 |
| **Q3 — LLM involvement** | Not in the core; an LLM never decides a diagnosis | Unchanged in substance: the model is an **input aid**; the deterministic engine decides. The model's words reach the person only as questions and as quoted evidence, never as a conclusion | ✓ PD-21, PD-23 |
| **Q4 / research tracks §2 — tongue photo** | A spike with hard gates: legal view, datasets, evaluation | The observation module is the same idea with a general-purpose vision model instead of a trained one: **the same gates apply** (legal view, evaluation against practitioners' labels) before it leaves the development profile | ✓ PD-25, as designed |

## 3. Architecture

```
app (browser)                         ai-gateway (owner's deployment)                 model provider
─────────────                         ───────────────────────────────                 ──────────────
consent ─► session token ───────────► /v1/intake/turn   (text + vocabulary)  ───────► LLM (structured output)
                                      /v1/observe/tongue (image, vocabulary) ───────► vision model
                                      /v1/config         (modules on/off)
◄── proposed findings + evidence ◄─── validates the reply against the schema; strips anything else; logs no content
confirm ─► findings into the draft ─► the engine (unchanged) ─► result
```

| Piece | Design |
|---|---|
| **Gateway** | A small stateless service (a Cloudflare Worker beside the existing Pages hosting): holds the provider key, rate-limits per session token, rejects oversize requests, validates every reply against a JSON schema of the app's vocabulary, **logs no request or response content**, and has a kill switch. It lives in this repository (`apps/ai-gateway`), with a mock provider for tests; deploying it and its key is the owner's step |
| **Provider** | An abstraction with one implementation first: Anthropic's API, model configurable (a capable model such as `claude-sonnet-5-5` for the conversation and the images; a lighter one for pure extraction), the provider's zero-data-retention terms where available. Another provider, or an on-device model later, plugs into the same interface |
| **What is sent** | The conversation text; the photo (resized, metadata stripped); the **vocabulary** (the symptom, tongue and face feature ids and their labels in the session's language); the findings already confirmed. **Never**: a name, an identifier, birth data, the history, the profile's free text |
| **What comes back** | Only structured data: proposed findings `{ id, severity?, confidence, evidence: "the person's own words" }`, the next question (text, linted), or "cannot tell". Anything else is dropped |
| **Configuration** | A profile section `ai` (`enabled`, `modules: { conversation, tongue, face }`, `endpoint`) in `scope-profiles.json`; the gateway's `/v1/config` can switch a module off without a release. The release profile ships with `enabled: false` |
| **Offline** | AI help needs the network; offline, the classic flow is the only flow and says so |
| **Content-security policy** | `connect-src` gains the gateway's origin **only in builds with AI enabled**, justified in the tech spec |

*Built (PM-45, 2026-10-08):* the protocol, the validator, the questions' wording lint and the mock provider are `@tcm/ai` ([`packages/ai`](../../../packages/ai)); the gateway is [`apps/ai-gateway`](../../../apps/ai-gateway/README.md) — the three routes, HMAC-signed session tokens, budgets per session, per minute and per day, a kill switch, the app's origins only, a body limit, a provider timeout and a log of counts and codes. Its contract tests run with `pnpm check`. The wording rules are in the [i18n guide §5.1](../../i18n-guide.md).

## 4. Safety

| Risk | Control |
|---|---|
| The model invents a symptom | Every proposed finding carries the person's own words as evidence and is **confirmed by the person**; a finding without evidence is dropped by the gateway |
| The model reaches a conclusion ("you have 脾虛") | The output schema has no place for it; the question text passes the same wording lint as the app's own (no diagnosis words, no herbs, no amounts) on the gateway and again in the app |
| An emergency is missed | The deterministic red-flag screening comes **first and is mandatory**; during the conversation, anything that matches a red-flag item (keywords plus the model's flag) **re-opens the deterministic notice**; the model can raise, never lower, a flag |
| Prompt injection in what the person types | The model's reply is data validated against the schema; it cannot change the flow, the vocabulary or the engine |
| A photo is wrong or misleading | Observation findings enter at a quality no higher than today's self-observation (0.7) and are confirmed by the person; poor photos are refused by a quality gate |
| Different languages, different accuracy | The evaluation (§6) is per language; a language below the line keeps AI help off |
| Minors | AI help is for adults only (18+) by default |

The engine, the levels, the notices and the prescription gate are unchanged: whatever the intake, the same findings give the same result.

## 5. Privacy

Turning AI help on is **a change of the privacy promise for that person**, and the interface says it in those words.

- **Consent before first use**, per module, stating what is sent, to whom (the gateway and the named provider), for what, and that nothing is stored; withdrawable at any time in Settings.
- **Indicator** while a module is on; a session-only token, not an account.
- **Minimisation**: §3's "never" list is enforced in the app (the request builder has no access to the profile's identifiers or birth data) and tested.
- **No storage**: the gateway logs no content; the provider's zero-retention terms; photos are never written to disk in the app.
- **Privacy inventory**: new rows (the conversation, the photo, the session token) and the "what leaves the device" section; the user-facing statement changes. This triggers the **full privacy redesign** the privacy design names for server-side processing (DPIA-style review, a data-processing agreement with the provider, the region of processing). *Drafted with PM-44 (2026-10-08):* the inventory rows, the exception to *never transmitted*, consent, developer rule 7 and the verification row are in [privacy v0.8](../../privacy.md); the impact assessment's draft — flows, roles, risks, the agreement's checklist, nine open items — is [`../privacy/ai-help-dpia.md`](../privacy/ai-help-dpia.md), unsigned until the reviewers have read it.

## 6. Evaluation before any public use

| Module | Protocol | Pass |
|---|---|---|
| **Conversation** | Scripted personas from the 23 patterns' typical patients and from the red-flag vignettes, written in Traditional Chinese, Simplified Chinese and English, played against the assistant; the extracted findings are compared with the persona's gold findings | Recall and precision of findings above a line set in the protocol (proposal: recall ≥ 0.85, precision ≥ 0.9 after confirmation); **no** red-flag vignette that ends without the deterministic notice; the engine's result on the extracted findings matches the gold result's leading pattern in ≥ 90 % of personas |
| **Tongue and face** | The tongue-photo spike's protocol ([spikes/tongue-photo.md](../spikes/tongue-photo.md)): practitioners' labels on images with consent, strata for light, camera and skin tone | As in that protocol; until it runs, the module exists **only in the development profile** |

## 7. What it costs to run

Model calls cost money per conversation; the gateway enforces a per-session budget (turns and tokens), a daily ceiling and a rate limit; the owner sees counts, not content. The app works without the gateway.

## 8. Rollout

1. **Development profile** with a **mock provider** (no key, deterministic replies) — the whole flow can be built and tested here.
2. The owner deploys the gateway with a key; **development and closed beta** with consent.
3. Evaluation (§6), privacy redesign (§5), legal view.
4. Public, module by module, only after each gate.

## 9. Decided defaults

**Decided 2026-10-07 — default of this design; the items that were marked ⚑ were decided by the owner the same day, as designed (decision register §2.9).**

| Question | Default |
|---|---|
| Data leaving the device | Only for people who turn a module on, with consent; off by default in the public build (PD-21, the owner's decision) |
| What the model may say | Questions and quoted evidence only; never a pattern, a herb or an amount (PD-23) |
| Who decides | The deterministic engine, on confirmed findings (PD-23) |
| Provider | Anthropic's API through the project's own gateway; configurable (PD-22) |
| Storage | None, anywhere (PD-24) |
| Photos | Development profile only until the legal view and the evaluation (PD-25, the owner's decision) |
| Who may use it | Adults (PD-26) |
| First module | Conversation; observation second (PD-27) |

## 10. Tasks

PM-44 (the owner's decisions and the privacy redesign), PM-45 (the gateway with a mock provider), PM-46 (configuration, consent and Settings), PM-47 (the conversational intake), PM-48 (the evaluation harness), PM-49 (the provider adapter and deployment notes), PM-50 (the observation module, development profile only) — [`TASKS.md`](../../../TASKS.md).

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-07 | Initial design, from the owner's direction of 2026-10-07 |
| 0.2 | 2026-10-07 | The owner's approval (PD-21, PD-25): the mock-provider parts first |
| 0.3 | 2026-10-08 | §5: the privacy documents drafted (PM-44) — privacy v0.8 and the impact assessment's draft |
| 0.4 | 2026-10-08 | §3: the gateway and `@tcm/ai` built with the mock provider (PM-45) |
