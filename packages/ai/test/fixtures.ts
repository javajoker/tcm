// Test fixtures: the app's own vocabulary, read from the knowledge base's data files — every inquiry symptom with its label and the plain phrasings of the questions'
// options that name it, in the three languages (Simplified through the display dictionary). The app builds the same from its loaded knowledge base (PM-47).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Lang, Message, TurnRequest, VocabItem } from "../src/protocol.ts";
import { vocabularyFrom } from "../src/vocabulary.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), "utf8")) as T;

interface Symptom { readonly id: string; readonly kind: string; readonly dimension: string; readonly "zh-Hant": string; readonly en: string }
interface QuestionData { readonly options: readonly { readonly label: Readonly<Record<"zh-Hant" | "en", string>>; readonly symptoms: readonly string[]; readonly none: boolean }[] }

const symptoms = read<{ items: Symptom[] }>("data/diagnosis/symptoms.json").items;
const questions = read<{ items: QuestionData[] }>("data/diagnosis/questions.json").items;
const hans = read<{ entries: Record<string, string> }>("scripts/i18n/zh-Hans.dictionary.json").entries;
/** The Traditional-only characters (OpenCC's table): none may appear in Simplified text. */
export const TRADITIONAL_ONLY = read<{ _meta: { traditionalOnly: string } }>("scripts/i18n/zh-Hans.dictionary.json")._meta.traditionalOnly;

const inLang = (zh: string, en: string, lang: Lang): string => (lang === "en" ? en : lang === "zh-Hans" ? (hans[zh] ?? zh) : zh);

export const vocabulary = (lang: Lang): VocabItem[] => vocabularyFrom({ symptoms, questions }, (t) => inLang(t["zh-Hant"], t.en ?? t["zh-Hant"], lang));

export const turn = (lang: Lang, messages: readonly Message[], confirmed: readonly string[] = []): TurnRequest => ({ v: 1, lang, messages, vocabulary: vocabulary(lang), confirmed });
export const said = (text: string): Message => ({ role: "person", text });
export const asked = (text: string, topic?: string): Message => ({ role: "assistant", text, ...(topic !== undefined ? { topic } : {}) });
