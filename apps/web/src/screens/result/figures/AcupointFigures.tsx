import type { ReactNode } from "react";
import type { AcupointRecommendation } from "@tcm/engine";
import { useI18n } from "../../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../../i18n/catalogs.ts";
import { MARK_SCALE, SPOTS, VIEW_BOX, VIEW_ORDER, type Spot, type ViewId } from "./acupointSpots.ts";

// Original line-style schematics of the body parts the recommended points lie on (U-25, UX spec UQ7: original simple drawings, WHO codes as text). No photographs, no text inside shapes
// other than live `<text>`; the list of points with their written locations is the accessible twin of every figure.

const BODY = { fill: "var(--surface)", stroke: "var(--ink)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" } as const;
const DETAIL = { fill: "none", stroke: "var(--ink-muted)", strokeWidth: 1.2, strokeDasharray: "4 3", strokeLinecap: "round" } as const;

/** A finger or toe: a stroke-width tube, outlined by drawing a wider stroke in ink under a narrower one in the surface colour. */
function Tube({ d, w }: { d: string; w: number }): ReactNode {
  return <><path d={d} fill="none" stroke="var(--ink)" strokeWidth={w + 2.4} strokeLinecap="round" /><path d={d} fill="none" stroke="var(--surface)" strokeWidth={w} strokeLinecap="round" /></>;
}

/** The right hand and forearm seen from the palm side (thumb on the left); the wrist crease is at y = 200. `mirror` shows it from the back (thumb on the right). */
function Arm({ back }: { back: boolean }): ReactNode {
  const body = (
    <>
      <Tube d="M62 262 L62 316" w={12} /><Tube d="M75 262 L75 322" w={12} /><Tube d="M88 262 L88 318" w={12} /><Tube d="M99 262 L99 304" w={11} />
      <Tube d="M60 214 Q 36 226 28 262" w={17} />
      <path d="M46 10 C 44 70 52 140 58 200 L 54 264 L 106 264 L 102 200 C 108 140 116 70 114 10 Z" {...BODY} />
      <path d="M58 200 L 102 200" {...DETAIL} />
      {back ? <path d="M60 264 C 66 258 70 258 76 264 M76 264 C 80 258 86 258 90 264 M90 264 C 94 258 98 258 104 264" {...DETAIL} /> : <path d="M58 214 C 60 236 64 250 66 262" {...DETAIL} />}
    </>
  );
  return back ? <g transform="translate(160 0) scale(-1 1)">{body}<path d="M46 10 L114 10" {...DETAIL} /></g> : body;
}

function Leg(): ReactNode {
  return (
    <>
      <path d="M52 0 C 54 32 62 52 64 72 C 62 110 66 150 70 190 C 72 230 78 268 82 292 C 76 300 64 316 66 340 L 134 340 C 136 316 124 300 118 292 C 122 268 128 230 130 190 C 134 150 138 110 136 72 C 138 52 146 32 148 0" {...BODY} />
      <ellipse cx={100} cy={70} rx={20} ry={22} {...BODY} />
      <path d="M97 96 L 100 282" {...DETAIL} />
      <circle cx={116} cy={290} r={7} {...BODY} strokeWidth={1.4} /><circle cx={84} cy={296} r={7} {...BODY} strokeWidth={1.4} />
    </>
  );
}

const TOES = (
  <>
    <ellipse cx={58} cy={38} rx={13} ry={27} {...BODY} /><ellipse cx={79} cy={28} rx={8.5} ry={22} {...BODY} /><ellipse cx={94} cy={34} rx={8} ry={19} {...BODY} />
    <ellipse cx={106} cy={42} rx={7.5} ry={17} {...BODY} /><ellipse cx={116} cy={52} rx={7} ry={14} {...BODY} />
    <path d="M60 212 C 54 170 46 130 44 100 C 42 80 44 66 52 62 L 118 62 C 124 70 124 90 120 112 C 114 150 112 186 108 212 Z" {...BODY} />
  </>
);

/** The top of the right foot (big toe on the left). */
function FootTop(): ReactNode {
  return <>{TOES}<path d="M70 66 L 76 150 M 86 66 L 90 150" {...DETAIL} /></>;
}

/** The sole of the same foot, turned over (big toe on the right), drawn mirrored about x = 170. */
function FootSole(): ReactNode {
  return <g transform="translate(340 0) scale(-1 1)">{TOES}<path d="M52 150 C 60 120 90 120 104 150" {...DETAIL} /></g>;
}

function Torso(): ReactNode {
  return (
    <>
      <path d="M88 0 L 88 16 C 66 20 44 24 40 34 C 36 46 48 64 52 80 C 54 110 58 140 56 160 C 54 172 52 178 50 184 L 150 184 C 148 178 146 172 144 160 C 142 140 146 110 148 80 C 152 64 164 46 160 34 C 156 24 134 20 112 16 L 112 0" {...BODY} />
      <path d="M96 20 L 104 20" {...DETAIL} />
      <circle cx={71} cy={66.5} r={3} {...DETAIL} /><circle cx={129} cy={66.5} r={3} {...DETAIL} /><circle cx={100} cy={143.6} r={3.5} {...DETAIL} />
    </>
  );
}

function Back(): ReactNode {
  return (
    <>
      <path d="M88 0 L 88 36 C 66 40 44 46 38 56 C 34 70 46 90 50 120 C 52 150 56 190 54 230 C 52 262 48 290 48 310 L 152 310 C 152 290 148 262 146 230 C 144 190 148 150 150 120 C 154 90 166 70 162 56 C 156 46 134 40 112 36 L 112 0" {...BODY} />
      <path d="M100 40 L 100 300" {...DETAIL} />
    </>
  );
}

function Head(): ReactNode {
  return (
    <>
      <path d="M80 148 L 84 224 M 146 142 L 150 224" {...BODY} />
      <circle cx={110} cy={92} r={64} {...BODY} />
      <path d="M48 96 L 36 114 L 50 116" {...BODY} />
      <ellipse cx={118} cy={100} rx={9} ry={17} {...BODY} strokeWidth={1.6} />
      <path d="M118 83 L 118 28" {...DETAIL} />
    </>
  );
}

const ART: Readonly<Record<ViewId, () => ReactNode>> = {
  "arm-front": () => <Arm back={false} />,
  "arm-back": () => <Arm back />,
  "leg-front": Leg, "foot-top": FootTop, "foot-sole": FootSole, torso: Torso, back: Back, head: Head,
};

/** One marked point: a ring-and-dot marker (shape, not colour alone), a thin line to its label, and the label as live text (name and WHO code). */
function Marker({ name, code, spot, mark }: { name: string; code: string; spot: Spot; mark: number }): ReactNode {
  const { x, y, label } = spot;
  const tx = label.anchor === "start" ? label.x - 4 : label.x + 4;
  return (
    <g>
      <line x1={x} y1={y} x2={tx} y2={label.y - 3} stroke="var(--primary)" strokeWidth={1} />
      <circle cx={x} cy={y} r={8 * mark} fill="none" stroke="var(--primary)" strokeWidth={1.6} />
      <circle cx={x} cy={y} r={3.6 * mark} fill="var(--primary)" />
      <text x={label.x} y={label.y} textAnchor={label.anchor} fontSize={13} fill="var(--ink)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">
        <tspan lang="zh-Hant" fontWeight={600}>{name}</tspan><tspan dx={4} fill="var(--ink-muted)">{code}</tspan>
      </text>
    </g>
  );
}

/**
 * For the recommended points, one schematic of each body part they lie on, the points marked and labelled. It only helps to find the neighbourhood: every figure says so, and the written
 * location in the list below it is the authority (and the text twin). Points without a drawing, and a result without points, produce nothing.
 */
export function AcupointFigures({ points }: { points: readonly AcupointRecommendation[] }): ReactNode {
  const { t } = useI18n();
  const views = VIEW_ORDER.map((view) => ({ view, marked: points.filter((p) => SPOTS[p.name]?.view === view) })).filter((v) => v.marked.length > 0);
  if (views.length === 0) return null;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", margin: "var(--space-3) 0" }}>
        {views.map(({ view, marked }) => {
          const [minX, minY, w, h] = VIEW_BOX[view];
          const title = t.t(`report.points.view.${view}` as MessageKey);
          return (
            <figure key={view} style={{ margin: 0, flex: "0 1 auto", width: `min(100%, ${Math.round(w * 1.2)}px)` }}>
              <svg viewBox={`${minX} ${minY} ${w} ${h}`} role="img" aria-label={t.t("report.points.figure.label", { view: title, points: marked.map((p) => `${p.name} ${p.code}`).join("、") })} style={{ width: "100%", height: "auto", display: "block" }}>
                {ART[view]()}
                {marked.map((p) => <Marker key={p.name} name={p.name} code={p.code} spot={SPOTS[p.name]!} mark={MARK_SCALE[view] ?? 1} />)}
              </svg>
              <figcaption className="muted" style={{ textAlign: "center" }}>{title}</figcaption>
            </figure>
          );
        })}
      </div>
      <p className="muted">{t.t("report.points.figure.note")}</p>
    </div>
  );
}
