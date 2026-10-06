// The season model switch (docs/post-mvp/design/five-phase-extensions.md §7; task PM-29): development profile only — Settings imports it behind a compile-time profile check, so a release build contains neither the
// control nor these words (the release check refuses "DEV · "). A release declares one model on every result and offers no switch (Q11 stays decided until calibration). A result made with the other model
// carries its own stamp of the parameters, so it starts a series of its own in the history. Strings are developer-facing and deliberately not localised.
import type { ReactNode } from "react";
import { effectiveSeasonModel } from "../app/seasons.ts";
import { useApp } from "../app/store.tsx";
import { SEASON_MODELS } from "../storage/types.ts";
import { SegmentedControl } from "../ui/index.ts";

const LABEL = { changxia: "changxia — late summer as a season of its own", tuwang18: "tuwang18 — earth phase on the last 18 days of each season" } as const;

export function SeasonModelSwitch(): ReactNode {
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <div id="dev-season-model">
      <SegmentedControl legend="DEV · Season model" value={effectiveSeasonModel(prefs)} onChange={(v) => setPrefs({ seasonModel: v })} options={SEASON_MODELS.map((v) => ({ value: v, label: LABEL[v] }))} />
      <p className="muted" style={{ margin: 0 }}>Results made from now on use this model and are stamped with it (the parameter stamp ends “+tuwang18”); results already saved keep theirs. Not kept in a backup.</p>
    </div>
  );
}
