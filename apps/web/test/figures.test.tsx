import { readdirSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { BagangAxes, SignedBars } from "../src/screens/result/figures/BarFigures.tsx";
import { FigureBlock } from "../src/screens/result/figures/FigureBlock.tsx";
import { FivePhaseRadar } from "../src/screens/result/figures/FivePhaseRadar.tsx";
import { along, angleOf, CENTER, labelOf, pointOf, polygonOf, radiusOf, RADIUS, ringOf } from "../src/screens/result/figures/geometry.ts";
import { OffsetCompare } from "../src/screens/result/figures/OffsetCompare.tsx";
import { OrganHeat } from "../src/screens/result/figures/OrganHeat.tsx";

const vec = (o: Partial<Record<Element, number>> = {}): Record<Element, number> => ({ 木: 0, 火: 0, 土: 0, 金: 0, 水: 0, ...o });
const wrap = (ui: ReactNode, lang: "en" | "zh-Hant" = "en"): ReactNode => <I18nProvider lang={lang} setLang={() => undefined}>{ui}</I18nProvider>;

describe("figure geometry", () => {
  it("木 is at the top and the five phases follow clockwise in the order of generation", () => {
    expect(angleOf(0)).toBeCloseTo(-Math.PI / 2, 12);
    const [x, y] = pointOf(0, 3);
    expect(x).toBeCloseTo(CENTER, 9);
    expect(y).toBeCloseTo(CENTER - RADIUS, 9);
    const [x1, y1] = pointOf(1, 3);                       // 火: upper right
    expect(x1).toBeGreaterThan(CENTER);
    expect(y1).toBeLessThan(CENTER);
    const [x2] = pointOf(4, 3);                           // 水: upper left
    expect(x2).toBeLessThan(CENTER);
  });

  it("the radius is linear in the value: −3 at the centre, 0 on the half ring, +3 on the rim, clamped beyond", () => {
    expect(radiusOf(-3)).toBe(0);
    expect(radiusOf(0)).toBeCloseTo(RADIUS / 2, 12);
    expect(radiusOf(3)).toBe(RADIUS);
    expect(radiusOf(9)).toBe(RADIUS);
    expect(radiusOf(-9)).toBe(0);
    expect(radiusOf(1.5)).toBeCloseTo(0.75 * RADIUS, 12);
  });

  it("a polygon has one vertex per element and rings are regular", () => {
    expect(polygonOf(vec()).split(" ")).toHaveLength(5);
    const ring = ringOf(0).split(" ").map((p) => p.split(",").map(Number) as [number, number]);
    const radii = ring.map(([x, y]) => Math.hypot(x - CENTER, y - CENTER));
    for (const r of radii) expect(r).toBeCloseTo(RADIUS / 2, 0);
  });

  it("labels sit outside the rim and align away from the centre", () => {
    expect(labelOf(0).anchor).toBe("middle");
    expect(labelOf(1).anchor).toBe("start");
    expect(labelOf(3).anchor).toBe("end");
    expect(along(0, -1, 1, 100)).toBe(50);
    expect(along(5, -1, 1, 100)).toBe(100);
  });
});

describe("FivePhaseRadar", () => {
  it("is an image named by its title and described in words; the polygon follows the data", () => {
    render(wrap(<FivePhaseRadar title="Radar" series={[{ label: "typical", values: vec({ 土: -2 }), marker: "circle" }]} />));
    const img = screen.getByRole("img", { name: "Radar" });
    expect(img).toHaveAccessibleDescription("Compared with a typical healthy person, the clearest deviation is in Earth: low.");
    const poly = img.querySelectorAll("polygon")[4]!;                                       // after the four rings: the series polygon
    expect(poly.getAttribute("points")).toBe(polygonOf(vec({ 土: -2 })));
    expect(within(img as unknown as HTMLElement).getByText("Earth")).toBeInTheDocument();
  });

  it("series differ by line style and marker, and the legend names them with the same symbol", () => {
    render(wrap(<FivePhaseRadar title="Radar" series={[{ label: "typical", values: vec(), marker: "circle" }, { label: "usual", values: vec({ 木: 1 }), dash: "6 4", marker: "square" }]} />));
    const img = screen.getByRole("img", { name: "Radar" });
    expect(img.querySelectorAll("rect").length).toBe(5);                                    // square markers of the second series
    expect(img.querySelectorAll("circle").length).toBe(5);
    expect(img.innerHTML).toContain('stroke-dasharray="6 4"');
    expect(screen.getByText(/● typical/)).toBeInTheDocument();
    expect(screen.getByText(/■ usual/)).toBeInTheDocument();
    expect(screen.getByText(/typical healthy person \(dashed ring\)/)).toBeInTheDocument();
  });

  it("with no deviation it says so", () => {
    render(wrap(<FivePhaseRadar title="Radar" series={[{ label: "t", values: vec(), marker: "circle" }]} />));
    expect(screen.getByRole("img", { name: "Radar" })).toHaveAccessibleDescription("Compared with a typical healthy person there is no clear deviation.");
  });
});

describe("bars, axes, heat map and offsets", () => {
  it("SignedBars: one bar per row, direction and a signed number say which way", () => {
    const { container } = render(wrap(<SignedBars title="Bars" description="d" rows={[{ label: "Cold", value: 1.5 }, { label: "Wind", value: -1 }, { label: "Dry", value: 0 }]} />));
    expect(screen.getByRole("img", { name: "Bars" })).toHaveAccessibleDescription("d");
    const texts = [...container.querySelectorAll("text")].map((x) => x.textContent);
    expect(texts).toEqual(expect.arrayContaining(["Cold", "+1.5", "Wind", "−1.0", "Dry", "0.0"]));
  });

  it("BagangAxes: a diamond per axis between named ends", () => {
    const { container } = render(wrap(<BagangAxes title="Axes" description="d" axes={[{ key: "coldHeat", value: 0.5, min: -1, max: 1 }, { key: "exterior", value: 0, min: 0, max: 1 }]} />));
    expect(container.querySelectorAll("polygon")).toHaveLength(2);
    expect(screen.getByText("cold")).toBeInTheDocument();
    expect(screen.getByText("heat")).toBeInTheDocument();
    expect(screen.getByText("exterior")).toBeInTheDocument();
  });

  it("OrganHeat: a full ten-organ table; ▲ / ▼ and the number carry the sign, a dot means normal", () => {
    render(wrap(<OrganHeat caption="Organs" observed={{ "脾.qi": -1.9, "肝.stasis": 1.2 }} />));
    const table = within(screen.getByRole("table", { name: "Organs" }));
    expect(table.getAllByRole("row")).toHaveLength(11);
    expect(table.getByRole("row", { name: /^Spleen/ })).toHaveTextContent("▼ −1.9");
    expect(table.getByRole("row", { name: /^Liver/ })).toHaveTextContent("▲ +1.2");
    expect(table.getAllByText("·")).toHaveLength(48);
    expect(screen.getByText(/▲ above normal/)).toBeInTheDocument();
  });

  it("OffsetCompare: solid and outlined bars per element with the alignment glyph", () => {
    const { container } = render(wrap(<OffsetCompare title="Offsets" description="d" primary={vec({ 土: -1.2 })} personal={vec({ 土: 0.4 })} alignment={{ 木: "neutral", 火: "neutral", 土: "opposed", 金: "aligned", 水: "neutral" }} />));
    const texts = [...container.querySelectorAll("text")].map((x) => x.textContent);
    expect(texts).toEqual(expect.arrayContaining(["−1.2", "+0.4 ✕", "0.0 ✓", "Earth"]));
    expect(container.innerHTML).toContain('stroke-dasharray="4 3"');
  });

  it("FigureBlock: the sentence, the figure and the table twin behind a disclosure", () => {
    render(wrap(<FigureBlock summary="In one sentence." figure={<svg role="img" aria-label="fig" />} table={<table><caption>twin</caption><tbody><tr><td>1</td></tr></tbody></table>} />));
    expect(screen.getByText("In one sentence.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "fig" })).toBeInTheDocument();
    const details = screen.getByText("View as table").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByRole("table", { name: "twin" })).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations (%s)", async (lang) => {
    const { container } = render(wrap(<div>
      <FigureBlock summary="s" figure={<FivePhaseRadar title="Radar" series={[{ label: "t", values: vec({ 土: -1 }), marker: "circle" }]} />} table={<p>t</p>} />
      <SignedBars title="Bars" description="d" rows={[{ label: "Cold", value: 1 }]} />
      <BagangAxes title="Axes" description="d" axes={[{ key: "coldHeat", value: 0, min: -1, max: 1 }]} />
      <OrganHeat caption="Organs" observed={{ "脾.qi": -1 }} />
      <OffsetCompare title="Offsets" description="d" primary={vec()} personal={vec()} alignment={{ 木: "neutral", 火: "neutral", 土: "neutral", 金: "neutral", 水: "neutral" }} />
    </div>, lang));
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("never encodes magnitude or sign in red/green or in the five-phase identity colours (UX spec §6.2)", () => {
    const dir = resolvePath(process.cwd(), "src/screens/result/figures");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".tsx"))) {
      const src = readFileSync(resolvePath(dir, f), "utf8");
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);                 // only tokens, no hard-coded colours
      expect(src, f).not.toMatch(/\bred\b|\bgreen\b|--wx-|--danger|--notice/);
    }
    expect([...ELEMENTS]).toHaveLength(5);
  });
});
