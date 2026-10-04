import { useState, type ReactNode } from "react";
import type { NoticeRequest } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useApp } from "../../app/store.tsx";
import { Button, Dialog, DialogActions, Notice } from "../../ui/index.ts";
import type { Draft } from "../../storage/types.ts";
import { EmergencyNumbers } from "./EmergencyNumbers.tsx";
import { NOTICE_STYLE } from "./model.ts";
import { NOTICE_SLUG as SLUG, noticeParams } from "./noticeText.ts";

const SELF_HARM = "RF_A_SELF_HARM";

/**
 * S05: the blocking notice(s), merged into one screen, most severe first (UX spec §4.3). Native modal dialog: focus is trapped, Esc and the backdrop do
 * nothing, the heading takes initial focus. One deliberate action acknowledges; the flow then continues. The numbers are one tap away.
 */
export function NoticeScreen({ kb, draft, notices, onAcknowledge }: { kb: KnowledgeBase; draft: Draft; notices: readonly NoticeRequest[]; onAcknowledge: () => void }): ReactNode {
  const { t } = useI18n();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const [showNumbers, setShowNumbers] = useState(false);
  const region = prefs.region ?? kb.emergency._meta.default_region;
  const open = notices.length > 0;
  const withNumbers = notices.some((n) => n.id === "N-A" || n.id === "N-B");
  const selfHarm = notices.some((n) => n.reasons.includes(SELF_HARM));

  const ctx = { kb, t, region, answers: draft.screening.answers, allergies: draft.subject.allergies ?? [], enforcement: kb.config.profile.safety_enforcement };
  const params = (n: NoticeRequest): Record<string, string> => noticeParams(ctx, n);
  const [first, ...rest] = notices;

  const block = (n: NoticeRequest, level: 2 | 3): ReactNode => {
    const slug = SLUG[n.id];
    if (slug === undefined) return null;
    const kind = NOTICE_STYLE[n.id] ?? "info";
    const Heading = `h${level}` as "h2" | "h3";
    return (
      <Notice key={n.id} kind={kind} kindLabel={t.t(`common.notice.${kind}` as MessageKey)}>
        <Heading {...(level === 2 ? { id: "notice-title", tabIndex: -1, "data-autofocus": true } : {})} style={{ margin: "0 0 var(--space-2)" }}>{t.t(`safety.notice.${slug}.title` as MessageKey, params(n))}</Heading>
        <p>{t.t(`safety.notice.${slug}.body` as MessageKey, params(n))}</p>
      </Notice>
    );
  };

  return (
    <Dialog open={open} onClose={() => undefined} labelledBy="notice-title" dismissable={false} alert variant="full">
      {first !== undefined ? (
        <div style={{ maxWidth: "40rem", margin: "0 auto", display: "grid", gap: "var(--space-4)" }}>
          {block(first, 2)}
          {rest.length > 0 ? (<><p className="muted" style={{ margin: 0 }}>{t.t("intake.notice.also")}</p>{rest.map((n) => block(n, 3))}</>) : null}
          {withNumbers && (showNumbers || selfHarm) ? <EmergencyNumbers kb={kb} region={region} onRegion={(id) => setPrefs({ region: id })} crisis={selfHarm} /> : null}
          <DialogActions>
            <Button variant="primary" onClick={onAcknowledge}>{t.t("safety.action.acknowledge")}</Button>
            {withNumbers && !selfHarm ? <Button aria-expanded={showNumbers} onClick={() => setShowNumbers((v) => !v)}>{t.t("safety.action.showNumbers")}</Button> : null}
          </DialogActions>
        </div>
      ) : null}
    </Dialog>
  );
}
