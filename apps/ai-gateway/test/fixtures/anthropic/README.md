# Recorded replies of the Messages API

`*.json` here are **written by hand in the documented response format** of Anthropic's Messages API (a forced tool call, `stop_reason: "tool_use"`, the error envelope) — the shapes the
adapter must read (`src/anthropic.ts`). They are not recordings of a real run: the project holds no key.

Real recordings come from `node scripts/ai/record.ts` (the owner's key, synthetic personas only, never a real person's words) into `recorded/`; `test/anthropic.test.ts` replays every file
there — the response through the adapter's parser, then the gateway's validator against the request it answered — and says so when the folder is empty.
