// The Simplified-Chinese catalogue: generated from zh-Hant by `pnpm i18n:hans` (docs/post-mvp/design/simplified-chinese.md §5.1), never edited by hand. It is its own module so that the bundler
// makes it a lazy chunk: only a person who reads Simplified downloads it.
import type { Message } from "@tcm/i18n";
import common from "./zh-Hans/common.json";
import constitution from "./zh-Hans/constitution.json";
import errors from "./zh-Hans/errors.json";
import feedback from "./zh-Hans/feedback.json";
import followup from "./zh-Hans/followup.json";
import formula from "./zh-Hans/formula.json";
import inquiry from "./zh-Hans/inquiry.json";
import learn from "./zh-Hans/learn.json";
import lock from "./zh-Hans/lock.json";
import intake from "./zh-Hans/intake.json";
import observe from "./zh-Hans/observe.json";
import report from "./zh-Hans/report.json";
import safety from "./zh-Hans/safety.json";
import trends from "./zh-Hans/trends.json";
import type { MessageKey } from "./catalogs.ts";

const hans = { ...common, ...intake, ...inquiry, ...observe, ...constitution, ...report, ...feedback, ...followup, ...formula, ...learn, ...lock, ...trends, ...safety, ...errors } as Readonly<Partial<Record<MessageKey, Message>>>;
export default hans;
