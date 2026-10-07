// The mock provider (docs/post-mvp/design/ai-assisted-intake.md §8 step 1): deterministic replies without a model or a key, so that the whole flow can be built and tested.
// It reads the person's last message clause by clause and proposes a finding of the vocabulary when a clause holds its label (the part before any bracket) or a clause of one of
// its plain phrasings that no other finding shares — words such as 很, 常常 or "very" left out on both sides; a negation just before the words makes it absent, an intensifier
// in the clause grades it. It then asks about the first topic, in the order of the ten questions (十問), that no question, confirmed finding or proposal has covered, and says
// it is done when none is left. It matches the app's own words and understands no paraphrase: it is a test double, not a model.
import type { Lang, Proposal, Question, Severity, TurnRequest, TurnReply, VocabItem } from "./protocol.ts";

/** The topics in the order the mock asks them: 一問寒熱二問汗，三問頭身四問便，五問飲食六胸腹，七聾八渴俱當辨 — then sleep, mood, spirit, voice, face and the menses. */
export const TOPIC_ORDER: readonly string[] = ["cold-heat", "sweat", "head-body", "stool-urine", "diet-taste", "chest-abdomen", "ear-eye-throat", "thirst", "sleep", "emotion", "qi-spirit-form", "voice-breath", "face-skin", "menses"];

export const MOCK_QUESTIONS: Readonly<Record<string, Readonly<Record<Lang, string>>>> = {
  "cold-heat": { "zh-Hant": "最近會特別怕冷或怕熱嗎？會不會發燒？", "zh-Hans": "最近会特别怕冷或怕热吗？会不会发烧？", en: "Have you been feeling unusually cold or hot lately? Any fever?" },
  sweat: { "zh-Hant": "流汗的情況怎麼樣？例如沒怎麼動就出汗，或睡著時出汗？", "zh-Hans": "流汗的情况怎么样？例如没怎么动就出汗，或睡着时出汗？", en: "How about sweating: do you sweat without much effort, or in your sleep?" },
  "head-body": { "zh-Hant": "頭或身體有沒有哪裡痛、沉重或痠？", "zh-Hans": "头或身体有没有哪里痛、沉重或酸？", en: "Is there pain, heaviness or soreness anywhere in your head or body?" },
  "stool-urine": { "zh-Hant": "大便和小便的情況怎麼樣？例如偏稀、偏乾，或小便的顏色？", "zh-Hans": "大便和小便的情况怎么样？例如偏稀、偏干，或小便的颜色？", en: "How are your bowel movements and urine: loose, dry, or a change of colour?" },
  "diet-taste": { "zh-Hant": "胃口和口味怎麼樣？嘴裡會苦、會淡，或吃完容易脹嗎？", "zh-Hans": "胃口和口味怎么样？嘴里会苦、会淡，或吃完容易胀吗？", en: "How are your appetite and taste: a bitter or bland taste, or bloating after meals?" },
  "chest-abdomen": { "zh-Hant": "胸口或肚子有沒有悶、脹或痛的感覺？", "zh-Hans": "胸口或肚子有没有闷、胀或痛的感觉？", en: "Do you feel tightness, fullness or pain in your chest or belly?" },
  "ear-eye-throat": { "zh-Hant": "眼睛、耳朵或喉嚨有沒有不舒服？", "zh-Hans": "眼睛、耳朵或喉咙有没有不舒服？", en: "Any discomfort in your eyes, ears or throat?" },
  thirst: { "zh-Hant": "會常常口渴嗎？比較想喝冷的還是熱的？", "zh-Hans": "会常常口渴吗？比较想喝冷的还是热的？", en: "Are you often thirsty? Do you prefer cold or warm drinks?" },
  sleep: { "zh-Hant": "睡得好嗎？會不會難入睡、多夢或容易醒？", "zh-Hans": "睡得好吗？会不会难入睡、多梦或容易醒？", en: "How do you sleep: trouble falling asleep, many dreams, or waking easily?" },
  emotion: { "zh-Hant": "最近的心情怎麼樣？容易煩躁、緊張或低落嗎？", "zh-Hans": "最近的心情怎么样？容易烦躁、紧张或低落吗？", en: "How has your mood been: irritable, tense or low?" },
  "qi-spirit-form": { "zh-Hant": "精神和體力怎麼樣？會不會容易累、懶得說話？", "zh-Hans": "精神和体力怎么样？会不会容易累、懒得说话？", en: "How are your energy and stamina: do you tire easily, or feel too tired to talk?" },
  "voice-breath": { "zh-Hant": "說話或呼吸有沒有不一樣？例如容易喘、咳嗽或聲音變小？", "zh-Hans": "说话或呼吸有没有不一样？例如容易喘、咳嗽或声音变小？", en: "Any change in your voice or breathing: short of breath, a cough, or a weaker voice?" },
  "face-skin": { "zh-Hant": "臉色或皮膚有沒有變化？", "zh-Hans": "脸色或皮肤有没有变化？", en: "Have you noticed any change in your complexion or skin?" },
  menses: { "zh-Hant": "月經的情況怎麼樣？週期、經量、顏色或經痛？", "zh-Hans": "月经的情况怎么样？周期、经量、颜色或经痛？", en: "How are your periods: the cycle, the flow, the colour, or cramps?" },
};

/** Lower case, compatibility forms folded, punctuation turned into spaces: words stay apart, so a negation before an English phrase can still be seen. */
const soft = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s']+/gu, " ").replace(/\s+/g, " ").trim();
const CLAUSE = /[，,。.!！?？;；：:\n、]+/u;
const core = (label: string): string => label.replace(/[（(][^）)]*[）)]/gu, "").trim();

const NEGATION_ZH = ["沒有", "没有", "沒", "没", "不", "無", "无", "未"];
const NEGATION_EN = new Set(["no", "not", "don't", "dont", "never", "without", "nor", "isn't", "aren't", "haven't", "hasn't", "didn't", "doesn't"]);
const SEVERE = /很|非常|特別|特别|嚴重|严重|厲害|厉害|\b(very|really|severe|severely|terrible|extremely)\b|\ba lot\b/u;
const LIGHT = /有點|有点|一點|一点|稍微|偶爾|偶尔|輕微|轻微|\b(slightly|mild|mildly|sometimes|occasionally)\b|\ba (bit|little)\b/u;

function negated(before: string): boolean {
  const zh = before.replace(/\s+/g, "");
  if (NEGATION_ZH.some((n) => zh.endsWith(n))) return true;
  return before.split(" ").filter(Boolean).slice(-3).some((w) => NEGATION_EN.has(w));
}

/** Words that grade or repeat rather than name: left out of both the cue and the clause, so that 頭很痛 holds 頭痛 and 手腳常常冰冷 holds 手腳冰冷. */
const FILLER = /很|非常|特別|特别|有點|有点|一點點|一点点|一點|一点|稍微|常常|經常|经常|總是|总是|老是|\b(very|really|quite|often|always|still|a bit|a little)\b/gu;
const bare = (s: string): string => s.replace(FILLER, " ").replace(/(\p{Script=Han})\s+(?=\p{Script=Han})/gu, "$1").replace(/\s+/g, " ").trim();
const han = (s: string): boolean => /\p{Script=Han}/u.test(s);
/** A label may be one word (頭痛, "headache"); a clause of a plain phrasing must say more than one English word ("throat" alone names nothing). */
const longLabel = (s: string): boolean => (han(s) ? s.replace(/\s/g, "").length >= 2 : s.length >= 4);
const longClause = (s: string): boolean => (han(s) ? s.replace(/\s/g, "").length >= 2 : s.split(" ").length >= 2);

interface Cue { readonly item: VocabItem; readonly text: string; readonly confidence: number }

function cuesOf(vocabulary: readonly VocabItem[]): Cue[] {
  const label: Cue[] = [];
  const plain = new Map<string, Cue[]>();
  for (const item of vocabulary) {
    const l = bare(soft(core(item.label)));
    if (longLabel(l)) label.push({ item, text: l, confidence: 0.9 });
    for (const phrase of item.plain ?? []) {
      for (const clause of phrase.split(CLAUSE)) {
        const t = bare(soft(clause));
        if (!longClause(t) || t === l) continue;
        const list = plain.get(t) ?? [];
        if (!list.some((c) => c.item.id === item.id)) list.push({ item, text: t, confidence: 0.7 });
        plain.set(t, list);
      }
    }
  }
  const unique = [...plain.values()].filter((list) => list.length === 1).map((list) => list[0]!);
  return [...label, ...unique].sort((a, b) => b.text.length - a.text.length || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
}

function proposalsOf(text: string, request: TurnRequest): Proposal[] {
  const confirmed = new Set(request.confirmed);
  const cues = cuesOf(request.vocabulary).filter((c) => !confirmed.has(c.item.id));
  const out = new Map<string, Proposal>();
  for (const clause of text.split(CLAUSE).map((c) => c.trim()).filter(Boolean)) {
    const graded = soft(clause);
    const s = bare(graded);
    for (const cue of cues) {
      if (out.has(cue.item.id)) continue;
      const at = s.indexOf(cue.text);
      if (at < 0) continue;
      const absent = negated(s.slice(0, at).trim());
      const severity: Severity | undefined = absent ? undefined : SEVERE.test(graded) ? "severe" : LIGHT.test(graded) ? "light" : undefined;
      out.set(cue.item.id, { id: cue.item.id, state: absent ? "absent" : "present", ...(severity !== undefined ? { severity } : {}), confidence: cue.confidence, evidence: clause });
    }
  }
  return [...out.values()];
}

function nextQuestion(request: TurnRequest, proposals: readonly Proposal[]): Question | null {
  const topicOf = new Map(request.vocabulary.map((v) => [v.id, v.topic]));
  const present = new Set(request.vocabulary.map((v) => v.topic));
  const covered = new Set<string>();
  for (const m of request.messages) if (m.role === "assistant" && m.topic !== undefined) covered.add(m.topic);
  for (const id of [...request.confirmed, ...proposals.map((p) => p.id)]) {
    const t = topicOf.get(id);
    if (t !== undefined) covered.add(t);
  }
  const topic = TOPIC_ORDER.find((t) => present.has(t) && !covered.has(t) && MOCK_QUESTIONS[t] !== undefined);
  return topic === undefined ? null : { text: MOCK_QUESTIONS[topic]![request.lang], topic };
}

/** The mock's reply to a turn: always within the protocol, so the gateway's validator drops nothing from it. */
export function mockTurn(request: TurnRequest): TurnReply {
  const last = [...request.messages].reverse().find((m) => m.role === "person");
  const proposals = last === undefined ? [] : proposalsOf(last.text, request);
  const question = nextQuestion(request, proposals);
  return { proposals, question, redFlag: false, done: question === null };
}
