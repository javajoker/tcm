import type { ReactNode } from "react";
import { useI18n } from "../../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../../i18n/catalogs.ts";
import { CHANNELS, level5, ORGAN_SLUG, signed } from "../words.ts";

const ORGANS = Object.keys(ORGAN_SLUG) as (keyof typeof ORGAN_SLUG)[];
const STEP = (v: number): number => Math.min(8, Math.round((Math.abs(v) / 3) * 8));

/** The organ heat map: ten organs × qi, blood, yin, yang, qi stagnation. A real table; each cell carries a ▲ / ▼ glyph and the number, the shade only repeats the magnitude. */
export function OrganHeat({ observed, caption }: { observed: Readonly<Record<string, number>>; caption: string }): ReactNode {
  const { t } = useI18n();
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const th = { textAlign: "start", padding: "0.35rem 0.5rem", borderBottom: "2px solid var(--border-strong)" } as const;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%" }}>
        <caption style={{ textAlign: "start", fontWeight: 600, padding: "0.4rem 0" }}>{caption}</caption>
        <thead><tr><th scope="col" style={th}><span className="visually-hidden">{t.t("report.panel.col.organ")}</span></th>{CHANNELS.map((c) => <th key={c} scope="col" style={th}>{t.t(`report.channel.${c}` as MessageKey)}</th>)}</tr></thead>
        <tbody>
          {ORGANS.map((o) => (
            <tr key={o}>
              <th scope="row" style={{ textAlign: "start", padding: "0.35rem 0.5rem", fontWeight: 500 }}>{t.t(`report.organ.${ORGAN_SLUG[o]}` as MessageKey)}</th>
              {CHANNELS.map((c) => {
                const v = observed[`${o}.${c}`] ?? 0;
                const n = v === 0 ? 0 : Math.max(1, STEP(v));
                return (
                  <td key={c} title={`${t.t(`report.level.${level5(v)}` as MessageKey)} (${num(v)})`}
                    style={{ padding: "0.35rem 0.5rem", textAlign: "center", background: v === 0 ? "transparent" : `var(--scale-${n})`, color: v === 0 ? "var(--ink-muted)" : `var(--scale-${n}-text)`, border: "1px solid var(--border)" }}>
                    {v === 0 ? "·" : `${v > 0 ? "▲" : "▼"} ${num(v)}`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t.t("report.figure.organs.legend")}</p>
    </div>
  );
}
