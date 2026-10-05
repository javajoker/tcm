// Which region's numbers: the choice, else the device's time zone, else the generic row (docs/post-mvp/design/tap-tempo-and-regions.md §2.2).
import { describe, expect, it } from "vitest";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { deviceTimeZone, resolveRegion } from "../src/screens/screening/region.ts";

const regions = indexKnowledgeBase(rawChunksFromDisk("dev")).emergency.regions;

describe("resolveRegion", () => {
  it("a choice wins over the time zone", () => {
    expect(resolveRegion(regions, "HK", "Asia/Taipei")).toEqual({ id: "HK", source: "choice" });
    expect(resolveRegion(regions, "OTHER", "Asia/Taipei")).toEqual({ id: "OTHER", source: "choice" });          // choosing "other or not sure" is a choice too
  });

  it("without a choice the device's time zone selects the region", () => {
    expect(resolveRegion(regions, undefined, "Asia/Taipei")).toEqual({ id: "TW", source: "time-zone" });
    expect(resolveRegion(regions, undefined, "America/Los_Angeles")).toEqual({ id: "US", source: "time-zone" });
    expect(resolveRegion(regions, undefined, "Australia/Perth")).toEqual({ id: "AU", source: "time-zone" });
    expect(resolveRegion(regions, undefined, "Europe/Paris")).toEqual({ id: "EU", source: "time-zone" });
    expect(resolveRegion(regions, undefined, "Asia/Urumqi")).toEqual({ id: "CN", source: "time-zone" });
  });

  it("with neither there is no default: the generic row", () => {
    expect(resolveRegion(regions, undefined, "Atlantic/Reykjavik")).toEqual({ id: "OTHER", source: "none" });
    expect(resolveRegion(regions, undefined, undefined)).toEqual({ id: "OTHER", source: "none" });
    expect(resolveRegion(regions, undefined, "Asia/Taipei ").source).toBe("none");          // exact IANA names only
  });

  it("a choice the build does not carry is not a choice", () => {
    const publicBuild = regions.filter((r) => r.id === "OTHER");
    expect(resolveRegion(publicBuild, "TW", "Asia/Taipei")).toEqual({ id: "OTHER", source: "none" });
    expect(resolveRegion(regions, "ZZ", "Asia/Hong_Kong")).toEqual({ id: "HK", source: "time-zone" });
  });

  it("never picks a region by anything but a listed zone", () => {
    for (const r of regions) for (const z of r.timezones) expect(resolveRegion(regions, undefined, z).id, z).toBe(r.id);
  });
});

describe("deviceTimeZone", () => {
  it("reads the zone of the device (the tests run as a device in Taiwan)", () => {
    expect(deviceTimeZone()).toBe("Asia/Taipei");
  });
});
