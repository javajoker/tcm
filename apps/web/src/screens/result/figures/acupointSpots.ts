// Where each acupressure point is drawn on the original schematic body parts (U-25). Pure data, so a test can check that every point of the guidance is covered and lies inside its view.
// Coordinates are those of the view's own frame (see `VIEW_BOX`); the schematics are drawn to proportional-cun scale where the written location gives one (the written place is what counts,
// the drawing only shows the neighbourhood). A point that is not listed here simply has no drawing.

export type ViewId = "arm-front" | "arm-back" | "leg-front" | "foot-top" | "foot-sole" | "torso" | "back" | "head";

/** The order the views appear in: head and trunk, arm, leg, foot. */
export const VIEW_ORDER: readonly ViewId[] = ["head", "torso", "back", "arm-front", "arm-back", "leg-front", "foot-top", "foot-sole"];

/** `minX minY width height` of each view; wide enough for the labels on both sides of the body part. */
export const VIEW_BOX: Readonly<Record<ViewId, readonly [number, number, number, number]>> = {
  "arm-front": [-50, -10, 260, 350],
  "arm-back": [-50, -20, 260, 360],
  "leg-front": [-60, -10, 300, 360],
  "foot-top": [-40, 0, 260, 230],
  "foot-sole": [190, 0, 210, 230],
  torso: [-40, -10, 280, 210],
  back: [-50, -10, 300, 330],
  head: [-10, 0, 250, 230],
};

/** Markers are drawn smaller where points lie close together (氣海, 石門 and 關元 are half a cun and one cun apart). */
export const MARK_SCALE: Readonly<Partial<Record<ViewId, number>>> = { torso: 0.6 };

export interface Spot {
  readonly view: ViewId;
  readonly x: number;
  readonly y: number;
  /** Where the label sits (its text anchor is on the side facing the point), joined to the point by a thin line. */
  readonly label: { readonly x: number; readonly y: number; readonly anchor: "start" | "end" };
}

const left = (x: number, y: number) => ({ x, y, anchor: "end" as const });
const right = (x: number, y: number) => ({ x, y, anchor: "start" as const });

/** Points by their Chinese name (the key used everywhere else in the guidance). */
export const SPOTS: Readonly<Record<string, Spot>> = {
  // head and neck (side view, face to the left)
  百會: { view: "head", x: 118, y: 28.5, label: right(158, 22) },
  風池: { view: "head", x: 150, y: 142, label: right(176, 150) },

  // trunk, front: the navel is 17 cun below the notch above the breastbone, the pubic bone 22 (7.27 px per cun)
  膻中: { view: "torso", x: 100, y: 66.5, label: right(160, 58) },
  中脘: { view: "torso", x: 100, y: 114.5, label: right(160, 108) },
  氣海: { view: "torso", x: 100, y: 154.5, label: right(160, 138) },
  石門: { view: "torso", x: 100, y: 158, label: right(160, 158) },
  關元: { view: "torso", x: 100, y: 165.4, label: right(160, 178) },

  // trunk, back: 大椎 below the 7th neck vertebra, then about 1.43 cun per vertebra (9 px per cun)
  大椎: { view: "back", x: 100, y: 40, label: right(176, 32) },
  肩井: { view: "back", x: 70, y: 45, label: left(26, 30) },
  膈俞: { view: "back", x: 86.5, y: 130, label: left(36, 130) },
  腎俞: { view: "back", x: 86.5, y: 220, label: left(36, 214) },
  命門: { view: "back", x: 100, y: 220, label: right(176, 226) },
  次髎: { view: "back", x: 90, y: 284, label: left(36, 284) },

  // the inner side of the forearm and the palm (right arm, thumb on the left; the wrist crease is at y = 200 and 15.8 px are one cun)
  內關: { view: "arm-front", x: 80, y: 168, label: right(124, 160) },
  列缺: { view: "arm-front", x: 60, y: 176, label: left(36, 170) },
  太淵: { view: "arm-front", x: 68, y: 200, label: left(36, 204) },
  神門: { view: "arm-front", x: 96, y: 200, label: right(124, 204) },
  魚際: { view: "arm-front", x: 62, y: 232, label: left(36, 238) },

  // the back of the hand and the outer elbow (the same arm from behind, thumb on the right)
  合谷: { view: "arm-back", x: 101, y: 240, label: left(36, 240) },
  曲池: { view: "arm-back", x: 112, y: 12, label: right(134, 8) },

  // the front of the right leg (outer side on the left): the knee is at y = 70, the ankle at y = 292, 14 px are one cun
  血海: { view: "leg-front", x: 116, y: 22, label: right(164, 20) },
  陰陵泉: { view: "leg-front", x: 128, y: 106, label: right(164, 110) },
  足三里: { view: "leg-front", x: 86, y: 134, label: left(36, 130) },
  豐隆: { view: "leg-front", x: 84, y: 184, label: left(36, 186) },
  三陰交: { view: "leg-front", x: 114, y: 248, label: right(164, 248) },
  太溪: { view: "leg-front", x: 118, y: 290, label: right(164, 290) },
  崑崙: { view: "leg-front", x: 82, y: 296, label: left(36, 298) },

  // the top and the sole of the right foot (the sole is the same foot turned over, drawn mirrored)
  行間: { view: "foot-top", x: 70, y: 61, label: left(30, 66) },
  太衝: { view: "foot-top", x: 68, y: 88, label: left(30, 92) },
  至陰: { view: "foot-top", x: 122, y: 52, label: right(150, 44) },
  湧泉: { view: "foot-sole", x: 253, y: 112, label: right(306, 112) },
};
