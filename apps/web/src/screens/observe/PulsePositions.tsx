import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";

const BODY = { fill: "var(--surface)", stroke: "var(--ink)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const DETAIL = { fill: "none", stroke: "var(--ink-muted)", strokeWidth: 1.2, strokeDasharray: "4 3", strokeLinecap: "round" } as const;
const SPOTS = [{ id: "cun", y: 112 }, { id: "guan", y: 134 }, { id: "chi", y: 156 }] as const;

function Tube({ d, w }: { d: string; w: number }): ReactNode {
  return <><path d={d} fill="none" stroke="var(--ink)" strokeWidth={w + 2.4} strokeLinecap="round" /><path d={d} fill="none" stroke="var(--surface)" strokeWidth={w} strokeLinecap="round" /></>;
}

/** One hand and wrist, palm up, fingers up, as the left hand (thumb on the left); the right hand is this mirrored. The wrist crease is at y = 110. */
function Hand(): ReactNode {
  return (
    <>
      <Tube d="M-18 56 L-18 12" w={11} /><Tube d="M-6 56 L-6 6" w={11} /><Tube d="M6 56 L6 10" w={11} /><Tube d="M18 56 L18 22" w={10} />
      <Tube d="M-20 98 Q -38 88 -46 68" w={14} />
      <path d="M-22 110 L-26 56 L26 56 L22 110 L28 250 L-28 250 Z" {...BODY} />
      <path d="M-22 110 L 22 110" {...DETAIL} />
      <circle cx={-24} cy={134} r={6} {...DETAIL} />
    </>
  );
}

/**
 * Both wrists, palms up, with the three pulse positions on the thumb side of each — cun nearest the hand, guan at the bony bump, chi nearest the elbow — and the selected one filled.
 * An original line drawing; the labels are live text, and the group of choices beside it is the accessible control, so the figure is only a help to find the places.
 */
export function PulsePositions({ position }: { position: string | null }): ReactNode {
  const { t } = useI18n();
  const word = (id: string): string => t.t(`observe.pulse.figure.${id}` as MessageKey);
  const label = `${t.t("observe.pulse.figure.label")}${position ? ` ${t.t("observe.pulse.figure.selected", { position: t.t(`observe.pulse.position.${position}` as MessageKey) })}` : ""}`;
  const hand = (side: "L" | "R", cx: number): ReactNode => (
    <g key={side}>
      <g transform={`translate(${cx} 0)${side === "R" ? " scale(-1 1)" : ""}`}><Hand /></g>
      {SPOTS.map((s) => {
        const on = position === `${side}-${s.id}`;
        const x = cx + (side === "L" ? -13 : 13);
        const lx = cx + (side === "L" ? 36 : -36);
        return (
          <g key={s.id}>
            <circle cx={x} cy={s.y} r={9} fill={on ? "var(--primary)" : "var(--surface)"} fillOpacity={on ? 1 : 0.6} stroke="var(--primary)" strokeWidth={on ? 3 : 1.6} strokeDasharray={on ? undefined : "3 2"} />
            <line x1={x + (side === "L" ? 9 : -9)} y1={s.y} x2={lx + (side === "L" ? -3 : 3)} y2={s.y} stroke="var(--primary)" strokeWidth={1} />
            <text x={lx} y={s.y + 4} textAnchor={side === "L" ? "start" : "end"} fontSize={13} fontWeight={on ? 700 : 500} fill="var(--ink)">{word(s.id)}{on ? " ✓" : ""}</text>
          </g>
        );
      })}
      <text x={cx} y={270} textAnchor="middle" fontSize={13} fill="var(--ink-muted)">{word(side === "L" ? "left" : "right")}</text>
    </g>
  );
  return (
    <figure style={{ margin: "var(--space-3) 0" }}>
      <svg viewBox="0 0 340 280" role="img" aria-label={label} style={{ width: "100%", maxWidth: 360, height: "auto", display: "block", margin: "0 auto" }}>
        {hand("L", 90)}{hand("R", 250)}
      </svg>
      <figcaption className="muted">{t.t("observe.pulse.figure.how")}</figcaption>
    </figure>
  );
}
