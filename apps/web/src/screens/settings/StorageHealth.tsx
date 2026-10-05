import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useApp } from "../../app/store.tsx";
import { useInstallState } from "../../install/InstallContext.tsx";
import { Button } from "../../ui/index.ts";
import { askToKeep, readHealth, sizeParts, UNKNOWN, type AskOutcome, type Health, type StorageManagerLike } from "../../storage/health.ts";

/** The browser's storage manager, where it has one (`navigator.storage`); a test passes its own. */
const browserManager = (): StorageManagerLike | null => (typeof navigator !== "undefined" && "storage" in navigator ? (navigator.storage as unknown as StorageManagerLike) : null);

/**
 * Storage health (docs/post-mvp/design/backup-and-data-lock.md §4): what the app uses, whether the browser has agreed to keep it, a button to ask — offered only after the first saved result and only ever
 * acted on by a click — and, always, why data can disappear. A browser without the API shows the fixed text alone. `compact` is the short form inside the backup dialog.
 */
export function StorageHealth({ compact = false, manager = browserManager() }: { compact?: boolean; manager?: StorageManagerLike | null }): ReactNode {
  const { t, lang } = useI18n();
  const storage = useApp((s) => s.storage);
  const listAssessments = useApp((s) => s.listAssessments);
  const { installed } = useInstallState();
  const [health, setHealth] = useState<Health>(UNKNOWN);
  const [saved, setSaved] = useState(0);
  const [asked, setAsked] = useState<AskOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    void readHealth(manager).then((h) => { if (alive) setHealth(h); });
    void listAssessments().then((all) => { if (alive) setSaved(all.length); });
    return () => { alive = false; };
  }, [manager, listAssessments]);

  const size = health.usage === null ? null : sizeParts(health.usage);
  const formatted = size === null ? "" : ((): string => {
    try { return new Intl.NumberFormat(lang, { style: "unit", unit: size.unit, unitDisplay: "short", maximumFractionDigits: 1 }).format(size.value); } catch { return `${size.value} ${size.unit}`; }
  })();
  const ask = async (): Promise<void> => {
    const outcome = await askToKeep(manager);
    setAsked(outcome);
    setHealth(await readHealth(manager));
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      {compact ? null : <h3 style={{ margin: 0 }}>{t.t("common.health.title")}</h3>}
      {storage === "memory" ? <p role="status">{t.t("common.health.memory")}</p> : null}
      {size !== null && storage !== "memory" ? <p>{t.t("common.health.used", { size: formatted })}</p> : null}
      {health.persisted === true ? <p>{t.t("common.health.persisted")}</p> : health.persisted === false ? <p>{t.t("common.health.notPersisted")}</p> : null}
      {health.canAsk && saved > 0 && storage !== "memory" ? <p><Button onClick={() => { void ask(); }}>{t.t("common.health.ask")}</Button></p> : null}
      <p role="status" className="muted">{asked === null ? "" : t.t(`common.health.ask.${asked}`)}</p>
      {compact ? null : (
        <>
          <h4 style={{ margin: 0 }}>{t.t("common.health.why.title")}</h4>
          <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
            {(["private", "idle", "cleared", "other"] as const).map((k) => <li key={k}>{t.t(`common.health.why.${k}`)}</li>)}
          </ul>
          <p className="muted">{installed ? t.t("common.health.installed") : t.t("common.health.install.hint")}</p>
        </>
      )}
    </div>
  );
}
