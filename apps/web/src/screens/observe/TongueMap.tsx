import { useId, type KeyboardEvent, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";

const OUTLINE = "M120 8 C 52 8, 22 86, 30 170 C 38 236, 72 290, 120 290 C 168 290, 202 236, 210 170 C 218 86, 188 8, 120 8 Z";
export const MAP_ZONES = ["tip", "center", "root", "edge"] as const;

/**
 * An original, stylised tongue (tip at the top) with four selectable zones — tip, centre, root and the edges. Every zone is a keyboard-focusable button
 * (`aria-pressed`) with a text label; a ✓ marks the zones that have a chosen sign, so selection is never colour only. No photograph: licence-free and neutral.
 */
export function TongueMap({ marked, onOpen }: { marked: ReadonlySet<string>; onOpen: (zone: string) => void }): ReactNode {
  const { t } = useI18n();
  const id = useId();
  const zone = (z: (typeof MAP_ZONES)[number], shapes: ReactNode, lx: number, ly: number): ReactNode => {
    const on = marked.has(z);
    const label = t.t(`observe.tongue.zone.${z}` as MessageKey);
    const press = (e: KeyboardEvent): void => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(z); } };
    return (
      <g key={z} role="button" tabIndex={0} aria-pressed={on} aria-label={t.t("observe.tongue.zone.open", { zone: label })} onClick={() => onOpen(z)} onKeyDown={press} style={{ cursor: "pointer" }}
        fill="var(--surface)" fillOpacity={on ? 0.55 : 0.18} stroke="var(--ink)" strokeWidth={on ? 3 : 1.5} strokeDasharray={on ? undefined : "5 4"}>
        {shapes}
        <text x={lx} y={ly} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--ink)" stroke="none">{label}{on ? " ✓" : ""}</text>
      </g>
    );
  };
  return (
    <svg viewBox="0 0 240 300" style={{ width: "100%", maxWidth: 300, height: "auto", display: "block", margin: "0 auto" }} role="group" aria-label={t.t("observe.tongue.zones.map")}>
      <defs><clipPath id={`${id}-clip`}><path d={OUTLINE} /></clipPath></defs>
      <path d={OUTLINE} fill="var(--tongue-normal)" stroke="var(--tongue-outline)" strokeWidth={3} />
      <g clipPath={`url(#${id}-clip)`}>
        {zone("tip", <ellipse cx={120} cy={52} rx={64} ry={46} />, 120, 58)}
        {zone("center", <ellipse cx={120} cy={152} rx={46} ry={52} />, 120, 158)}
        {zone("root", <ellipse cx={120} cy={250} rx={64} ry={46} />, 120, 256)}
        {zone("edge", <><rect x={0} y={60} width={56} height={200} /><rect x={184} y={60} width={56} height={200} /></>, 120, 106)}
      </g>
    </svg>
  );
}
