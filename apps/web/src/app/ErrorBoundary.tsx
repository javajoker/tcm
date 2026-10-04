import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Button, Notice } from "../ui/index.ts";
import { IS_DEV_PROFILE } from "./profile.ts";
import { useApp } from "./store.tsx";

/**
 * The safe fallback of UX spec S19: if anything in a screen throws, show no assessment output at all — only the permanent disclaimer (in the shell),
 * emergency guidance, a way to keep the user's inputs and a way to start over.
 */
function SafeFallback(): ReactNode {
  const { t } = useI18n();
  const draft = useApp((s) => s.draft);
  const discard = useApp((s) => s.discardDraft);
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);          // announce what happened: focus moves to the heading when the fallback appears
  const onCopy = (): void => {
    const text = JSON.stringify(draft ?? {}, null, 2);
    navigator.clipboard.writeText(text).then(() => setCopy("ok"), () => setCopy("failed"));
  };
  const restart = (): void => { void discard().finally(() => { window.location.assign("/"); }); };
  return (
    <div>
      <h1 ref={heading} tabIndex={-1}>{t.t("errors.crash.title")}</h1>
      <p>{t.t("errors.crash.body")}</p>
      <Notice kind="emergency" kindLabel={t.t("common.notice.emergency")}>{t.t("errors.crash.seekCare")}</Notice>
      <p style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
        {draft !== null ? <Button onClick={onCopy}>{t.t("errors.crash.copy")}</Button> : null}
        <Button variant="primary" onClick={restart}>{t.t("errors.crash.restart")}</Button>
      </p>
      <p role="status">{copy === "ok" ? t.t("errors.crash.copied") : copy === "failed" ? t.t("errors.crash.copyFailed") : null}</p>
    </div>
  );
}

interface Props { readonly children: ReactNode; /** A change of this value (the route) clears a previous error. */ readonly resetKey?: string }
interface BoundaryState { readonly failed: boolean; readonly key: string | undefined }

export class ErrorBoundary extends Component<Props, BoundaryState> {
  override state: BoundaryState = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError(): Partial<BoundaryState> { return { failed: true }; }
  static getDerivedStateFromProps(props: Props, state: BoundaryState): Partial<BoundaryState> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing is logged in a release build: an error or stack must never become a place where health data leaks (privacy §3).
    // eslint-disable-next-line no-console
    if (IS_DEV_PROFILE) console.error(error, info.componentStack);
  }
  override render(): ReactNode { return this.state.failed ? <SafeFallback /> : this.props.children; }
}
