# Recorded replies of the Messages API

`*.json` here are **written by hand in the documented response format** of Anthropic's Messages API (a forced tool call, `stop_reason: "tool_use"`, the error envelope) — the shapes the
adapter must read (`src/anthropic.ts`). They are not recordings of a real run: the project holds no key.

Real recordings come from `node scripts/ai/record.ts` (the owner's key, synthetic personas only, never a real person's words) into `recorded/`; `test/anthropic.test.ts` replays every file
there — the response through the adapter's parser, then the gateway's validator against the request it answered — and says so when the folder is empty.

`observation-*.json` are the replies to a **photo** (task PM-50): the forced tool `report_observation` with `readable` and the `suggestions` — `observation-tool-use` a good reading of a tongue,
`observation-rogue` one that says more than it may (a diagnosis, advice, a reason, an id that is no feature, a confidence of 1.7, a colour that contradicts another) and
`observation-unreadable` a photo the model cannot read. `test/anthropic-observe.test.ts` reads them through the adapter and the gateway's validator.
