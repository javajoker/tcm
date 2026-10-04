import { useId, type ReactNode } from "react";
import { useI18n } from "../../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../../i18n/catalogs.ts";
import { along, RANGE } from "./geometry.ts";
import { level5, signed } from "../words.ts";

const ROW = 30;
const LABEL = 120;
const W = 340;
const BAR = W - LABEL - 44;

export interface BarRow { readonly label: string; readonly value: number }

/** Horizontal bars on a zero line (−3 … +3): the direction and a ± glyph with the number carry the sign; one colour only. */
export function SignedBars({ title, rows, description }: { title: string; rows: readonly BarRow[]; description: string }): ReactNode {
  const { t } = useI18n();
  const id = useId();
  const zero = LABEL + BAR / 2;
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  return (
    <svg role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} viewBox={`0 0 ${W} ${rows.length * ROW + 8}`} style={{ width: "100%", maxWidth: 480, height: "auto", display: "block" }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{description}</desc>
      <line x1={zero} y1={0} x2={zero} y2={rows.length * ROW} stroke="var(--ink-muted)" strokeDasharray="2 3" />
      {rows.map((r, i) => {
        const x = LABEL + along(r.value, -RANGE, RANGE, BAR);
        const y = i * ROW + 6;
        return (
          <g key={r.label}>
            <text x={LABEL - 8} y={y + 14} textAnchor="end" fontSize={12} fill="var(--ink)">{r.label}</text>
            <rect x={LABEL} y={y} width={BAR} height={18} fill="var(--border)" fillOpacity={0.35} rx={3} />
            <rect x={Math.min(zero, x)} y={y} width={Math.max(1.5, Math.abs(x - zero))} height={18} fill="var(--scale-6)" rx={3} />
            <text x={LABEL + BAR + 6} y={y + 14} fontSize={11} fill="var(--ink)">{num(r.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export interface Axis { readonly key: "coldHeat" | "deficiencyExcess" | "exterior"; readonly value: number; readonly min: number; readonly max: number }

/** The three scalar axes of the Eight Principles as sliders without a handle: a diamond marks the value between two named ends. */
export function BagangAxes({ title, axes, description }: { title: string; axes: readonly Axis[]; description: string }): ReactNode {
  const { t } = useI18n();
  const id = useId();
  const AW = W - 2 * 56;
  return (
    <svg role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} viewBox={`0 0 ${W} ${axes.length * 44 + 8}`} style={{ width: "100%", maxWidth: 480, height: "auto", display: "block" }}>
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{description}</desc>
      {axes.map((a, i) => {
        const y = i * 44 + 24;
        const x = 56 + along(a.value, a.min, a.max, AW);
        const mid = a.min < 0 ? 56 + AW / 2 : null;
        return (
          <g key={a.key}>
            <text x={56 - 8} y={y + 4} textAnchor="end" fontSize={12} fill="var(--ink)">{t.t(`report.figure.axis.${a.key}.left` as MessageKey)}</text>
            <text x={56 + AW + 8} y={y + 4} fontSize={12} fill="var(--ink)">{t.t(`report.figure.axis.${a.key}.right` as MessageKey)}</text>
            <line x1={56} y1={y} x2={56 + AW} y2={y} stroke="var(--border-strong)" strokeWidth={2} />
            {mid !== null ? <line x1={mid} y1={y - 7} x2={mid} y2={y + 7} stroke="var(--ink-muted)" /> : null}
            <polygon points={`${x},${y - 9} ${x + 8},${y} ${x},${y + 9} ${x - 8},${y}`} fill="var(--primary)" stroke="var(--ink)" strokeWidth={1.5} />
            <text x={x} y={y - 14} textAnchor="middle" fontSize={11} fill="var(--ink)">{t.t(`report.panel.axis.${a.key}` as MessageKey)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export { level5 };
