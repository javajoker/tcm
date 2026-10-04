// Pure geometry of the panel figures: unit-tested, so a figure can be checked against the data it draws.
import { ELEMENTS, type Element } from "@tcm/wuxing";

export const SIZE = 260;
export const CENTER = SIZE / 2;
export const RADIUS = 86;
/** The channel range of the panel: −3 (deficient) … +3 (excess); 0 is "a typical healthy person" and sits on the middle ring. */
export const RANGE = 3;

/** Angle of the i-th element on the radar: 木 at the top, then clockwise in the order of generation 木 → 火 → 土 → 金 → 水. */
export const angleOf = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / ELEMENTS.length;

/** Radius for a value: −3 at the centre, 0 on the half-radius ring, +3 at the rim; values beyond are clamped to the rim. */
export const radiusOf = (v: number): number => RADIUS * Math.min(1, Math.max(0, (v + RANGE) / (2 * RANGE)));

export const pointOf = (i: number, v: number): readonly [number, number] => {
  const a = angleOf(i), r = radiusOf(v);
  return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)];
};

export const polygonOf = (values: Readonly<Record<Element, number>>): string => ELEMENTS.map((e, i) => pointOf(i, values[e]).map((x) => x.toFixed(1)).join(",")).join(" ");
export const ringOf = (v: number): string => polygonOf(Object.fromEntries(ELEMENTS.map((e) => [e, v])) as Record<Element, number>);

/** Position of an axis label just outside the rim, and which way the text runs from there. */
export function labelOf(i: number): { x: number; y: number; anchor: "start" | "middle" | "end" } {
  const a = angleOf(i), r = RADIUS + 18;
  const x = CENTER + r * Math.cos(a), y = CENTER + r * Math.sin(a);
  const c = Math.cos(a);
  return { x, y: y + 4, anchor: Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end" };
}

/** Position of a marker on a horizontal axis spanning `min`…`max` over [0, width]. */
export const along = (v: number, min: number, max: number, width: number): number => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * width;
