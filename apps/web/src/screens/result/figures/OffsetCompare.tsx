import { useId, type ReactNode } from "react";
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { useI18n } from "../../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../../i18n/catalogs.ts";
import { along, RANGE } from "./geometry.ts";
import { ELEMENT_SLUG, signed } from "../words.ts";

const ROW = 40;
const LABEL = 56;
const W = 340;
const BAR = W - LABEL - 60;
const GLYPH = { aligned: "✓", opposed: "✕", neutral: "–" } as const;

/** Per element: the deviation from a typical healthy person (solid bar) next to the one from the person's own usual tendency (outlined bar), with the alignment glyph. */
export function OffsetCompare({ title, description, primary, personal, alignment }: {
  title: string; description: string; primary: Readonly<Record<Element, number>>; personal: Readonly<Record<Element, number>>; alignment: Readonly<Record<Element, "aligned" | "opposed" | "neutral">>;
}): ReactNode {
  const { t } = useI18n();
  const id = useId();
  const zero = LABEL + BAR / 2;
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  return (
    <svg role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} viewBox={`0 0 ${W} ${ELEMENTS.length * ROW + 8}`} style={{ width: "100%", maxWidth: 480, height: "auto", display: "block" }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{description}</desc>
      <line x1={zero} y1={0} x2={zero} y2={ELEMENTS.length * ROW} stroke="var(--ink-muted)" strokeDasharray="2 3" />
      {ELEMENTS.map((e, i) => {
        const y = i * ROW + 4;
        const xp = LABEL + along(primary[e], -RANGE, RANGE, BAR), xs = LABEL + along(personal[e], -RANGE, RANGE, BAR);
        return (
          <g key={e}>
            <text x={LABEL - 8} y={y + 20} textAnchor="end" fontSize={12} fill="var(--ink)">{t.t(`report.element.${ELEMENT_SLUG[e]}` as MessageKey)}</text>
            <rect x={Math.min(zero, xp)} y={y} width={Math.max(1.5, Math.abs(xp - zero))} height={14} fill="var(--scale-6)" rx={2} />
            <rect x={Math.min(zero, xs)} y={y + 18} width={Math.max(1.5, Math.abs(xs - zero))} height={14} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" rx={2} />
            <text x={LABEL + BAR + 8} y={y + 12} fontSize={11} fill="var(--ink)">{num(primary[e])}</text>
            <text x={LABEL + BAR + 8} y={y + 30} fontSize={11} fill="var(--ink)">{num(personal[e])} {GLYPH[alignment[e]]}</text>
          </g>
        );
      })}
    </svg>
  );
}
