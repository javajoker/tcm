// Reference panel for the worked example (used by example_pipeline.py). Prints JSON.
import { buildChart, buildBase, buildReferencePanel, innateProfile, toJulianDay, ELEMENTS } from "../../packages/wuxing/src/index.ts";
const chart = buildChart({ year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 });
const base = buildBase(chart);
const jd = toJulianDay({ year: 2026, month: 10, day: 3, hour: 12, minute: 0, second: 0 });
const panel = buildReferencePanel(base, jd);
const ip = innateProfile(base);
process.stdout.write(JSON.stringify({ total: panel.total, components: panel.components, climate: panel.climate, season: panel.season.name, trace: panel.trace, shares: ip.shares, bands: ip.band }));
