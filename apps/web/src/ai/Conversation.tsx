// S25 In your own words (PM-47; docs/post-mvp/design/ai-assisted-intake.md §1, §4): the conversation of AI help, in a build with AI help, for an adult who agreed. Before anything is
// sent, the device checks the words for red flags: a level-A or -B one sends the person back to that item of the screening, unsent; a level-C one asks them to check their profile.
// What comes back is checked again here (the gateway checked it first): proposals of the app's own findings, each with the person's words, which only count once confirmed —
// then they are findings of the draft like any answer, and the questions ask what is left.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LIMITS, matchRedFlags, validateReply } from "@tcm/ai";
import type { Lang, Message, Proposal, Severity } from "@tcm/ai";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { NeedsKnowledge, useLoaded } from "../app/knowledge.tsx";
import { useApp } from "../app/store.tsx";
import { useDraft } from "../app/useDraft.ts";
import { useTitleText } from "../app/usePageTitle.ts";
import type { Draft } from "../storage/types.ts";
import { Button, Card, LinkButton, Notice, Skeleton } from "../ui/index.ts";
import { missingItems, subjectOf } from "../screens/profile/model.ts";
import { askedItems, pendingNotices, unanswered } from "../screens/screening/model.ts";
import { AI_ENDPOINT } from "./build.ts";
import { aiI18n, type Ai, type AiKey } from "./catalog.ts";
import { sendTurn, startSession, type Failure } from "./client.ts";
import { consentOf } from "./consent.ts";
import { reopenScreening, topicApplies, useConversation, withConfirmed, withoutFinding } from "./conversation.ts";
import { buildTurnRequest, confirmedIds, vocabularyOf } from "./request.ts";

const SEVERITIES: readonly Severity[] = ["light", "moderate", "severe"];
const FAILURE: Readonly<Record<Failure, AiKey>> = {
  off: "ai.talk.error.off", budget: "ai.talk.error.budget", rate: "ai.talk.error.rate", "too-large": "ai.talk.error.long", "bad-request": "ai.talk.error.long",
  origin: "ai.talk.error.service", method: "ai.talk.error.service", "not-found": "ai.talk.error.service", "bad-json": "ai.talk.error.service", token: "ai.talk.error.service",
  expired: "ai.talk.error.service", busy: "ai.talk.error.service", provider: "ai.talk.error.service", timeout: "ai.talk.error.service", internal: "ai.talk.error.service",
  unreachable: "ai.talk.error.service",
};

const labelOf = (kb: KnowledgeBase, lang: Lang, id: string): string => {
  const s = kb.symptoms.get(id);
  return s === undefined ? id : lang === "en" ? s.en : kb.zh(s["zh-Hant"]);
};

function ProposalItem({ a, kb, lang, p, graded, onConfirm, onReject }: {
  a: Ai; kb: KnowledgeBase; lang: Lang; p: Proposal; graded: boolean; onConfirm: (severity: Severity | undefined) => void; onReject: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [severity, setSeverity] = useState<Severity | undefined>(p.severity);
  const label = labelOf(kb, lang, p.id);
  return (
    <li data-testid="ai-proposal" style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-3) 0", borderTop: "1px solid var(--color-border)" }}>
      <strong>{p.state === "absent" ? `${label} — ${a.t("ai.talk.proposal.absent")}` : label}</strong>
      <span className="muted">{a.t("ai.talk.proposal.evidence", { words: p.evidence })}</span>
      {p.state === "present" && graded ? (
        <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <span>{a.t("ai.talk.severity")}</span>
          <select value={severity ?? ""} onChange={(e) => setSeverity(e.currentTarget.value === "" ? undefined : (e.currentTarget.value as Severity))}>
            <option value="">—</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{t.t(`intake.inquiry.severity.${s}`)}</option>)}
          </select>
        </label>
      ) : null}
      <span style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <Button variant="primary" onClick={() => onConfirm(p.state === "present" && graded ? severity : undefined)}>{a.t("ai.talk.proposal.yes")}</Button>
        <Button onClick={onReject}>{a.t("ai.talk.proposal.no")}</Button>
      </span>
    </li>
  );
}

function Body({ draft }: { draft: Draft }): ReactNode {
  const { lang } = useI18n();
  const { kb } = useLoaded();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const [, navigate] = useLocation();
  const updateDraft = useApp((s) => s.updateDraft);
  const c = useConversation();
  const [text, setText] = useState(c.unsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiKey | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const vocabulary = useMemo(() => vocabularyOf(kb, lang), [kb, lang]);
  const graded = useMemo(() => new Set(kb.questions.flatMap((q) => q.graded)), [kb]);
  const sex = draft.subject.sex;

  // one conversation per assessment
  useEffect(() => { if (c.draftId !== draft.id) c.reset(draft.id); }, [c, draft.id]);
  const messages: readonly Message[] = c.messages.length > 0 ? c.messages : [{ role: "assistant", text: a.t("ai.talk.opening") }];

  async function send(e: FormEvent): Promise<void> {
    e.preventDefault();
    const words = text.trim();
    if (words === "" || busy) return;
    setError(null);
    // 1 — red flags, on the device, before anything is sent
    const matches = matchRedFlags(words);
    const screen = matches.filter((m) => m.level !== "C" && !c.reopened.includes(m.id)).map((m) => m.id);
    if (screen.length > 0) {
      const { reopened } = reopenScreening(draft, screen);
      if (reopened.length > 0) {
        c.update({ reopened: [...c.reopened, ...reopened], unsent: words });
        updateDraft((d) => reopenScreening(d, reopened).draft);
        navigate("/screen?reopened=talk");
        return;
      }
    }
    const s = subjectOf(draft);
    const profileNotice = matches.some((m) => m.level === "C" && !draft.redFlags.includes(m.id) && !(m.id === "RF_C_PREGNANT" && (s?.pregnancy === "yes" || s?.pregnancy === "possible")) && !(m.id === "RF_C_LACTATING" && s?.lactating === true));
    // 2 — the session, then the turn
    if (AI_ENDPOINT === null) return;
    const said = [...messages, { role: "person" as const, text: words }];
    if (said.filter((m) => m.role === "person").reduce((n, m) => n + m.text.length, 0) > LIMITS.personChars || said.length > LIMITS.messages) { setError("ai.talk.error.long"); return; }
    setBusy(true);
    try {
      let token = c.token;
      if (token === null || token.expiresAt <= Date.now() + 5_000) {
        const started = await startSession(AI_ENDPOINT);
        if (!started.ok) { setError(FAILURE[started.error]); return; }
        token = { value: started.value.token, expiresAt: started.value.expiresAt };
      }
      const request = buildTurnRequest({ lang, messages: said, vocabulary, confirmed: confirmedIds(draft.findings, vocabulary) });
      const turn = await sendTurn(AI_ENDPOINT, token.value, request);
      if (!turn.ok) { c.update({ token: turn.error === "token" || turn.error === "expired" ? null : token, unsent: words }); setError(FAILURE[turn.error]); return; }
      // 3 — the reply, checked again on the device; what does not apply to this person is left out
      const { reply } = validateReply(turn.value.reply, request);
      const topicOf = new Map(vocabulary.map((v) => [v.id, v.topic]));
      const proposals = reply.proposals.filter((p) => topicApplies(topicOf.get(p.id), sex));
      const question = reply.question !== null && topicApplies(reply.question.topic, sex) ? reply.question : null;
      const pending = [...c.pending.filter((p) => !proposals.some((n) => n.id === p.id)), ...proposals];
      c.update({
        token, pending, unsent: "", done: question === null, profileNotice: c.profileNotice || profileNotice,
        messages: question === null ? said : [...said, { role: "assistant", text: question.text, ...(question.topic !== undefined ? { topic: question.topic } : {}) }],
      });
      setText("");
      // the model may raise a red flag, never lower one: the whole screening is asked again
      if (reply.redFlag) {
        const { A, B } = askedItems(kb);
        const { reopened } = reopenScreening(draft, [...A, ...B].map((f) => f.id).filter((id) => !c.reopened.includes(id)));
        if (reopened.length > 0) { c.update({ reopened: [...c.reopened, ...reopened] }); updateDraft((d) => reopenScreening(d, reopened).draft); navigate("/screen?reopened=talk"); }
      }
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  const confirm = (p: Proposal, severity: Severity | undefined): void => {
    updateDraft((d) => withConfirmed(d, p, severity));
    c.update({ pending: c.pending.filter((x) => x.id !== p.id), confirmed: c.confirmed.includes(p.id) ? c.confirmed : [...c.confirmed, p.id] });
  };
  const reject = (p: Proposal): void => c.update({ pending: c.pending.filter((x) => x.id !== p.id) });
  const remove = (id: string): void => { updateDraft((d) => withoutFinding(d, id)); c.update({ confirmed: c.confirmed.filter((x) => x !== id) }); };
  const confirmedHere = c.confirmed.filter((id) => draft.findings[id] !== undefined);

  return (
    <>
      <h1>{a.t("ai.talk.title")}</h1>
      <p className="muted">{a.t("ai.talk.notice")} <Link href="/settings#settings-ai">{a.t("ai.talk.settings")}</Link></p>
      {c.profileNotice ? (
        <Notice kind="caution" kindLabel={a.t("ai.talk.profile.title")} title={a.t("ai.talk.profile.title")}>
          <p>{a.t("ai.talk.profile.body")}</p>
          <LinkButton href="/start">{a.t("ai.talk.profile.link")}</LinkButton>
        </Notice>
      ) : null}
      <section aria-label={a.t("ai.talk.transcript")}>
        <div role="log" aria-live="polite">
          <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
            {messages.map((m, i) => (
              <li key={i} data-role={m.role}>
                <strong>{m.role === "assistant" ? a.t("ai.talk.who.assistant") : a.t("ai.talk.who.person")}</strong>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.text}</p>
              </li>
            ))}
          </ol>
        </div>
        {c.done && c.messages.length > 0 ? <p role="status">{a.t("ai.talk.done")}</p> : null}
      </section>

      {c.pending.length > 0 ? (
        <Card title={a.t("ai.talk.proposals.title")} headingLevel={2} id="talk-proposals">
          <p>{a.t("ai.talk.proposals.intro")}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {c.pending.map((p) => <ProposalItem key={p.id} a={a} kb={kb} lang={lang} p={p} graded={graded.has(p.id)} onConfirm={(sev) => confirm(p, sev)} onReject={() => reject(p)} />)}
          </ul>
        </Card>
      ) : null}

      {confirmedHere.length > 0 ? (
        <Card title={a.t("ai.talk.confirmed.title")} headingLevel={2} id="talk-confirmed">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}>
            {confirmedHere.map((id) => (
              <li key={id} data-testid="ai-confirmed" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center" }}>
                <span>{draft.findings[id]!.state === "absent" ? `${labelOf(kb, lang, id)} — ${a.t("ai.talk.proposal.absent")}` : labelOf(kb, lang, id)}</span>
                <Button variant="ghost" onClick={() => remove(id)}>{a.t("ai.talk.confirmed.remove")}</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!c.done || c.messages.length === 0 ? (
        <form onSubmit={(e) => void send(e)} style={{ display: "grid", gap: "var(--space-2)", marginTop: "var(--space-4)" }}>
          <label htmlFor="talk-input">{a.t("ai.talk.input")}</label>
          <textarea id="talk-input" ref={input} rows={3} maxLength={LIMITS.messageChars} value={text} onChange={(e) => setText(e.currentTarget.value)} />
          <span><Button type="submit" variant="primary" disabled={busy || text.trim() === ""}>{a.t("ai.talk.send")}</Button></span>
        </form>
      ) : null}
      <p role="status" aria-live="polite">{busy ? a.t("ai.talk.sending") : error !== null ? a.t(error) : ""}</p>

      <p style={{ marginTop: "var(--space-5)" }}><LinkButton href="/inquiry" variant={c.done ? "primary" : "secondary"}>{a.t("ai.talk.continue")}</LinkButton></p>
    </>
  );
}

/** The conversation needs a complete profile, a finished screening, AI help agreed to, and an adult (PD-26); otherwise it sends the person where they belong. */
function Guarded({ draft }: { draft: Draft }): ReactNode {
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const consented = useApp((s) => consentOf(s.prefs, "conversation") !== null);
  const incomplete = missingItems(draft).length > 0;
  const screening = unanswered(kb, draft).length > 0 || pendingNotices(kb, draft).length > 0;
  const adult = (subjectOf(draft)?.ageYears ?? 0) >= 18;
  const to = incomplete ? "/start" : screening ? "/screen" : !consented ? "/settings#settings-ai" : !adult ? "/inquiry" : null;
  useEffect(() => { if (to !== null) navigate(to, { replace: true }); }, [to, navigate]);
  return to !== null ? null : <Body draft={draft} />;
}

export default function ConversationScreen(): ReactNode {
  const { t, lang } = useI18n();
  useTitleText(aiI18n(lang).t("ai.talk.title"));
  const draft = useDraft("/inquiry");
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><Guarded draft={draft} /></NeedsKnowledge>;
}
