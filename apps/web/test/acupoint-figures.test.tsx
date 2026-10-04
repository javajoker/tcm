import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { PulsePositions } from "../src/screens/observe/PulsePositions.tsx";
import { AcupointFigures } from "../src/screens/result/figures/AcupointFigures.tsx";
import { SPOTS, VIEW_BOX, VIEW_ORDER } from "../src/screens/result/figures/acupointSpots.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const wrap = (ui: ReactNode, lang: "en" | "zh-Hant" = "en"): ReactNode => <I18nProvider lang={lang} setLang={() => undefined}>{ui}</I18nProvider>;
const point = (name: string) => { const a = kb.treatment.acupoints[name]!; return { name, code: a.code, meridian: a.meridian, patterns: [], annotations: [] }; };
const all = Object.keys(kb.treatment.acupoints).map(point);

describe("acupoint schematics (U-25)", () => {
  it("every point of the guidance has a place on a drawing, and every place belongs to a point of the guidance", () => {
    expect(Object.keys(SPOTS).sort()).toEqual(Object.keys(kb.treatment.acupoints).sort());
  });

  it("every place and its label lie inside the view they belong to, and the view is one that is drawn", () => {
    for (const [name, s] of Object.entries(SPOTS)) {
      const [minX, minY, w, h] = VIEW_BOX[s.view];
      expect(VIEW_ORDER, name).toContain(s.view);
      for (const [x, y] of [[s.x, s.y], [s.label.x, s.label.y]] as const) {
        expect(x, `${name} x`).toBeGreaterThan(minX);
        expect(x, `${name} x`).toBeLessThan(minX + w);
        expect(y, `${name} y`).toBeGreaterThan(minY);
        expect(y, `${name} y`).toBeLessThan(minY + h);
      }
      // the label's text runs away from the point: a label anchored at its end lies left of the point, one anchored at its start right of it
      expect(s.label.anchor === "end" ? s.label.x < s.x : s.label.x > s.x, name).toBe(true);
    }
  });

  it("shows only the views the recommended points lie on, each a described image with the points as live text", () => {
    render(wrap(<AcupointFigures points={[point("足三里"), point("三陰交"), point("內關")]} />));
    const figures = screen.getAllByRole("figure");
    expect(figures).toHaveLength(2);
    const leg = screen.getByRole("img", { name: /^Schematic of the Front of the leg \(right leg\); marked points: 足三里 ST36、三陰交 SP6\.$/ });
    const legText = within(leg.closest("figure")!);
    expect(legText.getByText("足三里")).toBeInTheDocument();
    expect(legText.getByText("ST36")).toBeInTheDocument();
    expect(legText.getByText("Front of the leg (right leg)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Inner side of the forearm and palm.*內關 PC6/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Head and neck/ })).toBeNull();
    expect(screen.getByText(/the written location in the list below is what counts/)).toBeInTheDocument();
  });

  it("nothing is drawn for no points, or for a point without a drawing", () => {
    const { container, rerender } = render(wrap(<AcupointFigures points={[]} />));
    expect(container.querySelector("svg")).toBeNull();
    rerender(wrap(<AcupointFigures points={[{ name: "不存在", code: "XX0", meridian: "—", patterns: [], annotations: [] }]} />));
    expect(container.querySelector("svg")).toBeNull();
  });

  it("every point of the guidance is drawn with its name and WHO code as text, and the drawings contain no raster images", () => {
    const { container } = render(wrap(<AcupointFigures points={all} />, "zh-Hant"));
    expect(screen.getAllByRole("figure")).toHaveLength(VIEW_ORDER.length);
    for (const p of all) {
      expect(screen.getAllByText(p.name).length, p.name).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(p.code).length, p.code).toBeGreaterThanOrEqual(1);
    }
    expect(container.querySelector("image, foreignObject")).toBeNull();
    expect(screen.getByText(/示意圖不按比例/)).toBeInTheDocument();
  });

  it("has no axe violations, in either language", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { container, unmount } = render(wrap(<AcupointFigures points={all} />, lang));
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
      unmount();
    }
  });
});

describe("pulse positions figure (U-25)", () => {
  it("shows both wrists with the three positions as text, and says how to place the fingers", () => {
    render(wrap(<PulsePositions position={null} />));
    expect(screen.getByRole("img", { name: /^Both wrists, palms up\. On the thumb side of each, cun is nearest the hand, guan is at the bony bump and chi is nearest the elbow\.$/ })).toBeInTheDocument();
    expect(screen.getAllByText("cun")).toHaveLength(2);
    expect(screen.getAllByText("guan")).toHaveLength(2);
    expect(screen.getAllByText("chi")).toHaveLength(2);
    expect(screen.getByText("Left hand")).toBeInTheDocument();
    expect(screen.getByText("Right hand")).toBeInTheDocument();
    expect(screen.getByText(/middle finger on the bony bump.*guan.*index finger.*cun.*ring finger.*chi/)).toBeInTheDocument();
    expect(screen.queryByText(/✓/)).toBeNull();
  });

  it("marks the chosen position in the picture and in the description (never by colour alone)", () => {
    const { container } = render(wrap(<PulsePositions position="R-chi" />));
    expect(screen.getByRole("img", { name: /Selected: Right chi\.$/ })).toBeInTheDocument();
    expect(screen.getByText("chi ✓")).toBeInTheDocument();
    expect(screen.getAllByText(/✓/)).toHaveLength(1);
    expect(container.querySelectorAll("circle[stroke-dasharray]").length).toBe(5 + 2);       // five dashed rings (the chosen one is solid), two wrist-bone outlines
  });

  it("is in Chinese on the Chinese page, and has no axe violations", async () => {
    const { container } = render(wrap(<PulsePositions position="L-guan" />, "zh-Hant"));
    expect(screen.getAllByText("寸", { selector: "text" })).toHaveLength(2);
    expect(screen.getAllByText(/關/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("img", { name: /已選：左關。$/ })).toBeInTheDocument();
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
