import { useEffect } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";

/** Sets `document.title` to "<screen> · <app name>" (or the app name alone) in the current language; every screen calls it once (UX spec §8). */
export function usePageTitle(screen: MessageKey | null): void {
  const { t } = useI18n();
  const app = t.t("common.app.name");
  const title = screen === null ? app : `${t.t(screen)} · ${app}`;
  useEffect(() => { document.title = title; }, [title]);
}

/** The same for a screen whose name is data (an entry of the Learn section): `text` is already in the page language and the script it is shown in. */
export function useTitleText(text: string): void {
  const { t } = useI18n();
  const app = t.t("common.app.name");
  const title = `${text} · ${app}`;
  useEffect(() => { document.title = title; }, [title]);
}
