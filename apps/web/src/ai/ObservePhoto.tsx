// S26 Photo of the tongue or the face (PM-50; docs/post-mvp/design/ai-assisted-intake.md §1, §3, §4; UX spec S26), in a development build with AI help, for an adult who agreed to that
// module. The person takes or chooses a photo (the device's own file chooser, which on a phone offers its camera and its photo library — the page needs no camera permission), the device shrinks it, turns it upright and looks at it — size, light,
// focus, colour — and says so when it will not do. Only when the person has looked at the picture and presses Send is it encoded without metadata and sent, once. What comes back is
// checked again on the device: features of the app's own list the model thinks it sees, which count only when the person confirms each one, as a guided self-observation (0.7).
// The picture lives on a canvas in memory and is emptied when the person leaves, sends another or the screen closes: never written anywhere (e2e E42 looks for it).
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { OBSERVE_MODULES, validateObservation } from "@tcm/ai";
import type { Lang, ObserveModule, ObserveReply } from "@tcm/ai";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { NeedsKnowledge, useLoaded } from "../app/knowledge.tsx";
import { FlowGuard } from "../app/FlowGuard.tsx";
import { useApp } from "../app/store.tsx";
import { useDraft } from "../app/useDraft.ts";
import { useTitleText } from "../app/usePageTitle.ts";
import type { Draft } from "../storage/types.ts";
import { Button, Card, LinkButton, Notice, Skeleton } from "../ui/index.ts";
import { subjectOf } from "../screens/profile/model.ts";
import { AI_ENDPOINT, AI_FACE, AI_TONGUE } from "./build.ts";
import { aiI18n, type Ai, type AiKey } from "./catalog.ts";
import { sendPhoto, startSession, type Failure } from "./client.ts";
import { consentOf } from "./consent.ts";
import { withObserved, withoutObserved } from "./photo/apply.ts";
import { encodeJpeg, readPhoto, releasePhoto, type Captured, type CaptureError } from "./photo/capture.ts";
import type { Issue } from "./photo/quality.ts";
import { buildObserveRequest, exclusiveWithin, observeVocabulary } from "./photo/request.ts";

const FAILURE: Readonly<Record<Failure, AiKey>> = {
  off: "ai.photo.error.off", budget: "ai.photo.error.budget", rate: "ai.photo.error.rate", image: "ai.photo.error.image", "too-large": "ai.photo.error.image",
  "bad-request": "ai.photo.error.service", origin: "ai.photo.error.service", method: "ai.photo.error.service", "not-found": "ai.photo.error.service", "bad-json": "ai.photo.error.service",
  token: "ai.photo.error.service", expired: "ai.photo.error.service", busy: "ai.photo.error.service", provider: "ai.photo.error.service", timeout: "ai.photo.error.service",
  internal: "ai.photo.error.service", unreachable: "ai.photo.error.service",
};
const ISSUE: Readonly<Record<Issue, AiKey>> = {
  small: "ai.photo.quality.small", dark: "ai.photo.quality.dark", bright: "ai.photo.quality.bright", flat: "ai.photo.quality.flat", blurry: "ai.photo.quality.blurry", cast: "ai.photo.quality.cast",
};
const CAPTURE: Readonly<Record<CaptureError, AiKey>> = { type: "ai.photo.error.type", huge: "ai.photo.error.huge", unreadable: "ai.photo.error.unreadable" };

type Phase =
  | { readonly kind: "ready" }
  | { readonly kind: "checking" }
  | { readonly kind: "refused"; readonly reasons: readonly AiKey[] }
  | { readonly kind: "preview" }
  | { readonly kind: "sending" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "result" };

const labelOf = (kb: KnowledgeBase, lang: Lang, module: ObserveModule, id: string): string => {
  const say = (t: { readonly "zh-Hant": string; readonly en?: string | null }): string => (lang === "en" ? (t.en ?? t["zh-Hant"]) : kb.zh(t["zh-Hant"]));
  const symptom = kb.symptoms.get(id);
  if (symptom !== undefined) return say(symptom);
  const feature = module === "tongue" ? kb.tongue.features.find((f) => f.id === id) : undefined;
  return feature === undefined ? id : say(feature.name);
};

/** Shows a canvas that lives outside React (the picture) in the page; the canvas is the picture's only copy on the screen. */
function CanvasView({ canvas, label }: { canvas: HTMLCanvasElement; label: string }): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (el === null) return;
    el.appendChild(canvas);
    return () => { if (canvas.parentNode === el) el.removeChild(canvas); };
  }, [canvas]);
  return <div ref={host} role="img" aria-label={label} data-testid="photo-view" style={{ display: "flex", justifyContent: "center", margin: "var(--space-3) 0" }} />;
}

function Guidance({ a, module }: { a: Ai; module: ObserveModule }): ReactNode {
  return (
    <Card title={a.t("ai.photo.guide.title")} headingLevel={2} id="photo-guide">
      <ul style={{ margin: 0, paddingInlineStart: "1.2em", display: "grid", gap: "var(--space-2)" }}>
        {(["light", "pose", "avoid"] as const).map((k) => <li key={k}>{a.t(`ai.photo.${module}.guide.${k}` as AiKey)}</li>)}
      </ul>
    </Card>
  );
}

function Body({ module }: { module: ObserveModule }): ReactNode {
  const { lang } = useI18n();
  const { kb } = useLoaded();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const [, navigate] = useLocation();
  const updateDraft = useApp((s) => s.updateDraft);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "ready" });
  const [photo, setPhoto] = useState<Captured | null>(null);
  const [token, setToken] = useState<{ readonly value: string; readonly expiresAt: number } | null>(null);
  const [reply, setReply] = useState<ObserveReply | null>(null);
  const [pending, setPending] = useState<readonly string[]>([]);
  const [confirmed, setConfirmed] = useState<readonly string[]>([]);
  const [error, setError] = useState<AiKey | null>(null);
  const vocabulary = useMemo(() => observeVocabulary(kb, module, lang), [kb, module, lang]);
  const exclusive = useMemo(() => exclusiveWithin(kb, vocabulary), [kb, vocabulary]);

  // the picture is emptied whenever it is replaced or dropped, and when the screen closes
  useEffect(() => {
    if (photo === null) return;
    return () => releasePhoto(photo);
  }, [photo]);
  // a new part of the flow is announced by moving to its heading
  useEffect(() => { if (phase.kind === "refused" || phase.kind === "result" || phase.kind === "unreadable") heading.current?.focus(); }, [phase.kind]);

  async function chosen(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";                                     // choosing the same file again must register
    if (file === undefined) return;
    setError(null); setReply(null); setPending([]); setPhoto(null);
    setPhase({ kind: "checking" });
    const read = await readPhoto(file, module);
    if (!read.ok) { setPhase({ kind: "refused", reasons: [CAPTURE[read.error]] }); return; }
    if (!read.photo.quality.ok) {
      releasePhoto(read.photo);
      setPhase({ kind: "refused", reasons: read.photo.quality.issues.map((i) => ISSUE[i]) });
      return;
    }
    setPhoto(read.photo);
    setPhase({ kind: "preview" });
  }

  async function send(): Promise<void> {
    if (photo === null || AI_ENDPOINT === null) return;
    setError(null);
    setPhase({ kind: "sending" });
    const back = (message: AiKey): void => { setError(message); setPhase({ kind: "preview" }); };
    const jpeg = await encodeJpeg(photo.canvas);
    if (jpeg === null) return back("ai.photo.error.encode");
    let session = token;
    if (session === null || session.expiresAt <= Date.now() + 5_000) {
      const started = await startSession(AI_ENDPOINT);
      if (!started.ok) return back(FAILURE[started.error]);
      session = { value: started.value.token, expiresAt: started.value.expiresAt };
      setToken(session);
    }
    const request = buildObserveRequest({ lang, jpeg, vocabulary, exclusive });
    const answer = await sendPhoto(AI_ENDPOINT, session.value, module, request);
    if (!answer.ok) {
      if (answer.error === "token" || answer.error === "expired") setToken(null);
      return back(FAILURE[answer.error]);
    }
    // checked again here: the gateway checked it first
    const checked = validateObservation(answer.value.reply, { ...request, module }).reply;
    setReply(checked);
    if (!checked.readable) { setPhoto(null); setPhase({ kind: "unreadable" }); return; }
    setPending(checked.suggestions.map((s) => s.id));
    setPhase({ kind: "result" });
  }

  const confirm = (id: string): void => {
    updateDraft((d) => withObserved(d, kb, module, [id]));
    setPending((p) => p.filter((x) => x !== id));
    setConfirmed((c) => (c.includes(id) ? c : [...c, id]));
  };
  const reject = (id: string): void => setPending((p) => p.filter((x) => x !== id));
  const remove = (id: string): void => {
    updateDraft((d) => withoutObserved(d, kb, module, id));
    setConfirmed((c) => c.filter((x) => x !== id));
  };
  const another = (): void => { setPhoto(null); setReply(null); setPending([]); setError(null); setPhase({ kind: "ready" }); };
  const done = (): void => { setPhoto(null); navigate("/observe"); };

  const busy = phase.kind === "checking" || phase.kind === "sending";
  const choose = (label: AiKey, variant: "primary" | "secondary" = "primary"): ReactNode => (
    <Button variant={variant} disabled={busy} onClick={() => input.current?.click()}>{a.t(label)}</Button>
  );
  const confidenceOf = (id: string): number => reply?.suggestions.find((s) => s.id === id)?.confidence ?? 0;

  return (
    <>
      <h1>{a.t(`ai.photo.${module}.title` as AiKey)}</h1>
      <p className="muted">{a.t("ai.photo.notice")} <Link href="/settings#settings-ai">{a.t("ai.photo.settings")}</Link></p>
      <input ref={input} type="file" accept="image/*" hidden data-testid="photo-input" aria-label={a.t("ai.photo.choose")} onChange={(e) => void chosen(e)} />

      {phase.kind === "ready" || phase.kind === "refused" || phase.kind === "checking" ? <Guidance a={a} module={module} /> : null}

      {phase.kind === "refused" ? (
        <div data-testid="photo-refused" style={{ margin: "var(--space-4) 0" }}>
          <Notice kind="caution" kindLabel={a.t("ai.photo.quality.title")} title={<span ref={heading} tabIndex={-1}>{a.t("ai.photo.quality.title")}</span>}>
            <ul style={{ margin: 0, paddingInlineStart: "1.2em" }}>{phase.reasons.map((r) => <li key={r}>{a.t(r)}</li>)}</ul>
          </Notice>
        </div>
      ) : null}

      {phase.kind === "unreadable" ? (
        <div data-testid="photo-unreadable" style={{ margin: "var(--space-4) 0" }}>
          <Notice kind="info" kindLabel={a.t("ai.photo.result.title")} title={<span ref={heading} tabIndex={-1}>{a.t("ai.photo.result.title")}</span>}>
            <p style={{ margin: 0 }}>{a.t("ai.photo.unreadable")}</p>
          </Notice>
        </div>
      ) : null}

      {(phase.kind === "preview" || phase.kind === "sending" || phase.kind === "result") && photo !== null ? (
        <Card title={phase.kind === "result" ? undefined : a.t("ai.photo.preview.title")} headingLevel={2} id="photo-preview">
          <CanvasView canvas={photo.canvas} label={a.t("ai.photo.preview.label")} />
          {phase.kind !== "result" ? <p className="muted">{a.t("ai.photo.preview.hint")}</p> : null}
        </Card>
      ) : null}

      {phase.kind === "result" && reply !== null ? (
        <Card title={<span ref={heading} tabIndex={-1}>{a.t("ai.photo.result.title")}</span>} headingLevel={2} id="photo-result">
          <p>{a.t("ai.photo.result.intro")}</p>
          {reply.suggestions.length === 0 ? <p data-testid="photo-none">{a.t("ai.photo.result.none")}</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {pending.map((id) => (
              <li key={id} data-testid="photo-suggestion" data-confidence={confidenceOf(id).toFixed(2)} style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-3) 0", borderTop: "1px solid var(--color-border)" }}>
                <strong>{labelOf(kb, lang, module, id)}</strong>
                <span style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  <Button variant="primary" onClick={() => confirm(id)}>{a.t("ai.photo.result.yes")}</Button>
                  <Button onClick={() => reject(id)}>{a.t("ai.photo.result.no")}</Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {confirmed.length > 0 ? (
        <Card title={a.t("ai.photo.confirmed.title")} headingLevel={2} id="photo-confirmed">
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}>
            {confirmed.map((id) => (
              <li key={id} data-testid="photo-confirmed" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "center" }}>
                <span>{labelOf(kb, lang, module, id)}</span>
                <Button variant="ghost" onClick={() => remove(id)}>{a.t("ai.photo.confirmed.remove")}</Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p role="status" aria-live="polite" data-testid="photo-status">{phase.kind === "checking" ? a.t("ai.photo.checking") : phase.kind === "sending" ? a.t("ai.photo.sending") : error !== null ? a.t(error) : ""}</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        {phase.kind === "ready" || phase.kind === "refused" || phase.kind === "checking" || phase.kind === "unreadable" ? choose(phase.kind === "ready" ? "ai.photo.choose" : "ai.photo.choose.again") : null}
        {phase.kind === "preview" || phase.kind === "sending" ? (
          <>
            <Button variant="primary" disabled={busy} onClick={() => void send()}>{a.t("ai.photo.send")}</Button>
            {choose("ai.photo.choose.again", "secondary")}
          </>
        ) : null}
        {phase.kind === "result" ? (
          <>
            <Button variant="primary" disabled={pending.length > 0} aria-describedby={pending.length > 0 ? "photo-pending-help" : undefined} onClick={done}>{a.t("ai.photo.done")}</Button>
            <Button onClick={another}>{a.t("ai.photo.another")}</Button>
          </>
        ) : null}
        {phase.kind !== "result" ? <LinkButton href="/observe" variant="ghost" onClick={() => setPhoto(null)}>{a.t("ai.photo.hub")}</LinkButton> : null}
      </div>
      {phase.kind === "result" && pending.length > 0 ? <p id="photo-pending-help" className="muted">{a.t("ai.photo.result.pending")}</p> : null}
    </>
  );
}

/** The photo needs a complete profile and a finished screening (the flow guard), the module in this build, the person's consent to that module, and an adult (PD-26). */
function Guarded({ draft, module }: { draft: Draft; module: ObserveModule }): ReactNode {
  const [, navigate] = useLocation();
  const consented = useApp((s) => consentOf(s.prefs, module) !== null);
  const inBuild = module === "tongue" ? AI_TONGUE : AI_FACE;
  const adult = (subjectOf(draft)?.ageYears ?? 0) >= 18;
  const to = !inBuild || !adult ? "/observe" : !consented ? "/settings#settings-ai" : null;
  useEffect(() => { if (to !== null) navigate(to, { replace: true }); }, [to, navigate]);
  return to !== null ? null : <Body module={module} />;
}

export default function ObservePhoto({ module }: { module: string }): ReactNode {
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
  const known = (OBSERVE_MODULES as readonly string[]).includes(module);
  useTitleText(aiI18n(lang).t(known ? (`ai.photo.${module}.title` as AiKey) : "ai.photo.tongue.title"));
  const draft = useDraft("/observe");
  useEffect(() => { if (!known) navigate("/observe", { replace: true }); }, [known, navigate]);
  if (!known) return null;
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><FlowGuard draft={draft}><Guarded draft={draft} module={module as ObserveModule} /></FlowGuard></NeedsKnowledge>;
}
